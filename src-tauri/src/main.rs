// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// AppImage fix: must be set before tauri_native_lib::run() because GTK reads them at init.
#[cfg(target_os = "linux")]
const WAYLAND_CLIENT_PRELOAD_CANDIDATES: [&str; 7] = [
    "/usr/lib/libwayland-client.so",
    "/usr/lib/libwayland-client.so.0",
    "/usr/lib64/libwayland-client.so",
    "/usr/lib64/libwayland-client.so.0",
    "/lib64/libwayland-client.so.0",
    "/lib/x86_64-linux-gnu/libwayland-client.so.0",
    "/usr/lib/x86_64-linux-gnu/libwayland-client.so.0",
];

#[cfg(target_os = "linux")]
fn use_x11_for_positionable_gnome_overlay() {
    let is_gnome_wayland = std::env::var("XDG_SESSION_TYPE").as_deref() == Ok("wayland")
        && std::env::var("XDG_CURRENT_DESKTOP")
            .is_ok_and(|desktop| desktop.to_lowercase().contains("gnome"));

    if is_gnome_wayland
        && std::env::var_os("DISPLAY").is_some()
        && std::env::var_os("GDK_BACKEND").is_none()
    {
        // GNOME does not support the layer-shell protocol and ignores Wayland
        // window coordinates. XWayland is the only practical way to honor the
        // overlay position setting on a GNOME Wayland session.
        std::env::set_var("GDK_BACKEND", "x11");
    }
}

#[cfg(target_os = "linux")]
fn preload_system_wayland_client_for_appimage() {
    use std::os::unix::process::CommandExt;

    let is_appimage = std::env::var_os("APPIMAGE").is_some();
    let is_wayland = std::env::var_os("WAYLAND_DISPLAY").is_some()
        || std::env::var("XDG_SESSION_TYPE").is_ok_and(|session| session == "wayland");
    let already_preloaded = std::env::var_os("LD_PRELOAD").is_some();
    let already_attempted =
        std::env::var_os("WHISPLY_APPIMAGE_WAYLAND_PRELOAD_ATTEMPTED").is_some();

    if !is_appimage || !is_wayland || already_preloaded || already_attempted {
        return;
    }

    let Some(preload_path) = WAYLAND_CLIENT_PRELOAD_CANDIDATES
        .iter()
        .find(|path| std::path::Path::new(path).is_file())
    else {
        return;
    };

    let Ok(executable) = std::env::current_exe() else {
        return;
    };

    let error = std::process::Command::new(executable)
        .args(std::env::args_os().skip(1))
        .env("LD_PRELOAD", preload_path)
        .env("WHISPLY_APPIMAGE_WAYLAND_PRELOAD_ATTEMPTED", "1")
        .exec();
    eprintln!("Could not re-launch AppImage with the system Wayland client: {error}");
}

#[cfg(not(target_os = "linux"))]
fn preload_system_wayland_client_for_appimage() {}

fn configure_webkit_renderer() {
    if std::env::var_os("APPIMAGE").is_some() {
        // AppImages bundle WebKitGTK and its Wayland client. Preloading the
        // host client avoids EGL display failures on newer Linux desktops.
        preload_system_wayland_client_for_appimage();
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    } else {
        std::env::set_var("WEBKIT_FORCE_DMABUF_RENDERER", "1");
    }
}

fn main() {
    configure_webkit_renderer();

    #[cfg(target_os = "linux")]
    use_x11_for_positionable_gnome_overlay();

    tauri_native_lib::run()
}
