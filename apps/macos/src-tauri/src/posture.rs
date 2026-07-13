//! Posture tracking. Spawns the Swift posture sidecar (an externalBin) and relays
//! its newline-delimited `PostureSample` JSON to the webview as `posture://sample`
//! events; control commands go to the sidecar's stdin. Opt-in — the sidecar (and
//! thus the camera) only runs while tracking is on.

use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

use crate::error::{log_poison, Error};

// Basename only — `externalBin` in tauri.conf.json points at `binaries/…`, but the
// runtime resolves the sidecar next to the app executable by its bare name.
const SIDECAR: &str = "posture-sidecar";
const SAMPLE_EVENT: &str = "posture://sample";
const STOPPED_EVENT: &str = "posture://stopped";
// Cap on a spawned-but-mute sidecar's silence before we kill it (camera off). Generous
// because the first-run permission prompt delays the first frame (camera off till granted).
const FIRST_FRAME_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Default)]
pub struct PostureState {
    child: Mutex<Option<CommandChild>>,
}

/// Start tracking: spawn the sidecar and stream its samples to the webview. No-op
/// if it's already running. The camera prompt is raised by the sidecar on start.
#[tauri::command]
pub fn start_posture(app: AppHandle, state: State<'_, PostureState>) -> Result<(), Error> {
    // Hold the lock across the whole check-spawn-store sequence. Otherwise a
    // stop_posture landing between the is_some() check and storing the child would
    // take() nothing, and the just-spawned sidecar (camera) would stay running.
    let mut guard = state.child.lock().map_err(log_poison)?;
    if guard.is_some() {
        return Ok(());
    }

    let (mut rx, child) = app.shell().sidecar(SIDECAR)?.spawn()?;

    *guard = Some(child);
    drop(guard); // release before the async relay task, which also locks on Terminated

    let task_app = app.clone();
    tauri::async_runtime::spawn(async move {
        // The deadline lives in the Rust core, not the webview (same reason as
        // scheduler.rs): hidden-to-tray — this app's resident mode — throttles JS timers.
        // Absolute since spawn, so stderr chatter can't keep extending it.
        let mut deadline = Some(tokio::time::Instant::now() + FIRST_FRAME_TIMEOUT);
        loop {
            let received = match next_sidecar_event(&mut rx, deadline).await {
                Ok(received) => received,
                Err(_elapsed) => {
                    // Spawned but mute: kill it so the camera turns off, then report a
                    // normal stop so the webview runs its existing teardown.
                    eprintln!(
                        "posture sidecar: no output within the first-frame deadline; killing"
                    );
                    kill_tracked_child(&task_app);
                    let _ = task_app.emit(STOPPED_EVENT, ());
                    break;
                }
            };
            let Some(event) = received else {
                break;
            };
            match event {
                CommandEvent::Stdout(bytes) => {
                    deadline = None; // first sample line proves the pipeline is alive
                    if let Ok(line) = String::from_utf8(bytes) {
                        let trimmed = line.trim();
                        if !trimmed.is_empty() {
                            let _ = task_app.emit(SAMPLE_EVENT, trimmed.to_string());
                        }
                    }
                }
                CommandEvent::Stderr(bytes) => {
                    if let Ok(line) = String::from_utf8(bytes) {
                        eprintln!("{}", line.trim_end());
                    }
                }
                CommandEvent::Error(_) | CommandEvent::Terminated(_) => {
                    if let Some(state) = task_app.try_state::<PostureState>() {
                        if let Ok(mut guard) = state.child.lock() {
                            *guard = None;
                        }
                    }
                    let _ = task_app.emit(STOPPED_EVENT, ());
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}

/// Next relay event; until the sidecar's first stdout line the wait is bounded by
/// an absolute deadline, so a spawned-but-mute sidecar can't hold the camera open.
async fn next_sidecar_event<T>(
    rx: &mut tauri::async_runtime::Receiver<T>,
    deadline: Option<tokio::time::Instant>,
) -> Result<Option<T>, tokio::time::error::Elapsed> {
    if let Some(deadline) = deadline {
        return tokio::time::timeout_at(deadline, rx.recv()).await;
    }
    Ok(rx.recv().await)
}

fn kill_tracked_child(app: &AppHandle) {
    if let Some(state) = app.try_state::<PostureState>() {
        if let Ok(mut guard) = state.child.lock() {
            if let Some(child) = guard.take() {
                if let Err(e) = child.kill() {
                    eprintln!("posture sidecar: watchdog kill failed: {e}");
                }
            }
        }
    }
}

/// Snapshot the current posture as the "sitting well" baseline.
#[tauri::command]
pub fn calibrate_posture(state: State<'_, PostureState>) -> Result<(), Error> {
    let mut guard = state.child.lock().map_err(log_poison)?;
    if let Some(child) = guard.as_mut() {
        child.write(b"calibrate\n")?;
    }
    Ok(())
}

const KNOWN_PRESETS: [&str; 3] = ["strict", "balanced", "relaxed"];

/// Apply a sensitivity preset to the running sidecar (no-op while stopped). The
/// webview re-sends the persisted preset after every start — a fresh sidecar
/// process boots with the default thresholds.
#[tauri::command]
pub fn set_posture_sensitivity(
    state: State<'_, PostureState>,
    preset: String,
) -> Result<(), Error> {
    // Whitelist before writing — the stdin line protocol must never carry an
    // arbitrary webview string.
    if !KNOWN_PRESETS.contains(&preset.as_str()) {
        return Err(Error::UnknownPreset);
    }
    let mut guard = state.child.lock().map_err(log_poison)?;
    if let Some(child) = guard.as_mut() {
        child.write(format!("sensitivity {preset}\n").as_bytes())?;
    }
    Ok(())
}

/// Stop tracking: ask the sidecar to quit, then kill it so the camera turns off.
/// The kill is a hard error — it's the last line of defense for turning the camera
/// off, so the caller (and the user, via the existing toast) must hear about a
/// failure rather than see tracking silently reported as stopped while it isn't.
#[tauri::command]
pub fn stop_posture(state: State<'_, PostureState>) -> Result<(), Error> {
    let mut guard = state.child.lock().map_err(log_poison)?;
    if let Some(mut child) = guard.take() {
        // Courtesy shutdown signal only — best-effort, since kill() below is the
        // real guarantee. Log rather than drop so a failure still leaves a trace.
        if let Err(e) = child.write(b"quit\n") {
            eprintln!("posture sidecar: quit write failed: {e}");
        }
        child.kill()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::async_runtime::{block_on, channel, spawn};
    use tokio::time::Instant;

    const CAP: Duration = Duration::from_millis(30);

    #[test]
    fn known_presets_stay_line_protocol_safe() {
        // Presets are written verbatim into a newline-delimited stdin protocol —
        // whitespace or control characters in one would smuggle in a second command.
        for preset in KNOWN_PRESETS {
            assert!(
                preset.chars().all(|c| c.is_ascii_lowercase()),
                "preset {preset:?} must be a bare lowercase word"
            );
        }
    }

    #[test]
    fn bounded_wait_elapses_when_nothing_arrives() {
        let (_tx, mut rx) = channel::<u8>(4);
        block_on(async move {
            let deadline = Some(Instant::now() + CAP);
            let result = next_sidecar_event(&mut rx, deadline).await;
            assert!(result.is_err(), "a mute channel must trip the deadline");
        });
    }

    #[test]
    fn bounded_wait_delivers_an_event_inside_the_deadline() {
        let (tx, mut rx) = channel::<u8>(4);
        block_on(async move {
            tx.send(7).await.expect("send");
            let result = next_sidecar_event(&mut rx, Some(Instant::now() + CAP)).await;
            assert_eq!(result.expect("within deadline"), Some(7));
        });
    }

    #[test]
    fn the_deadline_is_absolute_not_per_event() {
        let (tx, mut rx) = channel::<u8>(4);
        block_on(async move {
            let deadline = Some(Instant::now() + CAP);
            tx.send(1).await.expect("send");
            let first = next_sidecar_event(&mut rx, deadline).await;
            assert_eq!(first.expect("first event within deadline"), Some(1));

            // Reusing the same deadline: stderr-style chatter must not extend it.
            let second = next_sidecar_event(&mut rx, deadline).await;
            assert!(
                second.is_err(),
                "an event mid-window must not push the deadline out"
            );
        });
    }

    #[test]
    fn unbounded_wait_survives_past_the_cap() {
        let (tx, mut rx) = channel::<u8>(4);
        block_on(async move {
            spawn(async move {
                tokio::time::sleep(CAP * 3).await;
                let _ = tx.send(9).await;
            });
            let result = next_sidecar_event(&mut rx, None).await;
            assert_eq!(
                result.expect("no deadline once a frame was seen"),
                Some(9),
                "after the first stdout the wait must be uncapped"
            );
        });
    }

    #[test]
    fn closed_channel_ends_the_bounded_wait_cleanly() {
        let (tx, mut rx) = channel::<u8>(4);
        block_on(async move {
            drop(tx);
            let result = next_sidecar_event(&mut rx, Some(Instant::now() + CAP)).await;
            assert_eq!(result.expect("closed, not elapsed"), None);
        });
    }
}
