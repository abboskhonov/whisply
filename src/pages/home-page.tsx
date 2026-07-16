import * as React from "react"
import { TrendUp } from "@phosphor-icons/react"
import { useVirtualizer } from "@tanstack/react-virtual"

import { PageHeader, PageShell, Section } from "@/components/page"
import { StatCard, StatGrid } from "@/components/stats"
import {
  TranscriptGroup,
  TranscriptRow,
} from "@/components/transcript-table"
import {
  type StoredDictation,
  useHomeDashboard,
} from "@/hooks/use-home-dashboard"

const NUMBER_FORMATTER = new Intl.NumberFormat()

export function HomePage() {
  const { dashboard, error, isLoading } = useHomeDashboard()
  const today = dashboard?.today
  const yesterday = dashboard?.yesterday
  const recentDictations = dashboard?.recent_dictations ?? []
  const { todayDictations, yesterdayDictations } = splitRecentDictations(
    recentDictations
  )

  return (
    <PageShell>
      <PageHeader title="Home" actions={null} />

      <Section>
        <StatGrid>
          <StatCard
            value={NUMBER_FORMATTER.format(today?.word_count ?? 0)}
            label="Words dictated today"
          >
            <WordComparison
              todayWordCount={today?.word_count ?? 0}
              yesterdayWordCount={yesterday?.word_count ?? 0}
            />
          </StatCard>

          <StatCard
            value={formatDuration(today?.audio_duration_ms ?? 0)}
            label="Dictation time today"
          >
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {formatDuration(dashboard?.week_dictation_duration_ms ?? 0)}
              </span>{" "}
              dictated this week
            </p>
          </StatCard>

          <StatCard
            value={NUMBER_FORMATTER.format(today?.dictation_count ?? 0)}
            label="Dictations today"
          >
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {NUMBER_FORMATTER.format(dashboard?.active_days_this_week ?? 0)}
              </span>{" "}
              active days this week
            </p>
          </StatCard>
        </StatGrid>
      </Section>

      <Section>
        {isLoading ? (
          <p className="px-1 text-sm text-muted-foreground" aria-busy="true">
            Loading dictation history…
          </p>
        ) : error ? (
          <p className="px-1 text-sm text-destructive" role="alert">
            Couldn’t load dictation history. Your future dictations will still be
            saved locally.
          </p>
        ) : recentDictations.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 px-4 py-10 text-center">
            <p className="text-sm font-medium text-foreground">
              No dictations yet
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your completed dictations will appear here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {todayDictations.length > 0 ? (
              <VirtualTranscriptGroup
                label="Today"
                dictations={todayDictations}
              />
            ) : null}
            {yesterdayDictations.length > 0 ? (
              <VirtualTranscriptGroup
                label="Yesterday"
                dictations={yesterdayDictations}
              />
            ) : null}
          </div>
        )}
      </Section>
    </PageShell>
  )
}

type VirtualTranscriptGroupProps = {
  label: string
  dictations: StoredDictation[]
}

function VirtualTranscriptGroup({
  label,
  dictations,
}: VirtualTranscriptGroupProps) {
  const parentRef = React.useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLLIElement>({
    count: dictations.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    getItemKey: (index) => dictations[index].id,
    overscan: 8,
  })

  return (
    <TranscriptGroup label={label} count={dictations.length}>
      <div ref={parentRef} className="max-h-[32rem] overflow-y-auto">
        <ul className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const dictation = dictations[virtualItem.index]

            return (
              <TranscriptRow
                key={virtualItem.key}
                ref={virtualizer.measureElement}
                data-index={virtualItem.index}
                className="absolute w-full border-b border-border/60 last:border-b-0"
                style={{ transform: `translateY(${virtualItem.start}px)` }}
                time={formatTime(dictation.created_at_ms)}
                text={dictation.text}
              />
            )
          })}
        </ul>
      </div>
    </TranscriptGroup>
  )
}

function WordComparison({
  todayWordCount,
  yesterdayWordCount,
}: {
  todayWordCount: number
  yesterdayWordCount: number
}) {
  if (yesterdayWordCount === 0) {
    return <p className="text-xs text-muted-foreground">No dictations yesterday</p>
  }

  const difference = todayWordCount - yesterdayWordCount
  if (difference > 0) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <TrendUp weight="bold" className="size-3 text-success" />
        <span className="font-semibold text-success">
          +{NUMBER_FORMATTER.format(difference)} words
        </span>
        <span>vs yesterday</span>
      </p>
    )
  }

  if (difference < 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {NUMBER_FORMATTER.format(Math.abs(difference))} fewer words vs yesterday
      </p>
    )
  }

  return <p className="text-xs text-muted-foreground">Same as yesterday</p>
}

function splitRecentDictations(dictations: StoredDictation[]) {
  const today = localDateKey(new Date())
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = localDateKey(yesterday)
  const todayDictations: StoredDictation[] = []
  const yesterdayDictations: StoredDictation[] = []

  for (const dictation of dictations) {
    const dateKey = localDateKey(new Date(dictation.created_at_ms))
    if (dateKey === today) {
      todayDictations.push(dictation)
    } else if (dateKey === yesterdayKey) {
      yesterdayDictations.push(dictation)
    }
  }

  return { todayDictations, yesterdayDictations }
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp))
}

function formatDuration(durationMs: number): string {
  const totalMinutes = Math.floor(durationMs / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`
}
