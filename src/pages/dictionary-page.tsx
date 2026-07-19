import * as React from "react"
import {
  BookOpen,
  DotsThree,
  MagnifyingGlass,
  Plus,
  Trash,
} from "@phosphor-icons/react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
import { cn } from "@/lib/utils"
import {
  addDictionaryEntry,
  deleteDictionaryEntry,
  listDictionaryEntries,
  type DictionaryEntry,
} from "@/lib/dictionary"

type EntryType = "name" | "acronym" | "jargon" | "other"

const TYPE_LABEL: Record<EntryType, string> = {
  name: "Name",
  acronym: "Acronym",
  jargon: "Jargon",
  other: "Other",
}

const TYPES: EntryType[] = ["name", "acronym", "jargon", "other"]

function AddWordDialog({ onAdded = () => {} }: { onAdded?: () => void }) {
  const [open, setOpen] = React.useState(false)
  const [term, setTerm] = React.useState("")
  const [pronunciation, setPronunciation] = React.useState("")
  const [type, setType] = React.useState<EntryType>("name")
  const [note, setNote] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  const reset = () => {
    setTerm("")
    setPronunciation("")
    setType("name")
    setNote("")
    setError(null)
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) reset()
  }

  const handleAdd = async () => {
    if (!term.trim()) return
    setSaving(true)
    setError(null)
    try {
      await addDictionaryEntry({
        term: term.trim(),
        pronunciation: pronunciation.trim() || null,
        entry_type: type,
        note: note.trim() || null,
      })
      onAdded()
      setOpen(false)
      reset()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save word.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus weight="bold" className="size-3.5" />
        Add word
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add word</DialogTitle>
          <DialogDescription>
            Whisply will always recognise and spell this correctly.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="dict-term" className="text-xs font-medium">
              Term
            </label>
            <Input
              id="dict-term"
              placeholder="e.g. Whisply"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="dict-pron" className="text-xs font-medium">
              Pronunciation{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </label>
            <Input
              id="dict-pron"
              placeholder="e.g. WIZ-plee"
              value={pronunciation}
              onChange={(e) => setPronunciation(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium">Type</span>
            <div className="flex flex-wrap gap-1.5">
              {TYPES.map((t) => {
                const active = type === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {TYPE_LABEL[t]}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="dict-note" className="text-xs font-medium">
              Note{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </label>
            <Input
              id="dict-note"
              placeholder="e.g. Always capitalised"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            onClick={() => void handleAdd()}
            disabled={!term.trim() || saving}
          >
            {saving ? "Adding…" : "Add word"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DictionaryPage() {
  const [entries, setEntries] = React.useState<DictionaryEntry[]>([])
  const [query, setQuery] = React.useState("")
  const refresh = React.useCallback(() => {
    listDictionaryEntries().then(setEntries).catch(console.error)
  }, [])
  React.useEffect(() => {
    refresh()
  }, [refresh])
  const visible = entries.filter((entry) =>
    [entry.term, entry.pronunciation, entry.note]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase())
  )
  return (
    <PageShell>
      <PageHeader
        title="Dictionary"
        description="Custom words Whisply always recognises and spells correctly."
        actions={<AddWordDialog onAdded={refresh} />}
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
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </Section>

      <Section>
        <SectionHeader
          title="Words"
          description={`${entries.length} entries`}
        />
        {visible.length > 0 ? (
          <List>
            {visible.map((entry) => (
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
                      {TYPE_LABEL[entry.entry_type]}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground opacity-0 transition-opacity group-hover/item:opacity-100"
                      aria-label={`Remove ${entry.term}`}
                      onClick={() =>
                        deleteDictionaryEntry(entry.id)
                          .then(refresh)
                          .catch(console.error)
                      }
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
            action={<AddWordDialog onAdded={refresh} />}
          />
        )}
      </Section>
    </PageShell>
  )
}
