import {
  CalendarBlank,
  ChartLineUp,
  Clock,
  Hash,
} from "@phosphor-icons/react"

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
  SectionHeader,
} from "@/components/page"

const OVERVIEW: Array<{
  id: string
  label: string
  value: string
  hint: string
}> = [
  { id: "o-1", label: "Recordings", value: "128", hint: "+12 this week" },
  { id: "o-2", label: "Words transcribed", value: "184,302", hint: "+9.4% vs last week" },
  { id: "o-3", label: "Avg. duration", value: "08:42", hint: "across all recordings" },
  { id: "o-4", label: "Speaking rate", value: "146 wpm", hint: "median, last 30 days" },
]

const ACTIVITY: Array<{
  id: string
  day: string
  count: number
  minutes: number
}> = [
  { id: "a-1", day: "Today", count: 3, minutes: 34 },
  { id: "a-2", day: "Yesterday", count: 5, minutes: 51 },
  { id: "a-3", day: "Mon", count: 4, minutes: 42 },
  { id: "a-4", day: "Sun", count: 2, minutes: 18 },
  { id: "a-5", day: "Sat", count: 1, minutes: 12 },
]

const TOPICS: Array<{ id: string; tag: string; share: number }> = [
  { id: "t-1", tag: "Product", share: 38 },
  { id: "t-2", tag: "Customer research", share: 24 },
  { id: "t-3", tag: "Planning", share: 19 },
  { id: "t-4", tag: "Design", share: 12 },
  { id: "t-5", tag: "Other", share: 7 },
]

export function InsightsPage() {
  return (
    <PageShell>
      <PageHeader
        title="Insights"
        description="A look at what you record, when, and how much of it."
      />

      <Section>
        <SectionHeader
          title="Overview"
          description="Totals across all your transcriptions."
        />
        <List>
          {OVERVIEW.map((row) => (
            <ListItem key={row.id}>
              <ListRow>
                <ListLeading
                  tone="accent"
                  icon={<ChartLineUp weight="bold" className="size-4" />}
                />
                <ListContent>
                  <ListTitle>{row.label}</ListTitle>
                  <ListSubtitle>{row.hint}</ListSubtitle>
                </ListContent>
                <ListTrailing className="text-right">
                  <span className="text-base font-semibold tabular-nums text-foreground">
                    {row.value}
                  </span>
                </ListTrailing>
              </ListRow>
            </ListItem>
          ))}
        </List>
      </Section>

      <Section>
        <SectionHeader
          title="Activity"
          description="Recording volume over the last few days."
        />
        <List>
          {ACTIVITY.map((row) => (
            <ListItem key={row.id}>
              <ListRow>
                <ListLeading
                  icon={<CalendarBlank weight="regular" className="size-4" />}
                />
                <ListContent>
                  <ListTitle>{row.day}</ListTitle>
                  <ListSubtitle>
                    {row.count} {row.count === 1 ? "recording" : "recordings"}
                  </ListSubtitle>
                </ListContent>
                <ListTrailing>
                  <span className="flex items-center gap-1 text-[11px] tabular-nums text-foreground/70">
                    <Clock weight="regular" className="size-3" />
                    {row.minutes} min
                  </span>
                </ListTrailing>
              </ListRow>
            </ListItem>
          ))}
        </List>
      </Section>

      <Section>
        <SectionHeader
          title="Topics"
          description="Auto-detected from your transcriptions."
        />
        <List>
          {TOPICS.map((row) => (
            <ListItem key={row.id}>
              <ListRow>
                <ListLeading
                  icon={<Hash weight="bold" className="size-4" />}
                />
                <ListContent>
                  <ListTitle>{row.tag}</ListTitle>
                  <ListSubtitle>
                    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary/70"
                        style={{ width: `${row.share}%` }}
                      />
                    </span>
                  </ListSubtitle>
                </ListContent>
                <ListTrailing className="text-right">
                  <span className="text-sm font-medium tabular-nums text-foreground">
                    {row.share}%
                  </span>
                </ListTrailing>
              </ListRow>
            </ListItem>
          ))}
        </List>
      </Section>
    </PageShell>
  )
}
