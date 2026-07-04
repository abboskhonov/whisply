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

type EntryType = "name" | "acronym" | "jargon" | "other"

const ENTRIES: Array<{
  id: string
  term: string
  pronunciation?: string
  type: EntryType
  note?: string
}> = [
  { id: "d-1", term: "Whisply", type: "name", note: "Always capitalised." },
  { id: "d-2", term: "Tauri", pronunciation: "TAW-ree", type: "name" },
  { id: "d-3", term: "WPM", type: "acronym", note: "Words per minute." },
  { id: "d-4", term: "ASR", type: "acronym", note: "Automatic speech recognition." },
  { id: "d-5", term: "Linnea", pronunciation: "LIN-ay-ah", type: "name" },
]

const TYPE_LABEL: Record<EntryType, string> = {
  name: "Name",
  acronym: "Acronym",
  jargon: "Jargon",
  other: "Other",
}

const TYPES: EntryType[] = ["name", "acronym", "jargon", "other"]

function AddWordDialog() {
  const [open, setOpen] = React.useState(false)
  const [term, setTerm] = React.useState("")
  const [pronunciation, setPronunciation] = React.useState("")
  const [type, setType] = React.useState<EntryType>("name")
  const [note, setNote] = React.useState("")

  const reset = () => {
    setTerm("")
    setPronunciation("")
    setType("name")
    setNote("")
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) reset()
  }

  const handleAdd = () => {
    if (!term.trim()) return
    // TODO: persist entry
    setOpen(false)
    reset()
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
            <label
              htmlFor="dict-pron"
              className="text-xs font-medium"
            >
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
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button onClick={handleAdd} disabled={!term.trim()}>
            Add word
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DictionaryPage() {
  return (
    <PageShell>
      <PageHeader
        title="Dictionary"
        description="Custom words Whisply always recognises and spells correctly."
        actions={<AddWordDialog />}
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
            action={<AddWordDialog />}
          />
        )}
      </Section>
    </PageShell>
  )
}
