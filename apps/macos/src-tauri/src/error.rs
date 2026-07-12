//! Crate-wide error type for `#[tauri::command]` fns. Commands return this
//! instead of stringifying with `.to_string()`, so the frontend gets a
//! `{ kind, message }` object it can match on rather than a bare string.

use std::sync::PoisonError;

use serde::{ser::SerializeStruct, Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// The posture sidecar failed to launch, or a command sent to it (write/kill)
    /// failed. `tauri_plugin_shell::Error` covers spawn, write, and kill alike.
    #[error("posture sidecar failed: {0}")]
    Sidecar(#[from] tauri_plugin_shell::Error),
    /// A shared `Mutex` was poisoned by a thread that panicked while holding it.
    #[error("internal state is poisoned")]
    StatePoisoned,
}

impl Error {
    fn kind(&self) -> &'static str {
        match self {
            Error::Sidecar(_) => "sidecar",
            Error::StatePoisoned => "state_poisoned",
        }
    }
}

/// Log a poisoned lock (implies an earlier panic while holding it) before
/// converting it to the wire error, so a panic-recovery leaves a trace instead of
/// vanishing silently.
pub fn log_poison<T>(err: PoisonError<T>) -> Error {
    eprintln!("state lock poisoned: {err}");
    Error::StatePoisoned
}

// Tauri v2's documented pattern for command errors: implement `Serialize`
// directly rather than deriving it, so the wire shape (here, a tagged
// `{ kind, message }` struct) is decoupled from the `Debug`/`Display` used
// for logs and `thiserror`'s messages.
impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("Error", 2)?;
        state.serialize_field("kind", self.kind())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}
