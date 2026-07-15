import * as React from "react"
import { Check, Waveform } from "@phosphor-icons/react"
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
  overlayTheme,
  setOverlayTheme,
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
                    "flex h-20 items-center gap-2 rounded-lg px-3 shadow-sm",
                    theme.previewClass
                  )}
                >
                  <span
                    className={cn("size-2 rounded-full", theme.accentClass)}
                  />
                  <span className="text-xs font-semibold">Listening</span>
                  <span className="text-[10px] text-white/55">0:08</span>
                  <span className="ml-auto flex h-5 items-center gap-0.5">
                    {[8, 14, 20, 11, 17, 8, 15].map((height, index) => (
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
