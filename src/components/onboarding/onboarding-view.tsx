import * as React from "react"
import { Waveform } from "@phosphor-icons/react"
import { invoke } from "@tauri-apps/api/core"

import { StepIndicator } from "@/components/onboarding/step-indicator"
import { StepWelcome } from "@/components/onboarding/step-welcome"
import { StepOsDetection } from "@/components/onboarding/step-os-detection"
import { StepPermissions } from "@/components/onboarding/step-permissions"
import { StepKeybindings } from "@/components/onboarding/step-keybindings"
import { StepComplete } from "@/components/onboarding/step-complete"

// Static no-op handlers for the page that's currently animating out.
// It's only on screen for ~280ms, so the user never gets to click it
// and the buttons (if any remain visible) don't need to do anything.
const NOOP = () => {}

// The five step components take slightly different prop shapes
// (some want onNext/onBack, the last wants onFinish). We hold the
// union as our state, but type the bound components as accepting
// the *wide* optional form so TS doesn't try to intersect all five
// signatures when we spread.
type StepProps =
  | { onNext: () => void; onBack: () => void }
  | { onFinish: () => void }

type StepComponent = React.ComponentType<{
  onNext?: () => void
  onBack?: () => void
  onFinish?: () => void
}>

const STEPS = [
  { id: "welcome", label: "Welcome" },
  { id: "os", label: "System" },
  { id: "permissions", label: "Permissions" },
  { id: "keybindings", label: "Shortcuts" },
  { id: "complete", label: "Done" },
] as const

const STEP_COMPONENTS = [
  StepWelcome,
  StepOsDetection,
  StepPermissions,
  StepKeybindings,
  StepComplete,
]

/**
 * The view rendered inside the onboarding Tauri window. Manages the
 * step state machine, the page-side-by-side enter/exit animation, and
 * hands off to Rust when the user finishes.
 *
 * NOTE: this used to be a `Route` mounted inside the main app window
 * (`/onboarding` route). It's now a standalone webview, so the
 * completion is persisted via `invoke('mark_onboarding_complete')`
 * and the window is closed by Rust — no router navigation needed.
 */
export function OnboardingView() {
  const [step, setStep] = React.useState(0)
  const [prevStep, setPrevStep] = React.useState<number | null>(null)
  // 1 = forward (Next), -1 = back. Drives the slide-in direction.
  const [direction, setDirection] = React.useState<1 | -1>(1)

  // Cleanup timer ref so unmounts don't fire stale state updates.
  const exitTimer = React.useRef<number | null>(null)

  React.useEffect(() => {
    return () => {
      if (exitTimer.current !== null) {
        window.clearTimeout(exitTimer.current)
      }
    }
  }, [])

  const transitionTo = React.useCallback(
    (next: number, dir: 1 | -1) => {
      if (next === step) return
      setDirection(dir)
      setPrevStep(step)
      setStep(next)
      if (exitTimer.current !== null) {
        window.clearTimeout(exitTimer.current)
      }
      exitTimer.current = window.setTimeout(() => {
        setPrevStep(null)
        exitTimer.current = null
      }, 280)
    },
    [step]
  )

  const handleNext = React.useCallback(() => {
    transitionTo(Math.min(step + 1, STEPS.length - 1), 1)
  }, [step, transitionTo])

  const handleBack = React.useCallback(() => {
    transitionTo(Math.max(step - 1, 0), -1)
  }, [step, transitionTo])

  const handleFinish = React.useCallback(async () => {
    try {
      await invoke("mark_onboarding_complete")
    } catch (err) {
      // If Rust somehow fails, fall back to closing via the window
      // command — the marker is best-effort.
      console.error("mark_onboarding_complete failed:", err)
    }
  }, [])

  const stepProps = React.useMemo<StepProps>(() => {
    if (step === STEPS.length - 1) return { onFinish: handleFinish }
    return { onNext: handleNext, onBack: handleBack }
  }, [step, handleNext, handleBack, handleFinish])

  // Props for the page that's animating out. Static so the component
  // reference is stable and we don't allocate a new object per render.
  const exitingProps = React.useMemo<StepProps>(
    () => ({ onNext: NOOP, onBack: NOOP }),
    []
  )

  const CurrentStep = STEP_COMPONENTS[step] as StepComponent
  const PreviousStep =
    prevStep !== null ? (STEP_COMPONENTS[prevStep] as StepComponent) : null

  return (
    <div className="onboarding-stage flex h-full flex-col overflow-hidden bg-background">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/40 px-5">
        <div className="flex items-center gap-2">
          <Waveform weight="fill" className="size-4 text-primary" />
          <span className="text-sm font-semibold tracking-tight">Whisply</span>
        </div>
        <StepIndicator steps={STEPS} currentIndex={step} />
      </header>

      <div
        data-ui-scroll-container
        className="onboarding-step-track min-h-0 grow basis-0"
        style={{ ["--onb-step-dir" as string]: direction }}
      >
        {PreviousStep ? (
          <div
            key={`exiting-${prevStep}`}
            className="onboarding-step-page"
            data-exiting="true"
          >
            <div className="flex min-h-full flex-col overflow-y-auto overscroll-contain px-6 py-4">
              <div className="mx-auto flex w-full max-w-2xl flex-col pb-4 pt-2">
                <PreviousStep {...exitingProps} />
              </div>
            </div>
          </div>
        ) : null}

        <div
          key={`active-${step}`}
          className="onboarding-step-page"
          data-active="true"
        >
          <div className="flex min-h-full flex-col overflow-y-auto overscroll-contain px-6 py-4">
            <div className="mx-auto flex w-full max-w-2xl flex-col pb-4 pt-2">
              <CurrentStep {...stepProps} />
            </div>
          </div>
        </div>
      </div>

      <footer className="flex h-9 shrink-0 items-center justify-center border-t border-border/30">
        <p className="text-[11px] text-muted-foreground/50">
          {step + 1} of {STEPS.length}
        </p>
      </footer>
    </div>
  )
}
