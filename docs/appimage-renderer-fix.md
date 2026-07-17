# AppImage renderer fix

## Problem

`v0.0.2` opened as a blank white window on Fedora GNOME Wayland. The log contained:

```
Could not create default EGL display: EGL_BAD_PARAMETER
```

The AppImage bundles a WebKitGTK with its own Wayland client library that conflicts with the host compositor stack.

## Solution

`src-tauri/src/main.rs` automatically:

1. Detects AppImage launch on Wayland
2. Finds the first available system `libwayland-client.so` from common paths (Fedora, Arch, Debian, Ubuntu)
3. Re-execs the binary with that library in `LD_PRELOAD`
4. Marks the attempt with `WHISPLY_APPIMAGE_WAYLAND_PRELOAD_ATTEMPTED=1` to prevent loops
5. Sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` for AppImages

Native RPM/DEB launches retain `WEBKIT_FORCE_DMABUF_RENDERER=1`.

## Verified

- `cargo check` passes
- TypeScript types pass (`bun run typecheck`)
- Versions bumped to `0.0.3`
