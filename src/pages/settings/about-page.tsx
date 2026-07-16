import {
  ArrowSquareOut,
  DiscordLogo,
  GithubLogo,
  Keyboard,
  LockSimple,
  Waveform,
} from "@phosphor-icons/react"

import appIcon from "../../../src-tauri/icons/icon.png"

import { PageShell, Section, SectionHeader } from "@/components/page"

const APP_VERSION = "0.1.0"
const REPOSITORY_URL = "https://github.com/abboskhonov/whisply"
const DISCORD_URL = "https://discord.gg/4ymp3xPvk"

const HIGHLIGHTS = [
  {
    icon: LockSimple,
    title: "Local transcription",
    description:
      "Choose a speech model and keep transcription on your computer.",
  },
  {
    icon: Keyboard,
    title: "Ready wherever you write",
    description:
      "Use a global shortcut, then send your words to the app already in focus.",
  },
  {
    icon: Waveform,
    title: "Made for focused dictation",
    description:
      "A calm desktop workspace for speaking, reviewing, and refining your text.",
  },
]

export function AboutSettingsPage() {
  return (
    <PageShell className="gap-10">
      <header className="overflow-hidden rounded-xl bg-primary px-6 py-7 text-primary-foreground shadow-sm sm:px-8">
        <div className="flex items-center gap-5">
          <img
            src={appIcon}
            alt=""
            className="size-16 shrink-0 rounded-xl bg-black object-cover shadow-sm"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-primary-foreground/70">
              Whisply {APP_VERSION}
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">
              Speak freely. Keep it yours.
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-primary-foreground/75">
              A private, local-first voice dictation app for Linux.
            </p>
          </div>
        </div>
      </header>

      <Section className="gap-4">
        <SectionHeader
          title="A quieter way to write"
          description="Whisply turns a global shortcut and a local speech model into ready-to-use text."
        />
        <div className="grid gap-3 sm:grid-cols-3">
          {HIGHLIGHTS.map(({ icon: Icon, title, description }) => (
            <div key={title} className="rounded-lg bg-muted/60 p-4">
              <Icon
                weight="regular"
                className="size-5 text-muted-foreground"
                aria-hidden
              />
              <h2 className="mt-5 text-sm font-medium text-foreground">
                {title}
              </h2>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                {description}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section className="gap-4">
        <SectionHeader
          title="Project"
          description="Whisply is built with Tauri, React, and local speech models."
        />
        <div className="overflow-hidden rounded-lg border border-border/60 bg-card/40">
          <a
            href={REPOSITORY_URL}
            className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <GithubLogo
              weight="fill"
              className="size-5 shrink-0 text-foreground"
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">
                View the source on GitHub
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                github.com/abboskhonov/whisply
              </span>
            </span>
            <ArrowSquareOut
              weight="regular"
              className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
              aria-hidden
            />
          </a>
          <div className="mx-4 border-t border-border/60" />
          <a
            href={`${REPOSITORY_URL}/releases`}
            className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <img
              src={appIcon}
              alt=""
              className="size-5 shrink-0 rounded-[5px] bg-black object-cover"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">
                Releases and updates
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                See what’s new and download the latest release.
              </span>
            </span>
            <ArrowSquareOut
              weight="regular"
              className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
              aria-hidden
            />
          </a>
          <div className="mx-4 border-t border-border/60" />
          <a
            href={DISCORD_URL}
            className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <DiscordLogo
              weight="fill"
              className="size-5 shrink-0 text-foreground"
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">
                Join the Discord community
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                Share feedback, ideas, and your dictation workflow.
              </span>
            </span>
            <ArrowSquareOut
              weight="regular"
              className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
              aria-hidden
            />
          </a>
        </div>
      </Section>

      <p className="text-xs text-muted-foreground">
        Built with care by{" "}
        <a
          href="https://abboskhonov.uz"
          className="font-medium text-foreground transition-colors hover:text-muted-foreground focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Abror Abboskhonov
        </a>
        .
      </p>
    </PageShell>
  )
}
