import * as React from "react"
import { Check, Waveform } from "@phosphor-icons/react"
import { invoke } from "@tauri-apps/api/core"
import { emit } from "@tauri-apps/api/event"

import { Badge } from "@/components/ui/badge"
import {
  PageHeader,
  PageShell,
  Section,
  SectionHeader,
} from "@/components/page"
import {
  OVERLAY_THEME_CHANGED_EVENT,
  overlayPosition,
  overlayTheme,
  setOverlayPosition,
  setOverlayTheme,
  type OverlayPosition,
  type OverlayTheme,
} from "@/lib/preferences"
import { isTauri } from "@/lib/tauri"
import { cn } from "@/lib/utils"

type ThemeOption = {
  id: OverlayTheme
  name: string
  description: string
  previewClass: string
  accentClass: string
}

const OVERLAY_POSITIONS: Array<{ id: OverlayPosition; label: string }> = [
  { id: "top-left", label: "Top left" },
  { id: "top-center", label: "Top center" },
  { id: "top-right", label: "Top right" },
  { id: "bottom-left", label: "Bottom left" },
  { id: "bottom-center", label: "Bottom center" },
  { id: "bottom-right", label: "Bottom right" },
]

const OVERLAY_THEMES: ThemeOption[] = [
  {
    id: "graphite",
    name: "Graphite",
    description: "A quiet dark surface with a warm recording signal.",
    previewClass: "bg-[#17191f] text-white",
    accentClass: "bg-rose-400",
  },
  {
    id: "signal",
    name: "Signal",
    description: "A cool midnight theme with a crisp blue waveform.",
    previewClass: "bg-[#0e1728] text-white",
    accentClass: "bg-sky-400",
  },
  {
    id: "ember",
    name: "Ember",
    description: "A softened black theme with an amber recording signal.",
    previewClass: "bg-[#1c1713] text-white",
    accentClass: "bg-amber-400",
  },
]

export function StylePage() {
  const [selectedTheme, setSelectedTheme] =
    React.useState<OverlayTheme>(overlayTheme)
  const [selectedPosition, setSelectedPosition] =
    React.useState<OverlayPosition>(overlayPosition)

  const selectTheme = async (theme: OverlayTheme) => {
    setSelectedTheme(theme)
    setOverlayTheme(theme)
    if (isTauri()) {
      try {
        await emit(OVERLAY_THEME_CHANGED_EVENT, theme)
      } catch (cause) {
        console.error("Failed to update overlay theme:", cause)
      }
    }
  }

  const selectPosition = async (position: OverlayPosition) => {
    setSelectedPosition(position)
    setOverlayPosition(position)
    if (isTauri()) {
      try {
        await invoke("set_overlay_position", { position })
      } catch (cause) {
        console.error("Failed to update overlay position:", cause)
      }
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Overlay style"
        description="Choose how the recording indicator looks when you use your dictation shortcut."
      />

      <Section>
        <SectionHeader
          title="Themes"
          description="Graphite is the default. Your choice is used for every new dictation."
        />
        <div className="grid gap-3 md:grid-cols-3">
          {OVERLAY_THEMES.map((theme) => {
            const selected = theme.id === selectedTheme
            return (
              <button
                key={theme.id}
                type="button"
                aria-pressed={selected}
                onClick={() => void selectTheme(theme.id)}
                className={cn(
                  "flex min-h-52 flex-col rounded-xl border p-3 text-left transition-colors outline-none",
                  "hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "border-primary bg-primary/[0.04]"
                    : "border-border/60 bg-card/40"
                )}
              >
                <div
                  className={cn(
                    "flex h-20 items-center justify-center gap-3 rounded-lg px-3 shadow-sm",
                    theme.previewClass
                  )}
                >
                  <span className="text-[10px] text-white/55">0:08</span>
                  <span className="flex h-4 items-center gap-1">
                    {[5, 10, 15, 8, 13, 5, 11].map((height, index) => (
                      <span
                        key={index}
                        className={cn("w-0.5 rounded-full", theme.accentClass)}
                        style={{ height }}
                      />
                    ))}
                  </span>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {theme.name}
                  </span>
                  {theme.id === "graphite" ? (
                    <Badge
                      variant="secondary"
                      className="rounded-full px-2 py-0 text-[10px]"
                    >
                      Default
                    </Badge>
                  ) : null}
                  {selected ? (
                    <Check
                      weight="bold"
                      className="ml-auto size-4 text-primary"
                    />
                  ) : null}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {theme.description}
                </p>
              </button>
            )
          })}
        </div>
      </Section>

      <Section>
        <SectionHeader
          title="Position"
          description="Choose where the recording indicator appears."
        />
        <div className="grid grid-cols-3 gap-2">
          {OVERLAY_POSITIONS.map((position) => {
            const selected = position.id === selectedPosition
            return (
              <button
                key={position.id}
                type="button"
                aria-pressed={selected}
                onClick={() => void selectPosition(position.id)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs font-medium transition-colors outline-none",
                  "hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "border-primary bg-primary/[0.08] text-foreground"
                    : "border-border/60 bg-card/40 text-muted-foreground"
                )}
              >
                {position.label}
              </button>
            )
          })}
        </div>
      </Section>

      <Section>
        <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-4 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
            <Waveform weight="regular" className="size-4" />
          </span>
          <p className="text-xs text-muted-foreground">
            The overlay appears only while recording, transcribing, or showing
            an error.
          </p>
        </div>
      </Section>
    </PageShell>
  )
}
