import { useNavigate } from "@tanstack/react-router"
import { ArrowsClockwise, Waveform } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { PageShell, PageHeader, Section } from "@/components/page"
import { clearOnboardingComplete } from "@/pages/onboarding-page"

export function GeneralSettingsPage() {
  const navigate = useNavigate()

  const handleRerunWizard = () => {
    clearOnboardingComplete()
    navigate({ to: "/onboarding" })
  }

  return (
    <PageShell>
      <PageHeader
        title="General"
        description="App preferences and defaults."
      />

      <Section>
        <div className="rounded-lg border border-border/60 bg-card/40">
          <div className="flex items-center gap-4 px-5 py-4">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <Waveform weight="fill" className="size-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Setup wizard</p>
              <p className="text-xs text-muted-foreground">
                Re-run the initial setup to reconfigure permissions, shortcuts,
                and system checks.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleRerunWizard}>
              <ArrowsClockwise weight="bold" className="size-3.5" />
              Open wizard
            </Button>
          </div>
        </div>
      </Section>
    </PageShell>
  )
}
