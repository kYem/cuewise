//! Posture tracking. Spawns the Swift posture sidecar (an externalBin) and relays
//! its newline-delimited `PostureSample` JSON to the webview as `posture://sample`
//! events; control commands go to the sidecar's stdin. Opt-in — the sidecar (and
//! thus the camera) only runs while tracking is on.

use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

use crate::error::Error;

// Basename only — `externalBin` in tauri.conf.json points at `binaries/…`, but the
// runtime resolves the sidecar next to the app executable by its bare name.
const SIDECAR: &str = "posture-sidecar";
const SAMPLE_EVENT: &str = "posture://sample";
const STOPPED_EVENT: &str = "posture://stopped";

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
    let mut guard = state.child.lock().map_err(|_| Error::StatePoisoned)?;
    if guard.is_some() {
        return Ok(());
    }

    let (mut rx, child) = app
        .shell()
        .sidecar(SIDECAR)
        .map_err(|e| Error::Sidecar(e.to_string()))?
        .spawn()
        .map_err(|e| Error::Sidecar(e.to_string()))?;

    *guard = Some(child);
    drop(guard); // release before the async relay task, which also locks on Terminated

    let task_app = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
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

/// Snapshot the current posture as the "sitting well" baseline.
#[tauri::command]
pub fn calibrate_posture(state: State<'_, PostureState>) -> Result<(), Error> {
    let mut guard = state.child.lock().map_err(|_| Error::StatePoisoned)?;
    if let Some(child) = guard.as_mut() {
        child
            .write(b"calibrate\n")
            .map_err(|e| Error::Sidecar(e.to_string()))?;
    }
    Ok(())
}

/// Stop tracking: ask the sidecar to quit, then drop its handle so the camera turns off.
#[tauri::command]
pub fn stop_posture(state: State<'_, PostureState>) -> Result<(), Error> {
    let mut guard = state.child.lock().map_err(|_| Error::StatePoisoned)?;
    if let Some(mut child) = guard.take() {
        let _ = child.write(b"quit\n");
        let _ = child.kill();
    }
    Ok(())
}
