import {
  ChatCircle,
  Code,
  EnvelopeSimple,
  FileText,
  Globe,
  Info,
  Monitor,
  Notebook,
} from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { PageHeader, PageShell, Section } from "@/components/page"
import { StatCard, StatCardGauge, StatGrid } from "@/components/stats"
import { StreakHeatmap } from "@/components/streak-heatmap"
import { cn } from "@/lib/utils"

const DICTATION_USAGE = [
  { id: "email", label: "Email", icon: EnvelopeSimple, count: 45, share: 35 },
  { id: "docs", label: "Documents", icon: FileText, count: 28, share: 22 },
  { id: "chat", label: "Chat", icon: ChatCircle, count: 20, share: 16 },
  { id: "code", label: "Code", icon: Code, count: 15, share: 12 },
  { id: "notes", label: "Notes", icon: Notebook, count: 12, share: 9 },
  { id: "browser", label: "Browser", icon: Globe, count: 8, share: 6 },
] as const

function barColor(share: number): string {
  if (share === 0) return "bg-teal-300 dark:bg-teal-900"
  if (share < 15) return "bg-teal-400 dark:bg-teal-700"
  if (share < 40) return "bg-teal-500 dark:bg-teal-600"
  return "bg-teal-600 dark:bg-teal-500"
}

function DictationUsageCard() {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/50 p-5">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <h3 className="text-xl font-semibold tracking-tight">
          Dictation usage
        </h3>
        <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
          Total apps used | {DICTATION_USAGE.length}
        </span>
      </div>

      <div className="space-y-2">
        {DICTATION_USAGE.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.id} className="flex items-center gap-3">
              <div className="grid size-6 shrink-0 place-items-center text-muted-foreground">
                <Icon weight="regular" className="size-4" />
              </div>
              <div className="flex-1">
                <div className="h-5 overflow-hidden rounded bg-background/60">
                  <div
                    className={cn(
                      "flex h-full items-center justify-end pr-2 transition-[width] duration-500",
                      barColor(item.share)
                    )}
                    style={{ width: `${Math.max(item.share, 4)}%` }}
                  >
                    {item.share >= 10 ? (
                      <span className="text-[10px] font-semibold tabular-nums text-white">
                        {item.share}%
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <span className="w-28 shrink-0 text-right text-[10px] font-medium tracking-wider text-muted-foreground uppercase whitespace-nowrap">
                {item.count} {item.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StreakCard() {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/50 p-5">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <h3 className="text-xl font-semibold tracking-tight">
          <span className="text-2xl font-bold tabular-nums">12</span>{" "}
          <span className="text-foreground/90">day streak</span>
        </h3>
        <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
          Longest streak | 28 days
        </span>
      </div>
      <StreakHeatmap weeks={26} />
    </div>
  )
}

function InfoIcon() {
  return (
    <Info weight="regular" className="size-3 text-muted-foreground/80" />
  )
}

export function InsightsPage() {
  return (
    <PageShell>
      <PageHeader title="Insights" actions={null} />

      <Section>
        <StatGrid>
          <StatCard
            value="146"
            label="Words per minute"
            labelTrailing={<InfoIcon />}
          >
            <StatCardGauge value={0.88} sublabel="Top" />
          </StatCard>

          <StatCard
            value="0"
            label="Fixes by Whisply"
            labelTrailing={<InfoIcon />}
          >
            <p className="text-xs text-muted-foreground">
              Clean runs so far today.
            </p>
          </StatCard>

          <StatCard
            value="12,847"
            label="Total words dictated"
            labelTrailing={<InfoIcon />}
          >
            <div className="-mx-4 -mb-4 mt-2 flex items-center justify-between gap-3 rounded-b-lg border-t border-border/60 bg-muted/30 px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <Monitor className="size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-xs font-medium text-foreground">
                    Desktop
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    45 words today
                  </div>
                </div>
              </div>
              <Button variant="outline" size="xs">
                Download on mobile
              </Button>
            </div>
          </StatCard>
        </StatGrid>
      </Section>

      <Section>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <DictationUsageCard />
          <StreakCard />
        </div>
      </Section>
    </PageShell>
  )
}
