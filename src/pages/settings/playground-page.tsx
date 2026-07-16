import * as React from "react"
import { listen } from "@tauri-apps/api/event"
import {
  ArrowsClockwise,
  Check,
  Keyboard,
  Microphone,
  Record,
  Stop,
  Warning,
  Waveform,
} from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { PageHeader, PageShell, Section, SectionHeader } from "@/components/page"
import { getInputStatus, initializeInput, testInputConnection } from "@/lib/system"
import { isTauri, trackedInvoke } from "@/lib/tauri"

type PlaygroundState = "idle" | "recording" | "transcribing" | "denied"

type DictationResult = {
  text: string
  audio_duration_ms: number
  transcription_duration_ms: number
  insertion_method: string
}

export function PlaygroundSettingsPage() {
  const [state, setState] = React.useState<PlaygroundState>("idle")
  const [transcript, setTranscript] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [inputStatus, setInputStatus] = React.useState<string | null>(null)
  const [checkingInput, setCheckingInput] = React.useState(false)

  React.useEffect(() => {
    if (!isTauri()) return
    let mounted = true
    const unlisten = Promise.all([
      listen<{ state: PlaygroundState; error?: string }>(
        "whisply://audio-state",
        (event) => {
          if (!mounted) return
          setState(event.payload.state)
          if (event.payload.error) setError(event.payload.error)
        }
      ),
      listen<DictationResult>("whisply://dictation-result", (event) => {
        if (!mounted || event.payload.insertion_method !== "playground") return
        setTranscript(event.payload.text)
        setError(null)
        setState("idle")
      }),
      listen<{ message: string }>("whisply://dictation-error", (event) => {
        if (!mounted) return
        setError(event.payload.message)
        setState("denied")
      }),
    ])

    return () => {
      mounted = false
      void unlisten.then((callbacks) => callbacks.forEach((callback) => callback()))
    }
  }, [])

  const start = async () => {
    setError(null)
    setTranscript(null)
    try {
      await trackedInvoke("start_playground_dictation")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setState("denied")
    }
  }

  const stop = async () => {
    try {
      await trackedInvoke("stop_playground_dictation")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setState("denied")
    }
  }

  const checkInput = async () => {
    setCheckingInput(true)
    setInputStatus(null)
    try {
      const status = await getInputStatus()
      if (!status.available) {
        setInputStatus("Text insertion is unavailable on this system.")
        return
      }
      await initializeInput()
      const connected = await testInputConnection()
      setInputStatus(
        connected
          ? `Ready · ${status.method}`
          : "Keyboard simulation could not be verified."
      )
    } catch (cause) {
      setInputStatus(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setCheckingInput(false)
    }
  }

  const isWorking = state === "recording" || state === "transcribing"

  return (
    <PageShell>
      <PageHeader
        title="Playground"
        description="Test the microphone, overlay, transcription, and insertion connection without typing into another app."
      />

      <Section>
        <SectionHeader
          title="Dictation test"
          description="This uses the real capture and transcription pipeline. The result stays on this page."
        />
        <div className="flex flex-col gap-5 rounded-lg border border-border/60 bg-card/40 p-5">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-md bg-muted text-muted-foreground">
              {state === "recording" ? (
                <Record weight="fill" className="size-5 text-destructive" />
              ) : state === "transcribing" ? (
                <ArrowsClockwise className="size-5 animate-spin text-primary" />
              ) : (
                <Waveform className="size-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                {state === "recording"
                  ? "Listening…"
                  : state === "transcribing"
                    ? "Transcribing…"
                    : state === "denied"
                      ? "Test needs attention"
                      : "Ready to test"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {state === "recording"
                  ? "Speak normally, then stop the test."
                  : state === "transcribing"
                    ? "Whisply is processing the recorded audio."
                    : "Your transcript will appear below instead of being inserted elsewhere."}
              </p>
            </div>
            {isTauri() ? (
              state === "recording" ? (
                <Button variant="destructive" size="sm" onClick={() => void stop()}>
                  <Stop weight="fill" className="size-3.5" /> Stop
                </Button>
              ) : (
                <Button size="sm" disabled={isWorking} onClick={() => void start()}>
                  <Microphone weight="bold" className="size-3.5" />
                  {state === "transcribing" ? "Working…" : "Start test"}
                </Button>
              )
            ) : (
              <Button size="sm" disabled>
                Native app required
              </Button>
            )}
          </div>

          {error ? (
            <p role="alert" className="flex items-center gap-2 text-xs text-destructive">
              <Warning weight="fill" className="size-4 shrink-0" /> {error}
            </p>
          ) : null}

          <div className="rounded-md bg-background/60 px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
              Transcript
            </p>
            <p className="mt-1.5 text-sm text-foreground/90">
              {transcript ?? "Run a test to see the recognized text here."}
            </p>
          </div>
        </div>
      </Section>

      <Section>
        <SectionHeader
          title="Text insertion"
          description="Verify the insertion service without sending any test text."
        />
        <div className="flex items-center gap-4 rounded-lg border border-border/60 bg-card/40 px-5 py-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
            {inputStatus?.startsWith("Ready") ? (
              <Check weight="bold" className="size-5 text-success" />
            ) : (
              <Keyboard className="size-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Insertion connection</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {inputStatus ?? "No text will be typed while this check runs."}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!isTauri() || checkingInput}
            onClick={() => void checkInput()}
          >
            {checkingInput ? "Checking…" : "Check connection"}
          </Button>
        </div>
      </Section>
    </PageShell>
  )
}
