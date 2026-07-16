// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Environment diagnosis on this machine:
//   OS:        Fedora Linux 44 (Workstation)
//   WebKitGTK: 2.52.4 (current — not the bottleneck)
//   GPU:       Intel Tiger Lake Iris Xe (iGPU)
//   Driver:    Mesa 26.1.3 (Intel/iris)
//   Session:   Wayland (Mutter)
//
// These MUST be set before tauri_native_lib::run() because GTK reads them at init.
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

fn configure_webkit_renderer() {
    if std::env::var_os("APPIMAGE").is_some() {
        // The AppImage bundles WebKitGTK and its GPU stack. Forcing DMA-BUF
        // with the host compositor can make WebKit fail to create an EGL
        // display, leaving the app window blank.
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    } else {
        std::env::set_var("WEBKIT_FORCE_DMABUF_RENDERER", "1");
    }
}

fn main() {
    #[cfg(target_os = "linux")]
    use_x11_for_positionable_gnome_overlay();

    configure_webkit_renderer();
    tauri_native_lib::run()
}
