import { invoke } from "@tauri-apps/api/core"

export type SystemInfo = {
  os: string
  kernel: string
  desktop: string
  session_type: string
  audio_system: string
}

export type MicrophoneStatus = {
  available: boolean
  device_count: number
  default_device: string | null
}

export type InputStatus = {
  available: boolean
  method: string
  wayland: boolean
}

export type EvdevAccessStatus = {
  can_read_events: boolean
  can_write_uinput: boolean
  in_input_group: boolean
  pkexec_available: boolean
  message: string
}

export async function getSystemInfo(): Promise<SystemInfo> {
  return invoke<SystemInfo>("get_system_info")
}

export async function getMicrophoneStatus(): Promise<MicrophoneStatus> {
  return invoke<MicrophoneStatus>("get_microphone_status")
}

export async function getInputStatus(): Promise<InputStatus> {
  return invoke<InputStatus>("get_input_status")
}

export async function getEvdevAccessStatus(): Promise<EvdevAccessStatus> {
  return invoke<EvdevAccessStatus>("get_evdev_access_status")
}

export async function fixEvdevPermissions(): Promise<string> {
  return invoke<string>("fix_evdev_permissions")
}

export async function initializeInput(): Promise<void> {
  return invoke<void>("initialize_input")
}

export async function testInputConnection(): Promise<boolean> {
  return invoke<boolean>("test_input_connection")
}
