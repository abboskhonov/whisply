import { Waveform } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"

type StepWelcomeProps = {
  onNext: () => void
}

export function StepWelcome({ onNext }: StepWelcomeProps) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-8 text-center">
      <div className="grid size-16 place-items-center rounded-2xl bg-primary shadow-lg shadow-primary/20">
        <Waveform weight="fill" className="size-8 text-primary-foreground" />
      </div>

      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome to Whisply
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Your privacy-first voice dictation app for Linux. Speak naturally and
          watch your words appear — completely offline, no cloud, no data
          leaving your machine.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Button size="lg" onClick={onNext}>
          Get started
        </Button>
        <p className="text-xs text-muted-foreground">
          Takes about 2 minutes
        </p>
      </div>
    </div>
  )
}
