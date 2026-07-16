const SHOW_LOGS_IN_SIDEBAR_KEY = "whisply-show-logs-in-sidebar"
const OVERLAY_THEME_KEY = "whisply-overlay-theme"
const OVERLAY_POSITION_KEY = "whisply-overlay-position"
const PREFERENCES_CHANGED_EVENT = "whisply-preferences-changed"
const OVERLAY_THEME_CHANGED_EVENT = "whisply-overlay-theme-changed"

export type OverlayTheme = "graphite" | "signal" | "ember"
export type OverlayPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"

export function showLogsInSidebar() {
  return localStorage.getItem(SHOW_LOGS_IN_SIDEBAR_KEY) === "true"
}

export function setShowLogsInSidebar(show: boolean) {
  localStorage.setItem(SHOW_LOGS_IN_SIDEBAR_KEY, String(show))
  window.dispatchEvent(new Event(PREFERENCES_CHANGED_EVENT))
}

export function overlayTheme(): OverlayTheme {
  const saved = localStorage.getItem(OVERLAY_THEME_KEY)
  return saved === "signal" || saved === "ember" ? saved : "graphite"
}

export function setOverlayTheme(theme: OverlayTheme) {
  localStorage.setItem(OVERLAY_THEME_KEY, theme)
  window.dispatchEvent(new Event(OVERLAY_THEME_CHANGED_EVENT))
}

export function overlayPosition(): OverlayPosition {
  const saved = localStorage.getItem(OVERLAY_POSITION_KEY)
  return saved === "top-left" ||
    saved === "top-right" ||
    saved === "bottom-left" ||
    saved === "bottom-center" ||
    saved === "bottom-right"
    ? saved
    : "top-center"
}

export function setOverlayPosition(position: OverlayPosition) {
  localStorage.setItem(OVERLAY_POSITION_KEY, position)
  window.dispatchEvent(new Event(PREFERENCES_CHANGED_EVENT))
}

export { PREFERENCES_CHANGED_EVENT, OVERLAY_THEME_CHANGED_EVENT }
