use serde_json::{json, Value};
use std::fs;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, Runtime, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

const MAIN_WIDTH: i32 = 292;
const ICON_SIZE: i32 = 72;
const DRAWER_WIDTH: i32 = 500;
const DRAWER_GAP: i32 = 14;
const DRAWER_HEIGHT: i32 = 760;
const WINDOW_MARGIN_RIGHT: i32 = 24;
const WINDOW_MARGIN_TOP: i32 = 24;

fn seed_data() -> Value {
    json!({
        "websites": [
            {
                "id": "WEB-001",
                "title": "主控台门户",
                "domain": "sys.core.local",
                "description": "系统核心访问点。需要 L4 级权限认证。",
                "icon": "server",
                "createdAt": "2077-10-23T04:22:19.000Z",
                "updatedAt": "2077-10-23T04:22:19.000Z"
            },
            {
                "id": "WEB-024",
                "title": "外部监控源",
                "domain": "ext.cam.net",
                "description": "区域 7-A 实时视觉数据流。",
                "icon": "eye",
                "createdAt": "2077-10-24T09:14:01.000Z",
                "updatedAt": "2077-10-24T09:14:01.000Z"
            }
        ],
        "tasks": [
            {
                "id": "TSK-101",
                "title": "同步安全协议",
                "priority": "HIGH",
                "status": "PENDING",
                "progress": 40,
                "createdAt": "2077-10-23T04:22:19.000Z",
                "updatedAt": "2077-10-23T04:22:19.000Z"
            },
            {
                "id": "TSK-208",
                "title": "清理缓存分区",
                "priority": "MED",
                "status": "DONE",
                "progress": 100,
                "createdAt": "2077-10-24T10:00:00.000Z",
                "updatedAt": "2077-10-24T10:00:00.000Z"
            }
        ],
        "notes": [
            {
                "id": "NTE-207",
                "title": "未授权访问尝试",
                "content": "记录：系统日志异常。时间戳：04:22:19。怀疑有未授权的访问尝试，源自外部监控网络代理。需要进一步排查分区 7-A 的加密日志。",
                "createdAt": "2077-10-23T04:22:19.000Z",
                "updatedAt": "2077-10-23T04:22:19.000Z"
            },
            {
                "id": "NTE-244",
                "title": "环境变量错误",
                "content": "[警告] 检测到未授权的环境变量。建议立即运行清理协议。",
                "createdAt": "2077-10-24T11:32:00.000Z",
                "updatedAt": "2077-10-24T11:32:00.000Z"
            }
        ]
    })
}

fn data_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app_data_dir failed: {error}"))?;
    fs::create_dir_all(&dir).map_err(|error| format!("create data dir failed: {error}"))?;
    Ok(dir.join("joko-memo-data.json"))
}

fn ensure_data_file(app: &AppHandle) -> Result<Value, String> {
    let path = data_path(app)?;
    if !path.exists() {
        let seeded = seed_data();
        fs::write(
            &path,
            serde_json::to_string_pretty(&seeded).map_err(|error| error.to_string())?,
        )
        .map_err(|error| format!("write seed data failed: {error}"))?;
        return Ok(seeded);
    }

    let raw = fs::read_to_string(&path).map_err(|error| format!("read data failed: {error}"))?;
    match serde_json::from_str::<Value>(&raw) {
        Ok(value) => Ok(value),
        Err(_) => {
            let corrupt = path.with_extension(format!(
                "corrupt-{}.json",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_err(|error| error.to_string())?
                    .as_millis()
            ));
            let _ = fs::rename(&path, corrupt);
            let seeded = seed_data();
            fs::write(
                &path,
                serde_json::to_string_pretty(&seeded).map_err(|error| error.to_string())?,
            )
            .map_err(|error| format!("rewrite seed data failed: {error}"))?;
            Ok(seeded)
        }
    }
}

fn clamp(value: i32, min: i32, max: i32) -> i32 {
    value.max(min).min(max)
}

fn scaled(value: i32, scale: f64) -> i32 {
    (value as f64 * scale).round() as i32
}

fn position_main_initial<R: Runtime>(window: &WebviewWindow<R>) {
    if let Ok(Some(monitor)) = window.primary_monitor() {
        let scale = window.scale_factor().unwrap_or(1.0);
        let area = monitor.work_area();
        let main_width = scaled(MAIN_WIDTH, scale);
        let x = area.position.x + area.size.width as i32 - main_width - scaled(WINDOW_MARGIN_RIGHT, scale);
        let y = area.position.y + scaled(WINDOW_MARGIN_TOP, scale);
        let _ = window.set_position(PhysicalPosition::new(x.max(area.position.x), y));
    }
}

fn position_drawer(app: &AppHandle) {
    let Some(main) = app.get_webview_window("main") else {
        return;
    };
    let Some(drawer) = app.get_webview_window("drawer") else {
        return;
    };
    let Ok(main_pos) = main.outer_position() else {
        return;
    };
    let Ok(main_size) = main.outer_size() else {
        return;
    };
    let Ok(Some(monitor)) = main.current_monitor() else {
        return;
    };
    let scale = main.scale_factor().unwrap_or(1.0);
    let drawer_width = scaled(DRAWER_WIDTH, scale);
    let drawer_gap = scaled(DRAWER_GAP, scale);
    let drawer_height = scaled(DRAWER_HEIGHT, scale);
    let area = monitor.work_area();
    let main_x = main_pos.x;
    let main_y = main_pos.y;
    let main_width = main_size.width as i32;
    let left_x = main_x - drawer_width - drawer_gap;
    let right_x = main_x + main_width + drawer_gap;
    let has_left_space = left_x >= area.position.x;
    let has_right_space = right_x + drawer_width <= area.position.x + area.size.width as i32;
    let left_space = main_x - area.position.x - drawer_gap;
    let right_space =
        area.position.x + area.size.width as i32 - (main_x + main_width) - drawer_gap;
    let drawer_x = if has_left_space || (!has_right_space && left_space > right_space) {
        left_x.max(area.position.x)
    } else {
        right_x.min(area.position.x + area.size.width as i32 - drawer_width)
    };
    let drawer_y = clamp(
        main_y,
        area.position.y,
        area.position.y + area.size.height as i32 - drawer_height,
    );

    let _ = drawer.set_position(PhysicalPosition::new(drawer_x, drawer_y));
}

fn send_drawer_state(app: &AppHandle, active_tab: Option<&str>) {
    let _ = app.emit("drawer-state", json!({ "activeTab": active_tab }));
}

fn show_drawer(app: &AppHandle, tab: &str) {
    position_drawer(app);
    if let Some(drawer) = app.get_webview_window("drawer") {
        let _ = drawer.show();
        let _ = drawer.emit("drawer-set-tab", tab);
        let _ = drawer.emit("drawer-set-visible", true);
    }
    send_drawer_state(app, Some(tab));
}

fn hide_drawer(app: &AppHandle) {
    if let Some(drawer) = app.get_webview_window("drawer") {
        let _ = drawer.emit("drawer-set-visible", false);
        let drawer_for_timeout = drawer.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(320));
            let _ = drawer_for_timeout.hide();
        });
    }
    send_drawer_state(app, None);
}

fn hide_drawer_immediate(app: &AppHandle) {
    if let Some(drawer) = app.get_webview_window("drawer") {
        let _ = drawer.emit("drawer-set-visible", false);
        let _ = drawer.hide();
    }
    send_drawer_state(app, None);
}

fn show_main_from_tray(app: &AppHandle) {
    if let Some(icon) = app.get_webview_window("icon") {
        let _ = icon.hide();
    }
    if let Some(drawer) = app.get_webview_window("drawer") {
        let _ = drawer.hide();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
}

fn hide_all_to_tray(app: &AppHandle) {
    let current = app.state::<std::sync::Mutex<Option<String>>>();
    *current.lock().expect("drawer state poisoned") = None;
    hide_drawer_immediate(app);

    if let Some(icon) = app.get_webview_window("icon") {
        let _ = icon.hide();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.hide();
    }
}

fn toggle_main_from_tray(app: &AppHandle) {
    let main_visible = app
        .get_webview_window("main")
        .map(|main| main.is_visible().unwrap_or(false))
        .unwrap_or(false);
    let icon_visible = app
        .get_webview_window("icon")
        .map(|icon| icon.is_visible().unwrap_or(false))
        .unwrap_or(false);

    if main_visible || icon_visible {
        hide_all_to_tray(app);
    } else {
        show_main_from_tray(app);
    }
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let show_i = MenuItem::with_id(app, "show", "显示 JOKO_MEMO", true, None::<&str>)?;
    let hide_i = MenuItem::with_id(app, "hide", "隐藏到托盘", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&show_i, &hide_i, &separator, &quit_i])?;
    let icon = app
        .default_window_icon()
        .expect("default window icon missing")
        .clone();

    TrayIconBuilder::with_id("joko-memo-tray")
        .tooltip("JOKO_MEMO")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_from_tray(app),
            "hide" => hide_all_to_tray(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_from_tray(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

#[tauri::command]
fn data_load(app: AppHandle) -> Result<Value, String> {
    ensure_data_file(&app)
}

#[tauri::command]
fn data_save(app: AppHandle, snapshot: Value) -> Result<(), String> {
    let path = data_path(&app)?;
    fs::write(
        path,
        serde_json::to_string_pretty(&snapshot).map_err(|error| error.to_string())?,
    )
    .map_err(|error| format!("save data failed: {error}"))?;
    let _ = app.emit("data-updated", snapshot);
    Ok(())
}

#[tauri::command]
fn drawer_toggle(app: AppHandle, tab: String) {
    if !matches!(tab.as_str(), "website" | "task" | "note") {
        return;
    }

    let current = app.state::<std::sync::Mutex<Option<String>>>();
    let mut active = current.lock().expect("drawer state poisoned");
    let drawer_visible = app
        .get_webview_window("drawer")
        .map(|drawer| drawer.is_visible().unwrap_or(false))
        .unwrap_or(false);

    if active.as_deref() == Some(tab.as_str()) && drawer_visible {
        *active = None;
        drop(active);
        hide_drawer(&app);
        return;
    }

    *active = Some(tab.clone());
    drop(active);
    show_drawer(&app, &tab);
}

#[tauri::command]
fn drawer_close(app: AppHandle) {
    let current = app.state::<std::sync::Mutex<Option<String>>>();
    *current.lock().expect("drawer state poisoned") = None;
    hide_drawer(&app);
}

#[tauri::command]
fn window_hide_to_tray(app: AppHandle) {
    hide_all_to_tray(&app);
}

#[tauri::command]
fn window_compact(app: AppHandle) {
    hide_drawer_immediate(&app);

    let Some(main) = app.get_webview_window("main") else {
        return;
    };
    let Some(icon) = app.get_webview_window("icon") else {
        return;
    };
    let Ok(main_pos) = main.outer_position() else {
        return;
    };
    let Ok(main_size) = main.outer_size() else {
        return;
    };
    let scale = main.scale_factor().unwrap_or(1.0);
    let icon_size = scaled(ICON_SIZE, scale);
    let icon_x = main_pos.x + main_size.width as i32 - icon_size;
    let icon_y = main_pos.y;
    let _ = icon.set_position(PhysicalPosition::new(icon_x, icon_y));
    let _ = icon.show();
    let _ = icon.set_focus();
    let _ = main.hide();
}

#[tauri::command]
fn window_restore(app: AppHandle) {
    let Some(main) = app.get_webview_window("main") else {
        return;
    };
    let Some(icon) = app.get_webview_window("icon") else {
        return;
    };
    let Ok(icon_pos) = icon.outer_position() else {
        return;
    };
    let Ok(icon_size) = icon.outer_size() else {
        return;
    };
    let Ok(main_size) = main.outer_size() else {
        return;
    };

    let _ = main.set_position(PhysicalPosition::new(
        icon_pos.x + icon_size.width as i32 - main_size.width as i32,
        icon_pos.y,
    ));
    let _ = main.show();
    let _ = icon.hide();
    let _ = main.set_focus();
}

#[tauri::command]
fn open_external(_app: AppHandle, raw_url: String) -> Result<(), String> {
    let url = if raw_url.starts_with("http://") || raw_url.starts_with("https://") {
        raw_url
    } else {
        format!("https://{raw_url}")
    };

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|error| format!("open url failed: {error}"))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|error| format!("open url failed: {error}"))?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|error| format!("open url failed: {error}"))?;
    }

    Ok(())
}

fn ensure_window<R: Runtime>(
    app: &tauri::App<R>,
    label: &str,
    url: &str,
    width: f64,
    height: f64,
    visible: bool,
) -> tauri::Result<WebviewWindow<R>> {
    if let Some(window) = app.get_webview_window(label) {
        return Ok(window);
    }

    WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title(match label {
            "drawer" => "JOKO_MEMO // DRAWER",
            "icon" => "JOKO_MEMO // ICON",
            _ => "JOKO_MEMO",
        })
        .inner_size(width, height)
        .min_inner_size(width, height)
        .max_inner_size(width, height)
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(label != "main")
        .shadow(false)
        .visible(visible)
        .build()
}

pub fn run() {
    tauri::Builder::default()
        .manage(std::sync::Mutex::<Option<String>>::new(None))
        .setup(|app| {
            let main = ensure_window(app, "main", "index.html?view=main", 292.0, 360.0, true)?;
            let _ = ensure_window(app, "drawer", "index.html?view=drawer", 500.0, 760.0, false)?;
            let _ = ensure_window(app, "icon", "index.html?view=icon", 72.0, 72.0, false)?;
            position_main_initial(&main);
            setup_tray(app)?;

            let handle = app.handle().clone();
            main.on_window_event(move |event| {
                if matches!(event, tauri::WindowEvent::Moved(_)) {
                    position_drawer(&handle);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            data_load,
            data_save,
            drawer_toggle,
            drawer_close,
            window_hide_to_tray,
            window_compact,
            window_restore,
            open_external
        ])
        .run(tauri::generate_context!())
        .expect("error while running JOKO_MEMO");
}
