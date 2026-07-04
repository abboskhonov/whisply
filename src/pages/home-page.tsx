import {
  Copy,
  DotsThree,
  Flag,
  Info,
  Microphone,
  TrendUp,
  UploadSimple,
} from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { PageHeader, PageShell, Section, SectionHeader } from "@/components/page"
import { StatCard, StatGrid } from "@/components/stats"
import {
  TranscriptGroup,
  TranscriptRow,
} from "@/components/transcript-table"

const TODAY_TRANSCRIPTS = [
  { id: "t-1", time: "9:14 AM", text: "Let's start with shipping targets for next sprint and then move into the design review for the new sidebar." },
  { id: "t-2", time: "9:02 AM", text: "Customer interview — Linnea" },
  { id: "t-3", time: "8:51 AM", text: null },
  { id: "t-4", time: "8:47 AM", text: "I think it's amazing. I want to buy something." },
  { id: "t-5", time: "8:46 AM", text: "I am just testing it, and it seems to be really amazing. I like it very much." },
  { id: "t-6", time: "8:45 AM", text: "It's testing some stuff. It feels very good." },
]

const YESTERDAY_TRANSCRIPTS = [
  { id: "y-1", time: "5:32 PM", text: "Wrapping up the customer call notes and sending the recap to the team." },
  { id: "y-2", time: "3:18 PM", text: "Standup opener: what I worked on yesterday, today, and any blockers." },
  { id: "y-3", time: "11:04 AM", text: null },
]

function RowActions() {
  return (
    <>
      <Button
        variant="ghost"
        size="icon-xs"
        className="size-7 text-muted-foreground hover:text-foreground"
        aria-label="Copy transcript"
      >
        <Copy className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        className="size-7 text-muted-foreground hover:text-foreground"
        aria-label="Flag transcript"
      >
        <Flag className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        className="size-7 text-muted-foreground hover:text-foreground"
        aria-label="More actions"
      >
        <DotsThree weight="bold" className="size-3.5" />
      </Button>
    </>
  )
}

export function HomePage() {
  return (
    <PageShell>
      <PageHeader
        meta="Welcome back"
        title="Home"
        description="Pick up where you left off, or start something new."
        actions={
          <>
            <Button variant="outline" size="sm">
              <UploadSimple weight="bold" className="size-3.5" />
              Import audio
            </Button>
            <Button size="sm">
              <Microphone weight="fill" className="size-3.5" />
              New recording
            </Button>
          </>
        }
      />

      <Section>
        <SectionHeader
          title="Today"
          description="Your dictation at a glance."
        />
        <StatGrid>
          <StatCard
            value="2,847"
            label="Words dictated today"
            labelTrailing={
              <Info
                weight="regular"
                className="size-3 text-muted-foreground/60"
              />
            }
          >
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendUp weight="bold" className="size-3 text-emerald-600" />
              <span className="text-emerald-600">+35%</span>
              <span>vs yesterday (2,108)</span>
            </p>
          </StatCard>

          <StatCard
            value="47 min"
            label="Time saved today"
            labelTrailing={
              <Info
                weight="regular"
                className="size-3 text-muted-foreground/60"
              />
            }
          >
            <p className="text-xs text-muted-foreground">
              ≈ <span className="font-medium text-foreground">1h 12m</span>{" "}
              saved this week
            </p>
          </StatCard>

          <StatCard
            value="14"
            label="Dictations today"
            labelTrailing={
              <Info
                weight="regular"
                className="size-3 text-muted-foreground/60"
              />
            }
          >
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">8</span> active
              days this week
            </p>
          </StatCard>
        </StatGrid>
      </Section>

      <Section>
        <SectionHeader
          title="Latest transcripts"
          description="What Whisply captured for you, newest first."
        />
        <div className="flex flex-col gap-6">
          <TranscriptGroup label="Today" count={TODAY_TRANSCRIPTS.length}>
            {TODAY_TRANSCRIPTS.map((row) => (
              <TranscriptRow
                key={row.id}
                time={row.time}
                text={row.text}
                actions={<RowActions />}
              />
            ))}
          </TranscriptGroup>
          <TranscriptGroup
            label="Yesterday"
            count={YESTERDAY_TRANSCRIPTS.length}
          >
            {YESTERDAY_TRANSCRIPTS.map((row) => (
              <TranscriptRow
                key={row.id}
                time={row.time}
                text={row.text}
                actions={<RowActions />}
              />
            ))}
          </TranscriptGroup>
        </div>
      </Section>
    </PageShell>
  )
}
