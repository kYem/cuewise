//! Menu-bar tray projection. The webview owns all state; it pushes the title
//! (live timer / posture dot) and the menu content (status lines + Pomodoro/posture
//! actions) here. Action clicks relay back as `tray://action` events (`lib.rs`).
//!
//! The frequent updates (posture dot, timer stats — every few seconds) are
//! label-only: they `set_text` on stable item handles and never add/remove items,
//! so an open menu or submenu can't be left dangling (the ENG-55 SIGABRT).
//! Structural changes (a different item tree) drain and rebuild — rare, and
//! almost always right after a click that closed the menu.

use std::sync::Mutex;

use serde::Deserialize;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu, SubmenuBuilder};
use tauri::{AppHandle, Manager, State, Wry};

use crate::error::{log_poison, Error};

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

/// Live handles to the dynamic (webview-supplied) part of the menu, kept so
/// label refreshes can mutate text in place instead of touching the item tree.
enum ActionHandle {
    Flat(MenuItem<Wry>),
    Nested {
        submenu: Submenu<Wry>,
        children: Vec<MenuItem<Wry>>,
    },
}

struct TrayMenu {
    menu: Menu<Wry>,
    signature: Signature,
    info_items: Vec<MenuItem<Wry>>,
    action_handles: Vec<ActionHandle>,
}

/// The one tray Menu instance plus its dynamic-item handles. The Menu object is
/// never replaced: AppKit updates a live NSMenu, a swapped-out one dangles.
#[derive(Default)]
pub struct TrayMenuState {
    menu: Mutex<Option<TrayMenu>>,
}

/// The item-tree shape: info line count plus the action id tree. Equal
/// signatures mean the update is label-only and needs no structural mutation.
type Signature = (usize, Vec<(String, Vec<String>)>);

fn signature_of(info: &[String], actions: &[TrayAction]) -> Signature {
    let action_ids = actions
        .iter()
        .map(|action| {
            let child_ids = action
                .children
                .iter()
                .map(|child| child.id.clone())
                .collect();
            (action.id.clone(), child_ids)
        })
        .collect();
    (info.len(), action_ids)
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
    append_fixed_tail(app, &menu)?;
    let state = app.state::<TrayMenuState>();
    let mut guard = state.menu.lock().map_err(log_poison)?;
    *guard = Some(TrayMenu {
        menu: menu.clone(),
        signature: signature_of(&[], &[]),
        info_items: Vec::new(),
        action_handles: Vec::new(),
    });
    Ok(menu)
}

/// Update the tray menu: label-only refresh when the item tree is unchanged,
/// full in-place rebuild otherwise.
#[tauri::command]
pub fn set_tray_menu(
    app: AppHandle,
    state: State<'_, TrayMenuState>,
    info: Vec<String>,
    actions: Vec<TrayAction>,
) -> Result<(), Error> {
    let mut guard = state.menu.lock().map_err(log_poison)?;
    let Some(tray_menu) = guard.as_mut() else {
        // Unreachable once the app runs (setup aborts if init_tray_menu fails) —
        // loud anyway, so a future non-fatal-init refactor can't silently no-op.
        eprintln!("tray: set_tray_menu called before the menu was initialized");
        return Err(Error::TrayNotInitialized);
    };

    let signature = signature_of(&info, &actions);
    if signature == tray_menu.signature {
        return refresh_labels(tray_menu, &info, &actions);
    }
    rebuild(&app, tray_menu, signature, &info, &actions)
}

// Equal signatures guarantee every zip below is same-length, so no item is
// silently skipped.
fn refresh_labels(
    tray_menu: &TrayMenu,
    info: &[String],
    actions: &[TrayAction],
) -> Result<(), Error> {
    for (item, line) in tray_menu.info_items.iter().zip(info) {
        item.set_text(line)?;
    }
    for (handle, action) in tray_menu.action_handles.iter().zip(actions) {
        match handle {
            ActionHandle::Flat(item) => item.set_text(&action.label)?,
            ActionHandle::Nested { submenu, children } => {
                submenu.set_text(&action.label)?;
                for (child, child_action) in children.iter().zip(&action.children) {
                    child.set_text(&child_action.label)?;
                }
            }
        }
    }
    Ok(())
}

fn rebuild(
    app: &AppHandle,
    tray_menu: &mut TrayMenu,
    signature: Signature,
    info: &[String],
    actions: &[TrayAction],
) -> Result<(), Error> {
    let result = rebuild_items(app, tray_menu, info, actions);
    if let Err(e) = result {
        // Best-effort: never leave the menu without Open/Settings/Quit — the tray
        // is the only way back into a hidden-to-tray app.
        let _ = append_fixed_tail(app, &tray_menu.menu);
        return Err(e);
    }
    tray_menu.signature = signature;
    Ok(())
}

fn rebuild_items(
    app: &AppHandle,
    tray_menu: &mut TrayMenu,
    info: &[String],
    actions: &[TrayAction],
) -> Result<(), Error> {
    // All fallible construction happens BEFORE the menu is touched, so a build
    // failure leaves the previous menu fully intact.
    let mut info_items = Vec::with_capacity(info.len());
    for (index, line) in info.iter().enumerate() {
        info_items.push(MenuItem::with_id(
            app,
            format!("info-{index}"),
            line,
            false,
            None::<&str>,
        )?);
    }
    let mut action_handles = Vec::with_capacity(actions.len());
    for action in actions {
        if action.children.is_empty() {
            let item = MenuItem::with_id(app, &action.id, &action.label, true, None::<&str>)?;
            action_handles.push(ActionHandle::Flat(item));
        } else {
            let mut children = Vec::with_capacity(action.children.len());
            let mut builder = SubmenuBuilder::new(app, &action.label);
            for child in &action.children {
                let item = MenuItem::with_id(app, &child.id, &child.label, true, None::<&str>)?;
                builder = builder.item(&item);
                children.push(item);
            }
            action_handles.push(ActionHandle::Nested {
                submenu: builder.build()?,
                children,
            });
        }
    }

    let menu = &tray_menu.menu;
    while menu.remove_at(0)?.is_some() {}
    for item in &info_items {
        menu.append(item)?;
    }
    if !info_items.is_empty() {
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }
    for handle in &action_handles {
        match handle {
            ActionHandle::Flat(item) => menu.append(item)?,
            ActionHandle::Nested { submenu, .. } => menu.append(submenu)?,
        }
    }
    if !action_handles.is_empty() {
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }
    append_fixed_tail(app, menu)?;

    tray_menu.info_items = info_items;
    tray_menu.action_handles = action_handles;
    Ok(())
}

fn append_fixed_tail(app: &AppHandle, menu: &Menu<Wry>) -> Result<(), Error> {
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

    fn action(id: &str, label: &str, children: Vec<TrayAction>) -> TrayAction {
        TrayAction {
            id: id.to_string(),
            label: label.to_string(),
            children,
        }
    }

    #[test]
    fn tray_action_children_default_to_empty() {
        let parsed: TrayAction = serde_json::from_str(r#"{"id":"a","label":"A"}"#).expect("parse");
        assert!(parsed.children.is_empty());
    }

    #[test]
    fn tray_action_parses_nested_children() {
        let json = r#"{"id":"menu","label":"Menu","children":[{"id":"child","label":"Child"}]}"#;
        let parsed: TrayAction = serde_json::from_str(json).expect("parse");
        assert_eq!(parsed.children.len(), 1);
        assert_eq!(parsed.children[0].id, "child");
    }

    #[test]
    fn label_changes_keep_the_signature_stable() {
        let before = signature_of(
            &["🟢 Good posture".into()],
            &[action("pause", "Pause", vec![])],
        );
        let after = signature_of(
            &["🔴 Sit back".into()],
            &[action("pause", "Pause (running)", vec![])],
        );
        assert_eq!(before, after, "label-only updates must not look structural");
    }

    #[test]
    fn id_or_shape_changes_change_the_signature() {
        let flat = signature_of(&[], &[action("pause", "Pause", vec![])]);
        let renamed_id = signature_of(&[], &[action("resume", "Resume", vec![])]);
        let nested = signature_of(
            &[],
            &[action(
                "menu",
                "Menu",
                vec![action("child", "Child", vec![])],
            )],
        );
        let more_info = signature_of(&["line".into()], &[action("pause", "Pause", vec![])]);
        assert_ne!(flat, renamed_id);
        assert_ne!(flat, nested);
        assert_ne!(flat, more_info);
    }

    #[test]
    fn child_id_changes_are_structural() {
        let one = signature_of(
            &[],
            &[action("menu", "Menu", vec![action("a", "A", vec![])])],
        );
        let other = signature_of(
            &[],
            &[action("menu", "Menu", vec![action("b", "A", vec![])])],
        );
        assert_ne!(one, other);
    }
}
