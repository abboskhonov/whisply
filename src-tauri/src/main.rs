// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Environment diagnosis on this machine:
//   OS:        Fedora Linux 44 (Workstation)
//   WebKitGTK: 2.52.4 (current — not the bottleneck)
//   GPU:       Intel Tiger Lake Iris Xe (iGPU)
//   Driver:    Mesa 26.1.3 (Intel/iris)
//   Session:   Wayland (Mutter)
//
// WebKitGTK perf knobs (only one is uncommented at a time; try in order):
//   1. WEBKIT_FORCE_DMABUF_RENDERER=1   ← default: Wayland fast path, GPU→compositor buffer sharing
//   2. WEBKIT_DISABLE_DMABUF_RENDERER=1  ← fallback if Mutter/DMABUF regresses (CPU-composited path)
//   3. WEBKIT_DISABLE_COMPOSITING_MODE=1 ← nuclear option: forces single-paint, no layers
//                                          (use only for A/B testing — UX cost is severe)
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

fn main() {
    #[cfg(target_os = "linux")]
    use_x11_for_positionable_gnome_overlay();

    std::env::set_var("WEBKIT_FORCE_DMABUF_RENDERER", "1");
    // std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    // std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    tauri_native_lib::run()
}
