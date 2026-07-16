import { PageHeader, PageShell, Section, SectionHeader } from "@/components/page"
import { useTheme } from "@/components/theme-provider"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type ThemeOption = "light" | "dark" | "system"

const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

export function AppearanceSettingsPage() {
  const { theme, setTheme } = useTheme()

  return (
    <PageShell>
      <PageHeader
        title="Appearance"
        description="Choose how Whisply looks across the app."
      />

      <Section>
        <SectionHeader
          title="Interface theme"
          description="System follows your computer’s color preference."
        />
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-card/40 px-5 py-4">
          <p className="text-sm font-medium text-foreground">Theme</p>
          <Select
            items={THEME_OPTIONS}
            value={theme}
            onValueChange={(value) => {
              if (value) setTheme(value as ThemeOption)
            }}
          >
            <SelectTrigger aria-label="Interface theme" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {THEME_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </Section>
    </PageShell>
  )
}
