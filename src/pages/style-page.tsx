import {
  Check,
  MagicWand,
  PaintBrush,
  PencilSimple,
  Plus,
} from "@phosphor-icons/react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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

const PRESETS: Array<{
  id: string
  name: string
  description: string
  applied: number
  active?: boolean
}> = [
  {
    id: "p-1",
    name: "Clean verbatim",
    description:
      "Removes filler words (um, uh), fixes punctuation, keeps the original structure.",
    applied: 64,
    active: true,
  },
  {
    id: "p-2",
    name: "Meeting notes",
    description:
      "Summarises into agenda items, decisions, action items, and follow-ups.",
    applied: 41,
  },
  {
    id: "p-3",
    name: "Casual",
    description:
      "Keeps the speaker's voice, light punctuation, contractions and hedges intact.",
    applied: 12,
  },
  {
    id: "p-4",
    name: "Formal",
    description:
      "Tightens sentences, removes false starts, formats as flowing prose.",
    applied: 7,
  },
  {
    id: "p-5",
    name: "Custom — blog",
    description:
      "Long-form, paragraph-per-idea, friendly but precise. Built from a sample post.",
    applied: 3,
  },
]

export function StylePage() {
  return (
    <PageShell>
      <PageHeader
        title="Style"
        description="How Whisply cleans up and formats your transcriptions."
        actions={
          <Button variant="outline" size="sm">
            <Plus weight="bold" className="size-3.5" />
            New style
          </Button>
        }
      />

      <Section>
        <SectionHeader
          title="Presets"
          description="Pick one to apply to all new transcriptions."
        />
        {PRESETS.length > 0 ? (
          <List>
            {PRESETS.map((p) => (
              <ListItem key={p.id}>
                <ListRow>
                  <ListLeading
                    tone={p.active ? "accent" : "default"}
                    icon={
                      p.active ? (
                        <Check weight="bold" className="size-4" />
                      ) : (
                        <PaintBrush weight="regular" className="size-4" />
                      )
                    }
                  />
                  <ListContent>
                    <ListTitle className="flex items-center gap-2">
                      {p.name}
                      {p.active ? (
                        <Badge
                          variant="secondary"
                          className="rounded-full bg-primary/10 px-2 py-0 text-[10.5px] font-medium tracking-wide text-primary uppercase"
                        >
                          Active
                        </Badge>
                      ) : null}
                    </ListTitle>
                    <ListSubtitle>{p.description}</ListSubtitle>
                  </ListContent>
                  <ListTrailing className="gap-3">
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {p.applied}× applied
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground opacity-0 transition-opacity group-hover/item:opacity-100"
                      aria-label={`Edit ${p.name}`}
                    >
                      <PencilSimple className="size-3.5" />
                    </Button>
                  </ListTrailing>
                </ListRow>
              </ListItem>
            ))}
          </List>
        ) : (
          <EmptyState
            icon={<MagicWand weight="regular" className="size-5" />}
            title="No styles yet"
            description="Create a style to clean up your transcriptions automatically."
            action={
              <Button size="sm">
                <Plus weight="bold" className="size-3.5" />
                New style
              </Button>
            }
          />
        )}
      </Section>
    </PageShell>
  )
}
