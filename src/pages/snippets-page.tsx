import {
  BookmarkSimple,
  Copy,
  Hash,
  MagnifyingGlass,
  Plus,
  Sparkle,
} from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  EmptyState,
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

const SNIPPETS: Array<{
  id: string
  name: string
  preview: string
  tags: string[]
  used: number
}> = [
  {
    id: "s-1",
    name: "Standup opener",
    preview:
      "Quick standup — what I worked on yesterday, what I'm working on today, and any blockers…",
    tags: ["meetings", "team"],
    used: 28,
  },
  {
    id: "s-2",
    name: "Customer follow-up",
    preview:
      "Thanks so much for the time today — I've written up the key takeaways and next steps below…",
    tags: ["customer", "email"],
    used: 11,
  },
  {
    id: "s-3",
    name: "Bug report template",
    preview:
      "Steps to reproduce, expected vs actual behavior, environment, and severity. Add a screen…",
    tags: ["engineering"],
    used: 6,
  },
  {
    id: "s-4",
    name: "Weekly retro prompt",
    preview:
      "Three wins, three misses, one thing to try next week. What surprised you, and what didn't?",
    tags: ["meetings", "retrospective"],
    used: 4,
  },
]

export function SnippetsPage() {
  return (
    <PageShell>
      <PageHeader
        title="Snippets"
        description="Reusable text blocks you can drop into any transcription."
        actions={
          <Button size="sm">
            <Plus weight="bold" className="size-3.5" />
            New snippet
          </Button>
        }
      />

      <Section>
        <div className="relative">
          <MagnifyingGlass
            weight="bold"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search snippets by name or tag…"
            className="h-9 pl-9 text-sm"
          />
        </div>
      </Section>

      <Section>
        <SectionHeader
          title="All snippets"
          description={`${SNIPPETS.length} saved`}
        />
        {SNIPPETS.length > 0 ? (
          <List>
            {SNIPPETS.map((s) => (
              <ListItem key={s.id}>
                <ListRow>
                  <ListLeading
                    tone="accent"
                    icon={<BookmarkSimple weight="fill" className="size-4" />}
                  />
                  <ListContent>
                    <ListTitle>{s.name}</ListTitle>
                    <ListSubtitle>{s.preview}</ListSubtitle>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {s.tags.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground"
                        >
                          <Hash weight="bold" className="size-2.5" />
                          {t}
                        </span>
                      ))}
                    </div>
                  </ListContent>
                  <ListTrailing className="flex-col items-end gap-1 text-right">
                    <span className="text-[11px] tabular-nums text-foreground/70">
                      {s.used}× used
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="size-6 text-muted-foreground opacity-0 transition-opacity group-hover/item:opacity-100"
                      aria-label={`Copy ${s.name}`}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                  </ListTrailing>
                </ListRow>
              </ListItem>
            ))}
          </List>
        ) : (
          <EmptyState
            icon={<Sparkle weight="regular" className="size-5" />}
            title="No snippets yet"
            description="Save phrases you reuse often and drop them into any transcript."
            action={
              <Button size="sm">
                <Plus weight="bold" className="size-3.5" />
                New snippet
              </Button>
            }
          />
        )}
      </Section>
    </PageShell>
  )
}
