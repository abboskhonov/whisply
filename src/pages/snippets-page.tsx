import * as React from "react"
import {
  BookmarkSimple,
  Hash,
  MagnifyingGlass,
  Plus,
  Sparkle,
  Trash,
} from "@phosphor-icons/react"

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
import { type NewSnippet, useSnippets } from "@/hooks/use-snippets"

function AddSnippetDialog({
  onAdd,
  isSaving,
}: {
  onAdd: (snippet: NewSnippet) => Promise<unknown>
  isSaving: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [body, setBody] = React.useState("")
  const [tags, setTags] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  const reset = () => {
    setName("")
    setBody("")
    setTags("")
    setError(null)
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) reset()
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    try {
      await onAdd({
        name,
        body,
        tags: tags.split(","),
      })
      setOpen(false)
      reset()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save snippet.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus weight="bold" className="size-3.5" />
        New snippet
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New snippet</DialogTitle>
            <DialogDescription>
              Say “insert [snippet name]” as a complete dictation to insert it.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="snippet-name" className="text-xs font-medium">
                Name
              </label>
              <Input
                id="snippet-name"
                placeholder="e.g. Standup opener"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="snippet-body" className="text-xs font-medium">
                Text
              </label>
              <textarea
                id="snippet-body"
                placeholder="The text to insert…"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                className="min-h-36 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="snippet-tags" className="text-xs font-medium">
                Tags <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Input
                id="snippet-tags"
                placeholder="e.g. meetings, team"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
              />
            </div>
          </div>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={isSaving || !name.trim() || !body.trim()}>
              {isSaving ? "Saving…" : "Save snippet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function SnippetsPage() {
  const { snippets, error, isLoading, addSnippet, deleteSnippet } = useSnippets()
  const [search, setSearch] = React.useState("")
  const normalizedSearch = search.trim().toLowerCase()
  const filteredSnippets = snippets.filter((snippet) => {
    if (!normalizedSearch) return true
    return [snippet.name, snippet.body, ...snippet.tags].some((value) =>
      value.toLowerCase().includes(normalizedSearch)
    )
  })

  return (
    <PageShell>
      <PageHeader
        title="Snippets"
        description="Reusable text blocks. Say “insert [snippet name]” to insert one during dictation."
        actions={
          <AddSnippetDialog
            onAdd={addSnippet.mutateAsync}
            isSaving={addSnippet.isPending}
          />
        }
      />

      <Section>
        <div className="relative">
          <MagnifyingGlass
            weight="bold"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search snippets by name, text, or tag…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-9 pl-9 text-sm"
          />
        </div>
      </Section>

      <Section>
        <SectionHeader
          title="All snippets"
          description={`${snippets.length} saved`}
        />
        {isLoading ? (
          <p className="px-1 text-sm text-muted-foreground" aria-busy="true">
            Loading snippets…
          </p>
        ) : error ? (
          <p className="px-1 text-sm text-destructive" role="alert">
            Couldn’t load snippets.
          </p>
        ) : filteredSnippets.length > 0 ? (
          <List>
            {filteredSnippets.map((snippet) => (
              <ListItem key={snippet.id}>
                <ListRow>
                  <ListLeading
                    tone="accent"
                    icon={<BookmarkSimple weight="fill" className="size-4" />}
                  />
                  <ListContent>
                    <ListTitle>{snippet.name}</ListTitle>
                    <ListSubtitle>{snippet.body}</ListSubtitle>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-medium text-primary">
                        Say “insert {snippet.name}”
                      </span>
                      {snippet.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground"
                        >
                          <Hash weight="bold" className="size-2.5" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  </ListContent>
                  <ListTrailing className="flex-col items-end gap-1 text-right">
                    <span className="text-[11px] tabular-nums text-foreground/70">
                      {snippet.used_count}× used
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="size-6 text-muted-foreground opacity-0 transition-opacity group-hover/item:opacity-100"
                      aria-label={`Delete ${snippet.name}`}
                      disabled={deleteSnippet.isPending}
                      onClick={() => deleteSnippet.mutate(snippet.id)}
                    >
                      <Trash className="size-3.5" />
                    </Button>
                  </ListTrailing>
                </ListRow>
              </ListItem>
            ))}
          </List>
        ) : snippets.length > 0 ? (
          <EmptyState
            icon={<MagnifyingGlass weight="regular" className="size-5" />}
            title="No matching snippets"
            description="Try another search term."
          />
        ) : (
          <EmptyState
            icon={<Sparkle weight="regular" className="size-5" />}
            title="No snippets yet"
            description="Save text you reuse, then say “insert [snippet name]” while dictating."
            action={
              <AddSnippetDialog
                onAdd={addSnippet.mutateAsync}
                isSaving={addSnippet.isPending}
              />
            }
          />
        )}
      </Section>
    </PageShell>
  )
}
