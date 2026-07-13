//! Posture tracking. Spawns the Swift posture sidecar (an externalBin) and relays
//! its newline-delimited `PostureSample` JSON to the webview as `posture://sample`
//! events; control commands go to the sidecar's stdin. Opt-in — the sidecar (and
//! thus the camera) only runs while tracking is on.

use std::sync::atomic::{AtomicU64, Ordering};
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
// Once frames have flowed (2s cadence), a hung-but-alive sidecar is killed after this
// bound — otherwise the camera stays on with every UI surface silently frozen. tokio
// Instants don't tick during system sleep, so sleep alone can't trip it; the slack
// absorbs camera re-init hiccups around wake.
const LIVENESS_TIMEOUT: Duration = Duration::from_secs(15);

// The slot pairs the child with its session generation so a stale relay task (a
// Terminated event straggling in after a stop→start) can never touch the successor.
type TrackedChild = (u64, CommandChild);

#[derive(Default)]
pub struct PostureState {
    child: Mutex<Option<TrackedChild>>,
    generation: AtomicU64,
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

    let generation = state.generation.fetch_add(1, Ordering::Relaxed) + 1;
    *guard = Some((generation, child));
    drop(guard); // release before the async relay task, which also locks on Terminated

    let task_app = app.clone();
    tauri::async_runtime::spawn(async move {
        // The deadline lives in the Rust core, not the webview (same reason as
        // scheduler.rs): hidden-to-tray — this app's resident mode — throttles JS timers.
        // Only stdout rolls it — stderr chatter can't keep a frameless sidecar alive.
        let mut deadline = tokio::time::Instant::now() + FIRST_FRAME_TIMEOUT;
        loop {
            let received = match next_sidecar_event(&mut rx, deadline).await {
                Ok(received) => received,
                Err(_elapsed) => {
                    // Alive but mute: kill it so the camera turns off, then report a
                    // normal stop so the webview runs its existing teardown.
                    eprintln!("posture sidecar: no output within the liveness deadline; killing");
                    if reap_owned_child(&task_app, generation) {
                        let _ = task_app.emit(STOPPED_EVENT, ());
                    }
                    break;
                }
            };
            let Some(event) = received else {
                break;
            };
            match event {
                CommandEvent::Stdout(bytes) => {
                    // Any stdout line proves the pipeline is alive — roll the bound.
                    deadline = tokio::time::Instant::now() + LIVENESS_TIMEOUT;
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
                    // Only the owning session clears the slot and reports the stop —
                    // a straggling Terminated must not tear down a successor session.
                    if release_owned_child(&task_app, generation) {
                        let _ = task_app.emit(STOPPED_EVENT, ());
                    }
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}

/// Next relay event, bounded by the current liveness deadline — a mute sidecar
/// (never produced a frame, or hung mid-session) can't hold the camera open.
async fn next_sidecar_event<T>(
    rx: &mut tauri::async_runtime::Receiver<T>,
    deadline: tokio::time::Instant,
) -> Result<Option<T>, tokio::time::error::Elapsed> {
    tokio::time::timeout_at(deadline, rx.recv()).await
}

// Pure ownership check: the slot still holds this session's child.
fn owns<T>(entry: &Option<(u64, T)>, generation: u64) -> bool {
    matches!(entry, Some((held, _)) if *held == generation)
}

// Take the child out of the slot only if this session still owns it.
fn take_owned_child(app: &AppHandle, generation: u64) -> Option<CommandChild> {
    let state = app.try_state::<PostureState>()?;
    let mut guard = state.child.lock().ok()?;
    if owns(&guard, generation) {
        return guard.take().map(|(_, child)| child);
    }
    None
}

// Watchdog path: the process is presumed alive, so taking the slot must kill it.
fn reap_owned_child(app: &AppHandle, generation: u64) -> bool {
    match take_owned_child(app, generation) {
        Some(child) => {
            if let Err(e) = child.kill() {
                eprintln!("posture sidecar: watchdog kill failed: {e}");
            }
            true
        }
        None => false,
    }
}

// Exit path: the process already terminated; just release the stale handle.
fn release_owned_child(app: &AppHandle, generation: u64) -> bool {
    take_owned_child(app, generation).is_some()
}

/// Snapshot the current posture as the "sitting well" baseline.
#[tauri::command]
pub fn calibrate_posture(state: State<'_, PostureState>) -> Result<(), Error> {
    let mut guard = state.child.lock().map_err(log_poison)?;
    if let Some((_, child)) = guard.as_mut() {
        child.write(b"calibrate\n")?;
    }
    Ok(())
}

// Keep in sync with `SensitivityPreset` (PostureAnalyzer.swift) and
// `NudgeSensitivity` (posture-controller.ts) — a Swift-side miss fails silently.
const KNOWN_PRESETS: [&str; 3] = ["strict", "balanced", "relaxed"];

// Whitelist before writing — the stdin line protocol must never carry an
// arbitrary webview string.
fn validate_preset(preset: &str) -> Result<(), Error> {
    if KNOWN_PRESETS.contains(&preset) {
        Ok(())
    } else {
        Err(Error::UnknownPreset)
    }
}

/// Apply a sensitivity preset to the running sidecar (no-op while stopped). The
/// webview re-sends the persisted preset after every start — a fresh sidecar
/// process boots with the default thresholds.
#[tauri::command]
pub fn set_posture_sensitivity(
    state: State<'_, PostureState>,
    preset: String,
) -> Result<(), Error> {
    validate_preset(&preset)?;
    let mut guard = state.child.lock().map_err(log_poison)?;
    if let Some((_, child)) = guard.as_mut() {
        child.write(format!("sensitivity {preset}\n").as_bytes())?;
    } else {
        // The webview only calls this while it believes tracking is on — a miss
        // here is a start/stop race worth a trace.
        eprintln!("posture sidecar: sensitivity {preset} dropped — no child running");
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
    if let Some((_, mut child)) = guard.take() {
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
    fn ownership_is_generation_scoped() {
        // The straggler cases: a newer session holds the slot, or the user stopped.
        assert!(owns(&Some((3_u64, ())), 3));
        assert!(!owns(&Some((4_u64, ())), 3));
        assert!(!owns::<()>(&None, 3));
    }

    #[test]
    fn known_presets_stay_line_protocol_safe() {
        // Presets are written verbatim into a newline-delimited stdin protocol —
        // a newline in one would smuggle in a second command; keep them bare words.
        for preset in KNOWN_PRESETS {
            assert!(
                preset.chars().all(|c| c.is_ascii_lowercase()),
                "preset {preset:?} must be a bare lowercase word"
            );
        }
        // Pin the list: adding a preset must route through this file, whose sync
        // comment names the Swift and TS siblings.
        assert_eq!(KNOWN_PRESETS, ["strict", "balanced", "relaxed"]);
    }

    #[test]
    fn preset_validation_rejects_anything_off_the_whitelist() {
        for preset in KNOWN_PRESETS {
            assert!(validate_preset(preset).is_ok());
        }
        for bad in ["ultra", "", "strict\nquit", "Strict", "sensitivity strict"] {
            assert!(
                matches!(validate_preset(bad), Err(Error::UnknownPreset)),
                "{bad:?} must be rejected before reaching the sidecar's stdin"
            );
        }
    }

    #[test]
    fn bounded_wait_elapses_when_nothing_arrives() {
        let (_tx, mut rx) = channel::<u8>(4);
        block_on(async move {
            let result = next_sidecar_event(&mut rx, Instant::now() + CAP).await;
            assert!(result.is_err(), "a mute channel must trip the deadline");
        });
    }

    #[test]
    fn bounded_wait_delivers_an_event_inside_the_deadline() {
        let (tx, mut rx) = channel::<u8>(4);
        block_on(async move {
            tx.send(7).await.expect("send");
            let result = next_sidecar_event(&mut rx, Instant::now() + CAP).await;
            assert_eq!(result.expect("within deadline"), Some(7));
        });
    }

    #[test]
    fn the_deadline_is_absolute_not_per_event() {
        let (tx, mut rx) = channel::<u8>(4);
        block_on(async move {
            let deadline = Instant::now() + CAP;
            tx.send(1).await.expect("send");
            let first = next_sidecar_event(&mut rx, deadline).await;
            assert_eq!(first.expect("first event within deadline"), Some(1));

            // Reusing the same deadline: stderr-style chatter must not extend it.
            // Only the relay loop rolls it, and only on stdout.
            let second = next_sidecar_event(&mut rx, deadline).await;
            assert!(
                second.is_err(),
                "an event mid-window must not push the deadline out"
            );
        });
    }

    #[test]
    fn a_rolled_deadline_keeps_a_live_channel_waiting() {
        let (tx, mut rx) = channel::<u8>(4);
        block_on(async move {
            spawn(async move {
                tokio::time::sleep(CAP / 2).await;
                let _ = tx.send(9).await;
            });
            // The loop's stdout arm re-derives the deadline from now — a frame that
            // lands inside the fresh window must still be delivered, not reaped.
            let result = next_sidecar_event(&mut rx, Instant::now() + CAP).await;
            assert_eq!(result.expect("inside the rolled window"), Some(9));
        });
    }

    #[test]
    fn closed_channel_ends_the_bounded_wait_cleanly() {
        let (tx, mut rx) = channel::<u8>(4);
        block_on(async move {
            drop(tx);
            let result = next_sidecar_event(&mut rx, Instant::now() + CAP).await;
            assert_eq!(result.expect("closed, not elapsed"), None);
        });
    }
}
