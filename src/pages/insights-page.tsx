import * as React from "react"

import { DictationArchive } from "@/components/dictation-archive"
import { PageHeader, PageShell, Section } from "@/components/page"
import { StatCard, StatGrid } from "@/components/stats"
import { StreakHeatmap } from "@/components/streak-heatmap"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useInsightsDashboard } from "@/hooks/use-insights-dashboard"
import { HISTORY_DATE_RANGES, type HistoryDateRange } from "@/lib/history"

const NUMBER_FORMATTER = new Intl.NumberFormat()

function StreakCard({
  currentStreakDays,
  longestStreakDays,
  activity,
  compactWeeks,
  expandedWeeks,
}: {
  currentStreakDays: number
  longestStreakDays: number
  activity: Array<{ date: string; dictation_count: number }>
  compactWeeks: number
  expandedWeeks: number
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
      <div className="lg:hidden">
        <StreakHeatmap activity={activity} weeks={compactWeeks} />
      </div>
      <div className="hidden lg:block">
        <StreakHeatmap activity={activity} weeks={expandedWeeks} />
      </div>
    </div>
  )
}

export function InsightsPage() {
  const [dateRange, setDateRange] = React.useState<HistoryDateRange>("all_time")
  const { dashboard, error, isLoading } = useInsightsDashboard(dateRange)
  const rangeLabel = HISTORY_DATE_RANGES.find(
    (range) => range.value === dateRange
  )!.label
  const [compactWeeks, expandedWeeks] = activityWeeks(dateRange)

  return (
    <PageShell>
      <PageHeader
        title="Insights"
        actions={
          <Select
            items={HISTORY_DATE_RANGES}
            value={dateRange}
            onValueChange={(value) => {
              if (value) setDateRange(value as HistoryDateRange)
            }}
          >
            <SelectTrigger aria-label="Insights date range" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end" alignItemWithTrigger={false}>
              <SelectGroup>
                {HISTORY_DATE_RANGES.map((range) => (
                  <SelectItem key={range.value} value={range.value}>
                    {range.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        }
      />

      <Section>
        <StatGrid>
          <StatCard
            value={
              isLoading
                ? "—"
                : NUMBER_FORMATTER.format(
                    dashboard?.average_words_per_minute ?? 0
                  )
            }
            label="Words per minute"
          >
            <p className="text-xs text-muted-foreground">
              {rangeLabel} · based on recorded dictation time.
            </p>
          </StatCard>

          <StatCard
            value={
              isLoading
                ? "—"
                : NUMBER_FORMATTER.format(dashboard?.total_dictation_count ?? 0)
            }
            label="Dictations"
          >
            <p className="text-xs text-muted-foreground">
              Completed during {rangeLabel.toLowerCase()}.
            </p>
          </StatCard>

          <StatCard
            value={
              isLoading
                ? "—"
                : NUMBER_FORMATTER.format(dashboard?.total_word_count ?? 0)
            }
            label="Words dictated"
          >
            <p className="text-xs text-muted-foreground">
              Dictated during {rangeLabel.toLowerCase()}.
            </p>
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
          <StreakCard
            currentStreakDays={dashboard.current_streak_days}
            longestStreakDays={dashboard.longest_streak_days}
            activity={dashboard.activity}
            compactWeeks={compactWeeks}
            expandedWeeks={expandedWeeks}
          />
        ) : null}
      </Section>

      <Section>
        <DictationArchive />
      </Section>
    </PageShell>
  )
}

function activityWeeks(dateRange: HistoryDateRange): [number, number] {
  if (dateRange === "all_time") {
    return [26, 52]
  }

  if (dateRange === "this_month") {
    const today = new Date()
    const weeks = Math.ceil((today.getDay() + today.getDate()) / 7)
    return [weeks, weeks]
  }

  return [1, 1]
}
