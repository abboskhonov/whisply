import {
  BookOpen,
  DotsThree,
  MagnifyingGlass,
  Plus,
  Trash,
} from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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

type EntryType = "name" | "acronym" | "jargon" | "other"

const ENTRIES: Array<{
  id: string
  term: string
  pronunciation?: string
  type: EntryType
  note?: string
}> = [
  {
    id: "d-1",
    term: "Whisply",
    type: "name",
    note: "Always capitalised.",
  },
  {
    id: "d-2",
    term: "Tauri",
    pronunciation: "TAW-ree",
    type: "name",
  },
  {
    id: "d-3",
    term: "WPM",
    type: "acronym",
    note: "Words per minute.",
  },
  {
    id: "d-4",
    term: "ASR",
    type: "acronym",
    note: "Automatic speech recognition.",
  },
  {
    id: "d-5",
    term: "Linnea",
    pronunciation: "LIN-ay-ah",
    type: "name",
  },
]

const TYPE_LABEL: Record<EntryType, string> = {
  name: "Name",
  acronym: "Acronym",
  jargon: "Jargon",
  other: "Other",
}

export function DictionaryPage() {
  return (
    <PageShell>
      <PageHeader
        title="Dictionary"
        description="Custom words Whisply always recognises and spells correctly."
        actions={
          <Button size="sm">
            <Plus weight="bold" className="size-3.5" />
            Add word
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
            placeholder="Search words, acronyms, or notes…"
            className="h-9 pl-9 text-sm"
          />
        </div>
      </Section>

      <Section>
        <SectionHeader
          title="Words"
          description={`${ENTRIES.length} entries`}
        />
        {ENTRIES.length > 0 ? (
          <List>
            {ENTRIES.map((entry) => (
              <ListItem key={entry.id}>
                <ListRow>
                  <ListLeading
                    icon={<BookOpen weight="regular" className="size-4" />}
                  />
                  <ListContent>
                    <ListTitle className="flex items-center gap-2">
                      <span>{entry.term}</span>
                      {entry.pronunciation ? (
                        <span className="font-mono text-[11px] text-muted-foreground">
                          /{entry.pronunciation}/
                        </span>
                      ) : null}
                    </ListTitle>
                    <ListSubtitle>{entry.note ?? "—"}</ListSubtitle>
                  </ListContent>
                  <ListTrailing className="gap-3">
                    <Badge
                      variant="secondary"
                      className="rounded-full px-2 py-0 text-[10.5px] font-medium tracking-wide uppercase"
                    >
                      {TYPE_LABEL[entry.type]}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground opacity-0 transition-opacity group-hover/item:opacity-100"
                      aria-label={`Remove ${entry.term}`}
                    >
                      <Trash className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground opacity-0 transition-opacity group-hover/item:opacity-100"
                      aria-label="More actions"
                    >
                      <DotsThree weight="bold" className="size-3.5" />
                    </Button>
                  </ListTrailing>
                </ListRow>
              </ListItem>
            ))}
          </List>
        ) : (
          <EmptyState
            icon={<BookOpen weight="regular" className="size-5" />}
            title="Your dictionary is empty"
            description="Add names, jargon, or acronyms so Whisply spells them right."
          />
        )}
      </Section>
    </PageShell>
  )
}
