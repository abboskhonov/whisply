const SHOW_LOGS_IN_SIDEBAR_KEY = "whisply-show-logs-in-sidebar"
const OVERLAY_THEME_KEY = "whisply-overlay-theme"
const PREFERENCES_CHANGED_EVENT = "whisply-preferences-changed"
const OVERLAY_THEME_CHANGED_EVENT = "whisply-overlay-theme-changed"

export type OverlayTheme = "graphite" | "signal" | "ember"

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

export { PREFERENCES_CHANGED_EVENT, OVERLAY_THEME_CHANGED_EVENT }
