import {
  CaretRight,
  Cpu,
  Cursor,
  GearSix,
  Info,
  Keyboard,
  Microphone,
  Palette,
  Sliders,
} from "@phosphor-icons/react"
import { useNavigate } from "@tanstack/react-router"

import {
  List,
  ListContent,
  ListItem,
  ListLeading,
  ListRow,
  ListSubtitle,
  ListTitle,
  ListTrailing,
  PageHeader,
  PageShell,
  Section,
} from "@/components/page"

const SETTINGS_CATEGORIES = [
  {
    id: "general",
    label: "General",
    icon: GearSix,
    description: "App preferences and defaults.",
  },
  {
    id: "dictation",
    label: "Dictation",
    icon: Microphone,
    description: "Microphone access and recording input.",
  },
  {
    id: "models",
    label: "Models",
    icon: Cpu,
    description: "Local speech models for transcription.",
  },
  {
    id: "shortcut",
    label: "Shortcut",
    icon: Keyboard,
    description: "Hotkeys for start, stop, and modes.",
  },
  {
    id: "text-insertion",
    label: "Text insertion",
    icon: Cursor,
    description: "How transcribed text is pasted in.",
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: Palette,
    description: "Theme, accent, and typography.",
  },
  {
    id: "advanced",
    label: "Advanced",
    icon: Sliders,
    description: "Power user options, logs, and diagnostics.",
  },
  {
    id: "about",
    label: "About",
    icon: Info,
    description: "Version, updates, and licenses.",
  },
]

export function SettingsPage() {
  const navigate = useNavigate()

  return (
    <PageShell>
      <PageHeader
        title="Settings"
        description="Configure Whisply for the way you work."
      />
      <Section>
        <List>
          {SETTINGS_CATEGORIES.map((cat) => {
            const Icon = cat.icon
            return (
              <ListItem key={cat.id}>
                <ListRow
                  className="cursor-pointer"
                  onClick={() => navigate({ to: `/settings/${cat.id}` })}
                >
                  <ListLeading
                    icon={<Icon weight="regular" className="size-4" />}
                  />
                  <ListContent>
                    <ListTitle>{cat.label}</ListTitle>
                    <ListSubtitle>{cat.description}</ListSubtitle>
                  </ListContent>
                  <ListTrailing>
                    <CaretRight className="size-3.5 text-muted-foreground" />
                  </ListTrailing>
                </ListRow>
              </ListItem>
            )
          })}
        </List>
      </Section>
    </PageShell>
  )
}
