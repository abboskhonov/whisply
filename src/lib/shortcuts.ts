export type ShortcutModifier = "Super" | "Ctrl" | "Alt" | "Shift"

export type ShortcutConfig = {
  modifiers: ShortcutModifier[]
  key: string
}

export type TriggerMode = "hold" | "toggle"

export const DEFAULT_SHORTCUT: ShortcutConfig = {
  modifiers: [],
  key: "F8",
}

export const MODIFIER_LABELS: Record<ShortcutModifier, string> = {
  Super: "⊞ Win",
  Ctrl: "Ctrl",
  Alt: "Alt",
  Shift: "Shift",
}

const KEY_LABELS: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Backspace: "⌫",
  Delete: "Del",
  Escape: "Esc",
  PageUp: "PgUp",
  PageDown: "PgDn",
  PrintScreen: "PrtSc",
  Space: "Space",
}

const CODE_TO_KEY: Record<string, string> = {
  Space: "Space",
  Enter: "Enter",
  Tab: "Tab",
  Escape: "Escape",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  ArrowUp: "ArrowUp",
  ArrowDown: "ArrowDown",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  CapsLock: "CapsLock",
  NumLock: "NumLock",
  ScrollLock: "ScrollLock",
  PrintScreen: "PrintScreen",
  Pause: "Pause",
  Backquote: "Backquote",
  Minus: "Minus",
  Equal: "Equal",
  BracketLeft: "LeftBracket",
  BracketRight: "RightBracket",
  Backslash: "Backslash",
  IntlBackslash: "Backslash",
  Semicolon: "Semicolon",
  Quote: "Quote",
  Comma: "Comma",
  Period: "Period",
  Slash: "Slash",
  NumpadEnter: "KPEnter",
  NumpadAdd: "KPPlus",
  NumpadSubtract: "KPMinus",
  NumpadMultiply: "KPMultiply",
  NumpadDivide: "KPDivide",
  NumpadDecimal: "KPDecimal",
}

export function shortcutKeyLabel(key: string): string {
  return KEY_LABELS[key] ?? key
}

export function comboToShortcutString(combo: ShortcutConfig): string {
  return [...combo.modifiers, combo.key].join("+")
}

export function shortcutFromKeyboardEvent(
  event: KeyboardEvent
): ShortcutConfig | null {
  if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return null

  let key: string | undefined
  if (/^Key[A-Z]$/.test(event.code)) key = event.code.slice(3)
  else if (/^Digit[0-9]$/.test(event.code)) key = event.code.slice(5)
  else if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(event.code)) key = event.code
  else if (/^Numpad[0-9]$/.test(event.code)) key = `KP${event.code.slice(6)}`
  else key = CODE_TO_KEY[event.code]

  if (!key) return null

  const modifiers: ShortcutModifier[] = []
  if (event.metaKey) modifiers.push("Super")
  if (event.ctrlKey) modifiers.push("Ctrl")
  if (event.altKey) modifiers.push("Alt")
  if (event.shiftKey) modifiers.push("Shift")

  return { modifiers, key }
}

export function shortcutValidationError(combo: ShortcutConfig): string | null {
  if (!combo.key) return "Press a key to complete the shortcut."
  if (
    combo.modifiers.length === 0 &&
    !/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(combo.key)
  ) {
    return "Use at least one modifier, or choose a function key such as F8."
  }
  return null
}
