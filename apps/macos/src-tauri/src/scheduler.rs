//! Native wake scheduler. Timers live here in the Rust core rather than the
//! webview so they keep firing while the window is hidden (where the webview's
//! own `setTimeout`s would be throttled). When a wake fires we emit
//! `scheduler://fire` with its id; the JS host looks up what to deliver.
//!
//! Wakes are in-memory, so they don't survive a restart — the frontend re-arms
//! pending reminders from storage on startup (see the `persistsAcrossRestarts`
//! scheduler capability).

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::async_runtime::{spawn, JoinHandle};
use tauri::{AppHandle, Emitter, Manager, State};

/// Event the frontend listens on; payload is the fired wake's id.
const FIRE_EVENT: &str = "scheduler://fire";

/// Pending wakes keyed by id. Each entry carries an epoch so a task that fires
/// only removes itself when it's still the current wake for that id — a
/// reschedule replaces the entry (aborting the old task) and bumps the epoch.
#[derive(Default)]
pub struct SchedulerState {
    tasks: Mutex<HashMap<String, (u64, JoinHandle<()>)>>,
    next_epoch: AtomicU64,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or(0)
}

/// Arm (or re-arm) a wake for `id` at `when_ms` (epoch millis). A past time fires
/// as soon as possible. Re-arming the same id replaces the previous wake.
#[tauri::command]
pub fn schedule_wake(app: AppHandle, state: State<'_, SchedulerState>, id: String, when_ms: i64) {
    let epoch = state.next_epoch.fetch_add(1, Ordering::Relaxed);
    let delay = Duration::from_millis((when_ms - now_ms()).max(0) as u64);

    let task_app = app.clone();
    let task_id = id.clone();
    let handle = spawn(async move {
        tokio::time::sleep(delay).await;
        let _ = task_app.emit(FIRE_EVENT, &task_id);
        if let Some(state) = task_app.try_state::<SchedulerState>() {
            if let Ok(mut tasks) = state.tasks.lock() {
                // Only clear our own entry; a reschedule may already have replaced it.
                if tasks.get(&task_id).map(|(entry_epoch, _)| *entry_epoch) == Some(epoch) {
                    tasks.remove(&task_id);
                }
            }
        }
    });

    if let Ok(mut tasks) = state.tasks.lock() {
        if let Some((_, previous)) = tasks.insert(id, (epoch, handle)) {
            previous.abort();
        }
    }
}

/// Cancel a pending wake. A no-op if it already fired or was never scheduled.
#[tauri::command]
pub fn cancel_wake(state: State<'_, SchedulerState>, id: String) {
    if let Ok(mut tasks) = state.tasks.lock() {
        if let Some((_, handle)) = tasks.remove(&id) {
            handle.abort();
        }
    }
}
