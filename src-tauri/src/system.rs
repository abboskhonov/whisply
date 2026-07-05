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
    let devices = cpal::input_devices().ok();
    let device_count = devices.as_ref().map(|d| d.count()).unwrap_or(0);
    let default_device = devices
        .as_ref()
        .and_then(|mut d| d.next())
        .and_then(|d| d.name().ok());

    MicrophoneStatus {
        available: device_count > 0,
        device_count,
        default_device,
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
