import { Check, Waveform } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type StepCompleteProps = {
  onFinish: () => void
}

const HIGHLIGHTS = [
  "Push-to-talk shortcut configured",
  "Microphone access granted",
  "Linux system detected and compatible",
  "100% offline · no cloud · no tracking",
]

export function StepComplete({ onFinish }: StepCompleteProps) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-8 text-center">
      <div className="grid size-16 place-items-center rounded-2xl bg-success/10">
        <div className="grid size-10 place-items-center rounded-xl bg-success text-success-foreground">
          <Check weight="bold" className="size-6" />
        </div>
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          You're all set!
        </h1>
        <p className="text-sm text-muted-foreground">
          Whisply is ready to go. Here's what we configured:
        </p>
      </div>

      <div className="w-full space-y-2 rounded-lg border border-border/60 bg-card/40 px-5 py-4">
        {HIGHLIGHTS.map((item, i) => (
          <div
            key={item}
            className={cn(
              "flex items-center gap-3 py-1.5",
              i < HIGHLIGHTS.length - 1 && "border-b border-border/30 pb-2.5"
            )}
          >
            <Check
              weight="bold"
              className="size-3.5 shrink-0 text-success"
            />
            <span className="text-sm text-foreground">{item}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Waveform weight="fill" className="size-3" />
        <span>Whisply</span>
      </div>

      <Button size="lg" onClick={onFinish}>
        Start using Whisply
      </Button>
    </div>
  )
}
