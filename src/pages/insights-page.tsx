import { Monitor } from "@phosphor-icons/react"

import { PageHeader, PageShell, Section } from "@/components/page"
import { StatCard, StatGrid } from "@/components/stats"
import { StreakHeatmap } from "@/components/streak-heatmap"
import {
  type InsertionMethodUsage,
  useInsightsDashboard,
} from "@/hooks/use-insights-dashboard"
import { cn } from "@/lib/utils"

const NUMBER_FORMATTER = new Intl.NumberFormat()

function barColor(share: number): string {
  if (share === 0) return "bg-primary/20"
  if (share < 15) return "bg-primary/40"
  if (share < 40) return "bg-primary/60"
  return "bg-primary"
}

function InsertionMethodCard({
  methods,
  totalDictations,
}: {
  methods: InsertionMethodUsage[]
  totalDictations: number
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/50 p-5">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <h3 className="text-xl font-semibold tracking-tight">Insertion methods</h3>
        <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
          {methods.length} {methods.length === 1 ? "method" : "methods"}
        </span>
      </div>

      {methods.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Complete a dictation to see how text was inserted.
        </p>
      ) : (
        <div className="space-y-2">
          {methods.map((method) => {
            const share =
              totalDictations === 0
                ? 0
                : Math.round((method.dictation_count / totalDictations) * 100)

            return (
              <div key={method.method} className="flex items-center gap-3">
                <div className="grid size-6 shrink-0 place-items-center text-muted-foreground">
                  <Monitor weight="regular" className="size-4" />
                </div>
                <div className="flex-1">
                  <div className="h-5 overflow-hidden rounded bg-background/60">
                    <div
                      className={cn(
                        "flex h-full items-center justify-end pr-2 transition-[width] duration-500",
                        barColor(share)
                      )}
                      style={{ width: `${Math.max(share, 4)}%` }}
                    >
                      {share >= 10 ? (
                        <span className="text-[10px] font-semibold tabular-nums text-primary-foreground">
                          {share}%
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <span className="w-32 shrink-0 text-right text-[10px] font-medium tracking-wider text-muted-foreground uppercase whitespace-nowrap">
                  {NUMBER_FORMATTER.format(method.dictation_count)} {formatMethod(method.method)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StreakCard({
  currentStreakDays,
  longestStreakDays,
  activity,
}: {
  currentStreakDays: number
  longestStreakDays: number
  activity: Array<{ date: string; dictation_count: number }>
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/50 p-5">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <h3 className="text-xl font-semibold tracking-tight">
          <span className="text-2xl font-bold tabular-nums">
            {NUMBER_FORMATTER.format(currentStreakDays)}
          </span>{" "}
          <span className="text-foreground/90">day streak</span>
        </h3>
        <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
          Longest streak | {NUMBER_FORMATTER.format(longestStreakDays)} days
        </span>
      </div>
      <StreakHeatmap activity={activity} weeks={26} />
    </div>
  )
}

export function InsightsPage() {
  const { dashboard, error, isLoading } = useInsightsDashboard()

  return (
    <PageShell>
      <PageHeader title="Insights" actions={null} />

      <Section>
        <StatGrid>
          <StatCard
            value={
              isLoading
                ? "—"
                : NUMBER_FORMATTER.format(dashboard?.average_words_per_minute ?? 0)
            }
            label="Words per minute"
          >
            <p className="text-xs text-muted-foreground">
              Based on your recorded dictation time.
            </p>
          </StatCard>

          <StatCard
            value={
              isLoading
                ? "—"
                : NUMBER_FORMATTER.format(dashboard?.total_dictation_count ?? 0)
            }
            label="Total dictations"
          >
            <p className="text-xs text-muted-foreground">All completed dictations.</p>
          </StatCard>

          <StatCard
            value={
              isLoading
                ? "—"
                : NUMBER_FORMATTER.format(dashboard?.total_word_count ?? 0)
            }
            label="Total words dictated"
          >
            <p className="text-xs text-muted-foreground">Across your local history.</p>
          </StatCard>
        </StatGrid>
      </Section>

      <Section>
        {isLoading ? (
          <p className="px-1 text-sm text-muted-foreground" aria-busy="true">
            Loading insights…
          </p>
        ) : error ? (
          <p className="px-1 text-sm text-destructive" role="alert">
            Couldn’t load dictation insights.
          </p>
        ) : dashboard ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <InsertionMethodCard
              methods={dashboard.insertion_methods}
              totalDictations={dashboard.total_dictation_count}
            />
            <StreakCard
              currentStreakDays={dashboard.current_streak_days}
              longestStreakDays={dashboard.longest_streak_days}
              activity={dashboard.activity}
            />
          </div>
        ) : null}
      </Section>
    </PageShell>
  )
}

function formatMethod(method: string): string {
  return method
    .split("+")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" + ")
}
