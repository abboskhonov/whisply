import * as React from "react"
import { Terminal } from "@phosphor-icons/react"

import { PageHeader, PageShell, Section } from "@/components/page"
import { setShowLogsInSidebar, showLogsInSidebar } from "@/lib/preferences"

export function AdvancedSettingsPage() {
  const [showLogs, setShowLogs] = React.useState(showLogsInSidebar)

  const toggleLogs = () => {
    const next = !showLogs
    setShowLogs(next)
    setShowLogsInSidebar(next)
  }

  return (
    <PageShell>
      <PageHeader
        title="Advanced"
        description="Developer and diagnostic options."
      />

      <Section>
        <div className="flex items-center gap-4 rounded-lg border border-border/60 bg-card/40 px-5 py-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Terminal weight="regular" className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              Show event logs
            </p>
            <p className="text-xs text-muted-foreground">
              Add the Logs page to the sidebar for troubleshooting.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-label="Show event logs in sidebar"
            aria-checked={showLogs}
            data-state={showLogs ? "on" : "off"}
            onClick={toggleLogs}
            className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-muted p-0.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none data-[state=on]:bg-primary"
          >
            <span
              data-state={showLogs ? "on" : "off"}
              className="size-5 rounded-full bg-background shadow-xs transition-transform data-[state=on]:translate-x-4"
            />
          </button>
        </div>
      </Section>
    </PageShell>
  )
}
