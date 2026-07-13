//! Menu-bar tray projection. The webview owns all state; it pushes the title
//! (live timer / posture dot) and a rebuilt menu (status lines + Pomodoro/posture
//! actions) here. Action clicks relay back as `tray://action` events (`lib.rs`).

use serde::Deserialize;
use tauri::menu::{MenuBuilder, MenuItem, SubmenuBuilder};
use tauri::AppHandle;

/// Tray icon id, so the commands can look the icon up to update it.
pub const TRAY_ID: &str = "cuewise-tray";

/// An enabled menu item whose `id` the webview handles via `tray://action`.
/// With `children`, it renders as a submenu instead (the children carry the ids).
#[derive(Deserialize)]
pub struct TrayAction {
    id: String,
    label: String,
    #[serde(default)]
    children: Vec<TrayAction>,
}

/// Set the menu-bar text next to the tray icon (live status text). `None` clears it.
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
        if action.children.is_empty() {
            let item = MenuItem::with_id(&app, &action.id, &action.label, true, None::<&str>)?;
            builder = builder.item(&item);
        } else {
            let mut submenu = SubmenuBuilder::new(&app, &action.label);
            for child in &action.children {
                let item = MenuItem::with_id(&app, &child.id, &child.label, true, None::<&str>)?;
                submenu = submenu.item(&item);
            }
            builder = builder.item(&submenu.build()?);
        }
    }
    if !actions.is_empty() {
        builder = builder.separator();
    }

    let show = MenuItem::with_id(&app, "show", "Open Cuewise", true, None::<&str>)?;
    let insights = MenuItem::with_id(&app, "insights", "View Insights", true, None::<&str>)?;
    let settings = MenuItem::with_id(&app, "settings", "Settings…", true, None::<&str>)?;
    let quit = MenuItem::with_id(&app, "quit", "Quit Cuewise", true, None::<&str>)?;

    let menu = builder
        .item(&show)
        .item(&insights)
        .item(&settings)
        .separator()
        .item(&quit)
        .build()?;

    tray.set_menu(Some(menu))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tray_action_children_default_to_empty() {
        let action: TrayAction = serde_json::from_str(r#"{"id":"a","label":"A"}"#).expect("parse");
        assert!(action.children.is_empty());
    }

    #[test]
    fn tray_action_parses_nested_children() {
        let json = r#"{"id":"menu","label":"Menu","children":[{"id":"child","label":"Child"}]}"#;
        let action: TrayAction = serde_json::from_str(json).expect("parse");
        assert_eq!(action.children.len(), 1);
        assert_eq!(action.children[0].id, "child");
    }
}
