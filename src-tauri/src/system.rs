use cpal::traits::{DeviceTrait, HostTrait};
use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize)]
pub struct SystemInfo {
    pub os: String,
    pub kernel: String,
    pub desktop: String,
    pub session_type: String,
    pub audio_system: String,
}

#[derive(Debug, Serialize)]
pub struct MicrophoneStatus {
    pub available: bool,
    pub device_count: usize,
    pub default_device: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct InputStatus {
    pub available: bool,
    pub method: String,
    pub wayland: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum UpdateChannel {
    AppImage,
    Rpm,
    Deb,
    Unsupported,
}

fn read_os_release() -> String {
    let content = std::fs::read_to_string("/etc/os-release")
        .or_else(|_| std::fs::read_to_string("/usr/lib/os-release"))
        .unwrap_or_default();

    for line in content.lines() {
        if let Some(name) = line.strip_prefix("PRETTY_NAME=") {
            return name.trim_matches('"').to_string();
        }
        if let Some(name) = line.strip_prefix("NAME=") {
            return name.trim_matches('"').to_string();
        }
    }

    "Linux".to_string()
}

fn detect_kernel() -> String {
    Command::new("uname")
        .arg("-r")
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                None
            }
        })
        .unwrap_or_else(|| "unknown".to_string())
}

fn detect_desktop() -> String {
    std::env::var("XDG_CURRENT_DESKTOP")
        .or_else(|_| std::env::var("DESKTOP_SESSION"))
        .unwrap_or_else(|_| "Unknown".to_string())
}

fn detect_session_type() -> String {
    std::env::var("XDG_SESSION_TYPE").unwrap_or_else(|_| "Unknown".to_string())
}

fn detect_audio_system() -> String {
    // Check for PipeWire first
    if Command::new("sh")
        .args(["-c", "pidof pipewire-pulse || pidof pipewire 2>/dev/null"])
        .output()
        .ok()
        .map_or(false, |o| o.status.success() && !o.stdout.is_empty())
    {
        return "PipeWire".to_string();
    }

    // Fall back to PulseAudio
    if Command::new("sh")
        .args(["-c", "pidof pulseaudio 2>/dev/null"])
        .output()
        .ok()
        .map_or(false, |o| o.status.success() && !o.stdout.is_empty())
    {
        return "PulseAudio".to_string();
    }

    // Check if ALSA devices exist
    if std::fs::metadata("/dev/snd").is_ok() {
        return "ALSA".to_string();
    }

    "Unknown".to_string()
}

pub fn check_system() -> SystemInfo {
    SystemInfo {
        os: read_os_release(),
        kernel: detect_kernel(),
        desktop: detect_desktop(),
        session_type: detect_session_type(),
        audio_system: detect_audio_system(),
    }
}

pub fn check_microphone() -> MicrophoneStatus {
    let host = cpal::default_host();
    let devices = host.input_devices();

    match devices {
        Ok(devices) => {
            let names: Vec<String> = devices
                .filter_map(|d| d.name().ok())
                .collect();
            let count = names.len();
            let default = names.first().cloned();

            MicrophoneStatus {
                available: count > 0,
                device_count: count,
                default_device: default,
            }
        }
        Err(_) => MicrophoneStatus {
            available: false,
            device_count: 0,
            default_device: None,
        },
    }
}

pub fn check_input() -> InputStatus {
    let is_wayland = detect_session_type().to_lowercase() == "wayland";
    let enigo_available = enigo::Enigo::new(&enigo::Settings::default()).is_ok();

    InputStatus {
        available: enigo_available,
        method: if enigo_available {
            if is_wayland {
                // Enigo may work on Wayland via wlroots but not on GNOME/KDE Wayland
                "enigo (limited on Wayland)"
            } else {
                "enigo"
            }
            .to_string()
        } else {
            "clipboard"
                .to_string()
        },
        wayland: is_wayland,
    }
}

fn package_owns_executable(command: &str, flag: &str) -> bool {
    let Ok(executable) = std::env::current_exe() else {
        return false;
    };

    Command::new(command)
        .arg(flag)
        .arg(executable)
        .output()
        .is_ok_and(|output| output.status.success())
}

pub fn update_channel() -> UpdateChannel {
    if std::env::var_os("APPIMAGE").is_some() {
        return UpdateChannel::AppImage;
    }

    if package_owns_executable("rpm", "-qf") {
        return UpdateChannel::Rpm;
    }

    if package_owns_executable("dpkg-query", "-S") {
        return UpdateChannel::Deb;
    }

    UpdateChannel::Unsupported
}

#[tauri::command]
pub fn get_system_info() -> SystemInfo {
    check_system()
}

#[tauri::command]
pub fn get_microphone_status() -> MicrophoneStatus {
    check_microphone()
}

#[tauri::command]
pub fn get_input_status() -> InputStatus {
    check_input()
}

#[tauri::command]
pub fn get_update_channel() -> UpdateChannel {
    update_channel()
}

// ── Evdev / global shortcut access checks ────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct EvdevAccessStatus {
    /// Whether /dev/input/event* files can be opened for reading.
    pub can_read_events: bool,
    /// Whether /dev/uinput can be opened for exclusive shortcut passthrough.
    pub can_write_uinput: bool,
    /// Whether the current user is in the `input` group.
    pub in_input_group: bool,
    /// Whether `pkexec` is available on this system.
    pub pkexec_available: bool,
    /// Human-readable message.
    pub message: String,
}

fn check_evdev_readable() -> bool {
    // Try to open one of the event devices — if any is readable, we're good.
    let dir = match std::fs::read_dir("/dev/input") {
        Ok(d) => d,
        Err(_) => return false,
    };

    for entry in dir.flatten() {
        let path = entry.path();
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with("event") && std::fs::metadata(&path).is_ok() {
                // Try to open for reading
                if std::fs::OpenOptions::new()
                    .read(true)
                    .open(&path)
                    .is_ok()
                {
                    return true;
                }
            }
        }
    }
    false
}

fn check_uinput_writable() -> bool {
    std::fs::OpenOptions::new()
        .write(true)
        .open("/dev/uinput")
        .is_ok()
}

fn check_in_input_group() -> bool {
    // Parse /etc/group to find the gid of the `input` group
    let group_content = match std::fs::read_to_string("/etc/group") {
        Ok(c) => c,
        Err(_) => return false,
    };

    let input_gid: Option<u32> = group_content.lines().find_map(|line| {
        let mut parts = line.split(':');
        if parts.next()? == "input" {
            parts.next()?; // x
            parts.next()?.parse().ok()
        } else {
            None
        }
    });

    let input_gid = match input_gid {
        Some(g) => g,
        None => return false,
    };

    // Parse /proc/self/status to find current group list
    let status = match std::fs::read_to_string("/proc/self/status") {
        Ok(c) => c,
        Err(_) => return false,
    };

    for line in status.lines() {
        if let Some(groups_str) = line.strip_prefix("Groups:\t") {
            let groups: Vec<u32> = groups_str
                .split_whitespace()
                .filter_map(|g| g.parse().ok())
                .collect();
            return groups.contains(&input_gid);
        }
    }

    false
}

fn check_pkexec_available() -> bool {
    Command::new("which")
        .arg("pkexec")
        .output()
        .ok()
        .map_or(false, |o| o.status.success())
}

#[tauri::command]
pub fn get_evdev_access_status() -> EvdevAccessStatus {
    let can_read = check_evdev_readable();
    let can_write_uinput = check_uinput_writable();
    let in_group = check_in_input_group();
    let pkexec = check_pkexec_available();

    let message = if can_read && can_write_uinput {
        "Exclusive global shortcuts are accessible.".to_string()
    } else if can_read {
        "Global keyboard events are accessible, but exclusive shortcuts need write access to /dev/uinput."
            .to_string()
    } else if in_group {
        "You are in the 'input' group but permission changes may need a reboot."
            .to_string()
    } else if pkexec {
        "Need to add your user to the 'input' group for global keyboard support."
            .to_string()
    } else {
        "Global keyboard shortcuts require the 'input' group. Run: sudo usermod -a -G input $USER"
            .to_string()
    };

    EvdevAccessStatus {
        can_read_events: can_read,
        can_write_uinput,
        in_input_group: in_group,
        pkexec_available: pkexec,
        message,
    }
}

/// Attempt to add the current user to the `input` group via `pkexec`.
/// Returns a status message. Requires polkit (pkexec) to be installed.
#[tauri::command]
pub fn fix_evdev_permissions() -> Result<String, String> {
    let whoami = Command::new("whoami")
        .output()
        .map_err(|e| format!("Failed to run whoami: {}", e))?;
    let user = String::from_utf8_lossy(&whoami.stdout).trim().to_string();

    if user.is_empty() {
        return Err("Could not determine current user".into());
    }

    let output = Command::new("pkexec")
        .args([
            "usermod",
            "-a",
            "-G",
            "input",
            &user,
        ])
        .output()
        .map_err(|e| format!("Failed to run pkexec: {}", e))?;

    if output.status.success() {
        Ok(format!(
            "Added '{}' to the 'input' group. Please log out and back in for changes to take effect.",
            user
        ))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!(
            "Failed to add to input group: {}",
            stderr.trim()
        ))
    }
}
