//! Screen-edge glow overlays: one transparent, click-through window per monitor,
//! each rendering `#glow`. The webview posture controller decides when they show.

use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

use crate::error::Error;

const GLOW_LABEL_PREFIX: &str = "glow-";

fn glow_label(index: usize) -> String {
    format!("{GLOW_LABEL_PREFIX}{index}")
}

/// Labels of glow windows beyond the current monitor count (monitor unplugged).
fn orphan_glow_labels(existing: &[String], monitor_count: usize) -> Vec<String> {
    let desired: Vec<String> = (0..monitor_count).map(glow_label).collect();
    existing
        .iter()
        .filter(|label| !desired.contains(label))
        .cloned()
        .collect()
}

/// Show the glow on every monitor: get-or-create a window per display, position,
/// show. Per-monitor failures are logged and skipped; topology changes mid-glow
/// settle on the next show.
#[tauri::command]
pub fn show_glow(app: AppHandle) -> Result<(), Error> {
    let monitors = app.available_monitors()?;
    if monitors.is_empty() {
        // Err, not a silent Ok: the webview rolls back and retries a later nudge.
        return Err(Error::NoMonitors);
    }
    let existing: Vec<String> = app
        .webview_windows()
        .keys()
        .filter(|label| label.starts_with(GLOW_LABEL_PREFIX))
        .cloned()
        .collect();

    for label in orphan_glow_labels(&existing, monitors.len()) {
        if let Some(window) = app.get_webview_window(&label) {
            // destroy(), not close(): close is preventable, and a CloseRequested
            // handler (like main's hide-to-tray) could silently swallow it.
            if let Err(e) = window.destroy() {
                eprintln!("glow: failed to destroy orphaned window {label}: {e}");
            }
        }
    }

    for (index, monitor) in monitors.iter().enumerate() {
        let label = glow_label(index);
        let window = match app.get_webview_window(&label) {
            Some(window) => window,
            None => match build_glow_window(&app, &label) {
                Ok(window) => window,
                Err(e) => {
                    eprintln!("glow: failed to create window {label}: {e}");
                    continue;
                }
            },
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

/// Hide every glow window (hidden, not destroyed — re-shows stay instant). The
/// first failure is returned after trying all, so the webview retries later.
#[tauri::command]
pub fn hide_glow(app: AppHandle) -> Result<(), Error> {
    let mut first_error: Option<tauri::Error> = None;
    for (label, window) in app.webview_windows() {
        if !label.starts_with(GLOW_LABEL_PREFIX) {
            continue;
        }
        if let Err(e) = window.hide() {
            eprintln!("glow: failed to hide window {label}: {e}");
            first_error.get_or_insert(e);
        }
    }
    match first_error {
        Some(e) => Err(e.into()),
        None => Ok(()),
    }
}

// Never takes focus, catches clicks, or lingers on one Space. A half-configured
// window is destroyed rather than left swallowing the display's clicks.
fn build_glow_window(app: &AppHandle, label: &str) -> Result<WebviewWindow, Error> {
    let window = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html#glow".into()))
        .transparent(true) // requires macOSPrivateApi (tauri.conf.json)
        .decorations(false)
        .shadow(false)
        .focusable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .build()?;
    if let Err(e) = configure_overlay(&window) {
        let _ = window.destroy();
        return Err(e.into());
    }
    Ok(window)
}

fn configure_overlay(window: &WebviewWindow) -> tauri::Result<()> {
    window.set_visible_on_all_workspaces(true)?;
    window.set_ignore_cursor_events(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn labels(names: &[&str]) -> Vec<String> {
        names.iter().map(|name| (*name).to_string()).collect()
    }

    #[test]
    fn no_orphans_when_nothing_exists() {
        assert!(orphan_glow_labels(&[], 2).is_empty());
    }

    #[test]
    fn flags_the_extra_window_when_a_monitor_is_unplugged() {
        let orphans = orphan_glow_labels(&labels(&["glow-0", "glow-1"]), 1);
        assert_eq!(orphans, labels(&["glow-1"]));
    }

    #[test]
    fn matching_windows_are_a_no_op() {
        assert!(orphan_glow_labels(&labels(&["glow-0"]), 1).is_empty());
    }

    #[test]
    fn missing_windows_are_not_orphans() {
        // A newly added monitor means fewer windows than displays — nothing to close.
        assert!(orphan_glow_labels(&labels(&["glow-0"]), 2).is_empty());
    }
}
