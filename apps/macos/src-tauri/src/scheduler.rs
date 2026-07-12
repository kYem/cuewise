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

use crate::error::{log_poison, Error};

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

impl SchedulerState {
    /// Allocate a fresh epoch to tag a new wake, so its eventual fire can tell
    /// whether it's still the current entry for its id.
    fn next_epoch(&self) -> u64 {
        self.next_epoch.fetch_add(1, Ordering::Relaxed)
    }

    /// Arm `id` at `epoch`, replacing whatever was previously scheduled for `id`.
    /// Aborts the replaced task in the same locked section — folded in here (not
    /// left to the caller) so a reschedule can never forget to abort the old task
    /// and leak a live timer. `Err` only if the lock is poisoned.
    fn insert(&self, id: String, epoch: u64, handle: JoinHandle<()>) -> Result<(), Error> {
        let mut tasks = self.tasks.lock().map_err(log_poison)?;
        if let Some((_, previous)) = tasks.insert(id, (epoch, handle)) {
            previous.abort();
        }
        Ok(())
    }

    /// Remove `id`'s entry only if it's still at `epoch` — i.e. no reschedule
    /// raced in since this wake was armed. Returns whether it removed anything.
    fn remove_if_current(&self, id: &str, epoch: u64) -> bool {
        let Ok(mut tasks) = self.tasks.lock() else {
            eprintln!("scheduler: state lock poisoned while clearing a fired wake for {id}");
            return false;
        };
        if tasks.get(id).map(|(entry_epoch, _)| *entry_epoch) != Some(epoch) {
            return false;
        }
        tasks.remove(id);
        true
    }

    /// Cancel a pending wake, aborting its task in the same locked section. A
    /// no-op if it already fired or was never scheduled. `Err` only if the lock
    /// is poisoned.
    fn cancel(&self, id: &str) -> Result<(), Error> {
        let mut tasks = self.tasks.lock().map_err(log_poison)?;
        if let Some((_, handle)) = tasks.remove(id) {
            handle.abort();
        }
        Ok(())
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or(0)
}

/// Sleep duration until `when_ms` (epoch millis), given the current time
/// `now_ms`. A `when_ms` already in the past clamps to zero (fires ASAP).
fn delay_until(when_ms: i64, now_ms: i64) -> Duration {
    Duration::from_millis((when_ms - now_ms).max(0) as u64)
}

/// Arm (or re-arm) a wake for `id` at `when_ms` (epoch millis). A past time fires
/// as soon as possible. Re-arming the same id replaces the previous wake.
#[tauri::command]
pub fn schedule_wake(
    app: AppHandle,
    state: State<'_, SchedulerState>,
    id: String,
    when_ms: i64,
) -> Result<(), Error> {
    let epoch = state.next_epoch();
    let delay = delay_until(when_ms, now_ms());

    let task_app = app.clone();
    let task_id = id.clone();
    let handle = spawn(async move {
        tokio::time::sleep(delay).await;
        // The frontend can't otherwise learn a reminder didn't reach it — this is
        // the only trace of a delivery failure.
        if let Err(e) = task_app.emit(FIRE_EVENT, &task_id) {
            eprintln!("scheduler: failed to emit fire event for {task_id}: {e}");
        }
        if let Some(state) = task_app.try_state::<SchedulerState>() {
            state.remove_if_current(&task_id, epoch);
        }
    });

    state.insert(id, epoch, handle)
}

/// Cancel a pending wake. A no-op if it already fired or was never scheduled.
#[tauri::command]
pub fn cancel_wake(state: State<'_, SchedulerState>, id: String) -> Result<(), Error> {
    state.cancel(&id)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A cheap, real `JoinHandle<()>` for entries under test — `SchedulerState`
    /// stores Tauri's async-runtime handle type, not a mock-friendly trait object.
    fn handle() -> JoinHandle<()> {
        spawn(async {})
    }

    #[test]
    fn rearming_replaces_entry_and_bumps_epoch() {
        let state = SchedulerState::default();

        let epoch1 = state.next_epoch();
        assert!(state.insert("id".into(), epoch1, handle()).is_ok());

        let epoch2 = state.next_epoch();
        assert!(epoch2 > epoch1, "next_epoch must bump on every call");

        assert!(
            state.insert("id".into(), epoch2, handle()).is_ok(),
            "re-arming an existing id must succeed"
        );
    }

    #[test]
    fn stale_epoch_fire_does_not_remove_current_entry() {
        let state = SchedulerState::default();

        let epoch1 = state.next_epoch();
        assert!(state.insert("id".into(), epoch1, handle()).is_ok());
        let epoch2 = state.next_epoch();
        assert!(state.insert("id".into(), epoch2, handle()).is_ok()); // reschedule before epoch1's task fires

        assert!(
            !state.remove_if_current("id", epoch1),
            "a stale fire must not touch the current entry"
        );
        assert!(
            state.remove_if_current("id", epoch2),
            "the current entry must still be pending after the stale fire"
        );
    }

    #[test]
    fn current_epoch_fire_removes_entry() {
        let state = SchedulerState::default();

        let epoch = state.next_epoch();
        assert!(state.insert("id".into(), epoch, handle()).is_ok());

        assert!(state.remove_if_current("id", epoch));
        assert!(
            !state.remove_if_current("id", epoch),
            "the entry is already gone, so a repeat fire is a no-op"
        );
    }

    #[test]
    fn cancel_removes_entry() {
        let state = SchedulerState::default();

        let epoch = state.next_epoch();
        assert!(state.insert("id".into(), epoch, handle()).is_ok());

        assert!(state.cancel("id").is_ok());
        assert!(
            !state.remove_if_current("id", epoch),
            "cancel must remove the entry"
        );
        // Cancelling again is a no-op, not an error.
        assert!(state.cancel("id").is_ok());
    }

    #[test]
    fn cancel_unknown_id_is_a_noop() {
        let state = SchedulerState::default();
        assert!(state.cancel("never-scheduled").is_ok());
    }

    #[test]
    fn delay_until_clamps_past_due_time_to_zero() {
        assert_eq!(delay_until(100, 200), Duration::ZERO);
        assert_eq!(delay_until(200, 200), Duration::ZERO);
    }

    #[test]
    fn delay_until_returns_remaining_time_for_a_future_wake() {
        assert_eq!(delay_until(300, 200), Duration::from_millis(100));
    }
}
