import type { MouseEvent } from "react"
import { Minus, Square, X } from "@phosphor-icons/react"
import { getCurrentWindow } from "@tauri-apps/api/window"

import { isTauri } from "@/lib/tauri"

export function Titlebar() {
  const appWindow = isTauri() ? getCurrentWindow() : null

  function handleDragStart(event: MouseEvent<HTMLDivElement>) {
    if (!appWindow || event.button !== 0) {
      return
    }

    if (event.detail === 2) {
      void appWindow.toggleMaximize()
      return
    }

    void appWindow.startDragging()
  }

  return (
    <header className="flex h-9 shrink-0 items-center border-b border-border/60 bg-background pl-3">
      <div
        aria-hidden
        className="min-w-0 flex-1"
        onMouseDown={handleDragStart}
      />
      <div className="flex h-full" aria-label="Window controls">
        <button
          type="button"
          className="grid size-9 place-items-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={() => void appWindow?.minimize()}
          aria-label="Minimize window"
        >
          <Minus className="size-3.5" weight="bold" />
        </button>
        <button
          type="button"
          className="grid size-9 place-items-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={() => void appWindow?.toggleMaximize()}
          aria-label="Maximize or restore window"
        >
          <Square className="size-3" weight="bold" />
        </button>
        <button
          type="button"
          className="grid size-9 place-items-center text-muted-foreground transition-colors hover:bg-red-600 hover:text-white focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:hover:bg-red-500"
          onClick={() => void appWindow?.close()}
          aria-label="Close window"
        >
          <X className="size-3.5" weight="bold" />
        </button>
      </div>
    </header>
  )
}
