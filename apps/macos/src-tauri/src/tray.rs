//! Menu-bar tray projection. The webview owns all state; it pushes the title (the
//! live timer text) and a rebuilt menu (status lines + Pomodoro/posture actions)
//! here. Action clicks relay back as `tray://action` events (wired in `lib.rs`).

use serde::Deserialize;
use tauri::menu::{MenuBuilder, MenuItem};
use tauri::AppHandle;

/// Tray icon id, so the commands can look the icon up to update it.
pub const TRAY_ID: &str = "cuewise-tray";

/// An enabled menu item whose `id` the webview handles via `tray://action`.
#[derive(Deserialize)]
pub struct TrayAction {
    id: String,
    label: String,
}

/// Set the menu-bar text next to the tray icon (the live timer). `None` clears it.
#[tauri::command]
pub fn set_tray_title(app: AppHandle, title: Option<String>) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_title(title);
    }
}

/// Rebuild the tray menu: disabled `info` lines, then the enabled webview-supplied
/// `actions`, then the fixed Open / Insights / Quit items.
#[tauri::command]
pub fn set_tray_menu(
    app: AppHandle,
    info: Vec<String>,
    actions: Vec<TrayAction>,
) -> tauri::Result<()> {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return Ok(());
    };

    let mut builder = MenuBuilder::new(&app);
    for (index, line) in info.iter().enumerate() {
        let item = MenuItem::with_id(&app, format!("info-{index}"), line, false, None::<&str>)?;
        builder = builder.item(&item);
    }
    if !info.is_empty() {
        builder = builder.separator();
    }
    for action in &actions {
        let item = MenuItem::with_id(&app, &action.id, &action.label, true, None::<&str>)?;
        builder = builder.item(&item);
    }
    if !actions.is_empty() {
        builder = builder.separator();
    }

    let show = MenuItem::with_id(&app, "show", "Open Cuewise", true, None::<&str>)?;
    let insights = MenuItem::with_id(&app, "insights", "View Insights", true, None::<&str>)?;
    let quit = MenuItem::with_id(&app, "quit", "Quit Cuewise", true, None::<&str>)?;

    let menu = builder
        .item(&show)
        .item(&insights)
        .separator()
        .item(&quit)
        .build()?;

    tray.set_menu(Some(menu))?;
    Ok(())
}
