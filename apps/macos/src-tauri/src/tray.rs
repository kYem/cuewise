//! Menu-bar tray projection. The webview owns all state; it pushes the title
//! (live timer / posture dot) and the menu content (status lines + Pomodoro/posture
//! actions) here. Action clicks relay back as `tray://action` events (`lib.rs`).

use std::sync::Mutex;

use serde::Deserialize;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Manager, State, Wry};

use crate::error::{log_poison, Error};

/// Tray icon id, so the commands can look the icon up to update it.
pub const TRAY_ID: &str = "cuewise-tray";

/// The one tray Menu instance, mutated in place for every update. Replacing the
/// menu instead would drop items an open tracking session can still dispatch
/// into — the ENG-55 SIGABRT (AppKit updates an open NSMenu live; a swapped-out
/// one dangles).
#[derive(Default)]
pub struct TrayMenuState {
    menu: Mutex<Option<Menu<Wry>>>,
}

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

/// Build the initial fixed-items menu into the shared state; every later update
/// mutates this same instance (see `TrayMenuState`).
pub fn init_tray_menu(app: &AppHandle) -> Result<Menu<Wry>, Error> {
    let menu = Menu::new(app)?;
    append_menu_content(app, &menu, &[], &[])?;
    let state = app.state::<TrayMenuState>();
    let mut guard = state.menu.lock().map_err(log_poison)?;
    *guard = Some(menu.clone());
    Ok(menu)
}

/// Update the tray menu in place: drain the current items, then re-append the
/// disabled `info` lines, the webview-supplied `actions`, and the fixed tail.
#[tauri::command]
pub fn set_tray_menu(
    app: AppHandle,
    state: State<'_, TrayMenuState>,
    info: Vec<String>,
    actions: Vec<TrayAction>,
) -> Result<(), Error> {
    let guard = state.menu.lock().map_err(log_poison)?;
    let Some(menu) = guard.as_ref() else {
        // Tray init failed at startup; there is no menu to update.
        return Ok(());
    };
    while menu.remove_at(0)?.is_some() {}
    append_menu_content(&app, menu, &info, &actions)?;
    Ok(())
}

fn append_menu_content(
    app: &AppHandle,
    menu: &Menu<Wry>,
    info: &[String],
    actions: &[TrayAction],
) -> Result<(), Error> {
    for (index, line) in info.iter().enumerate() {
        let item = MenuItem::with_id(app, format!("info-{index}"), line, false, None::<&str>)?;
        menu.append(&item)?;
    }
    if !info.is_empty() {
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }

    for action in actions {
        if action.children.is_empty() {
            let item = MenuItem::with_id(app, &action.id, &action.label, true, None::<&str>)?;
            menu.append(&item)?;
        } else {
            let mut submenu = SubmenuBuilder::new(app, &action.label);
            for child in &action.children {
                let item = MenuItem::with_id(app, &child.id, &child.label, true, None::<&str>)?;
                submenu = submenu.item(&item);
            }
            menu.append(&submenu.build()?)?;
        }
    }
    if !actions.is_empty() {
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }

    let show = MenuItem::with_id(app, "show", "Open Cuewise", true, None::<&str>)?;
    let insights = MenuItem::with_id(app, "insights", "View Insights", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Cuewise", true, None::<&str>)?;
    menu.append(&show)?;
    menu.append(&insights)?;
    menu.append(&settings)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&quit)?;
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
