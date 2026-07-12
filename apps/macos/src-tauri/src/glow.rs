//! Screen-edge glow nudge overlays. The webview posture controller decides when
//! the glow shows (`posture-controller.ts`); these commands only manage one
//! transparent, click-through, always-on-top window per monitor, each rendering
//! the `#glow` route (a pure-CSS vignette — no stores, no listeners).

use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

use crate::error::Error;

const GLOW_LABEL_PREFIX: &str = "glow-";

fn glow_label(index: usize) -> String {
    format!("{GLOW_LABEL_PREFIX}{index}")
}

/// Which glow windows to create and which to close so exactly one exists per
/// connected monitor. Reconciled on every `show_glow`, which also absorbs
/// monitors being plugged/unplugged between nudges without display listeners.
fn plan_glow_windows(existing: &[String], monitor_count: usize) -> (Vec<String>, Vec<String>) {
    let desired: Vec<String> = (0..monitor_count).map(glow_label).collect();
    let create = desired
        .iter()
        .filter(|label| !existing.contains(label))
        .cloned()
        .collect();
    let close = existing
        .iter()
        .filter(|label| !desired.contains(label))
        .cloned()
        .collect();
    (create, close)
}

/// Show the glow on every monitor. Windows are created lazily on the first glow
/// and hidden (not destroyed) afterwards, so re-shows are cheap. Per-monitor
/// failures are logged and skipped — a missing glow on one display must not block
/// the others (the tray dot remains the fallback signal).
#[tauri::command]
pub fn show_glow(app: AppHandle) -> Result<(), Error> {
    let monitors = app.available_monitors()?;
    let existing: Vec<String> = app
        .webview_windows()
        .keys()
        .filter(|label| label.starts_with(GLOW_LABEL_PREFIX))
        .cloned()
        .collect();
    let (create, close) = plan_glow_windows(&existing, monitors.len());

    for label in close {
        if let Some(window) = app.get_webview_window(&label) {
            if let Err(e) = window.close() {
                eprintln!("glow: failed to close orphaned window {label}: {e}");
            }
        }
    }

    for label in create {
        if let Err(e) = build_glow_window(&app, &label) {
            eprintln!("glow: failed to create window {label}: {e}");
        }
    }

    for (index, monitor) in monitors.iter().enumerate() {
        let label = glow_label(index);
        let Some(window) = app.get_webview_window(&label) else {
            continue; // creation failed above; already logged
        };
        let position = monitor.position();
        let size = monitor.size();
        let _ = window.set_position(PhysicalPosition::new(position.x, position.y));
        let _ = window.set_size(PhysicalSize::new(size.width, size.height));
        if let Err(e) = window.show() {
            eprintln!("glow: failed to show window {label}: {e}");
        }
    }

    Ok(())
}

/// Hide every glow window. Hiding (not destroying) keeps re-shows instant.
#[tauri::command]
pub fn hide_glow(app: AppHandle) {
    for (label, window) in app.webview_windows() {
        if label.starts_with(GLOW_LABEL_PREFIX) {
            if let Err(e) = window.hide() {
                eprintln!("glow: failed to hide window {label}: {e}");
            }
        }
    }
}

// The overlay must never take focus, catch clicks, appear in the Dock/switcher,
// or stay behind on another Space — it's pure ambient light over everything.
fn build_glow_window(app: &AppHandle, label: &str) -> Result<(), Error> {
    let window = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html#glow".into()))
        .transparent(true) // requires macOSPrivateApi (tauri.conf.json)
        .decorations(false)
        .shadow(false)
        .focusable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .build()?;
    window.set_visible_on_all_workspaces(true)?;
    window.set_ignore_cursor_events(true)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn labels(names: &[&str]) -> Vec<String> {
        names.iter().map(|name| (*name).to_string()).collect()
    }

    #[test]
    fn creates_one_window_per_monitor_from_nothing() {
        let (create, close) = plan_glow_windows(&[], 2);
        assert_eq!(create, labels(&["glow-0", "glow-1"]));
        assert!(close.is_empty());
    }

    #[test]
    fn closes_orphans_when_a_monitor_is_unplugged() {
        let (create, close) = plan_glow_windows(&labels(&["glow-0", "glow-1"]), 1);
        assert!(create.is_empty());
        assert_eq!(close, labels(&["glow-1"]));
    }

    #[test]
    fn matching_windows_are_a_no_op() {
        let (create, close) = plan_glow_windows(&labels(&["glow-0"]), 1);
        assert!(create.is_empty());
        assert!(close.is_empty());
    }

    #[test]
    fn creates_the_missing_window_when_a_monitor_is_added() {
        let (create, close) = plan_glow_windows(&labels(&["glow-0"]), 2);
        assert_eq!(create, labels(&["glow-1"]));
        assert!(close.is_empty());
    }
}
