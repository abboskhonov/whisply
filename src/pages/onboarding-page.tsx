import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { Waveform } from "@phosphor-icons/react"

import { StepIndicator } from "@/components/onboarding/step-indicator"
import { StepWelcome } from "@/components/onboarding/step-welcome"
import { StepOsDetection } from "@/components/onboarding/step-os-detection"
import { StepPermissions } from "@/components/onboarding/step-permissions"
import { StepKeybindings } from "@/components/onboarding/step-keybindings"
import { StepComplete } from "@/components/onboarding/step-complete"

const ONBOARDING_KEY = "whisply-onboarding-complete"

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

export function isOnboardingComplete(): boolean {
  if (typeof window === "undefined") return true
  return localStorage.getItem(ONBOARDING_KEY) === "true"
}

export function markOnboardingComplete() {
  localStorage.setItem(ONBOARDING_KEY, "true")
}

export function clearOnboardingComplete() {
  localStorage.removeItem(ONBOARDING_KEY)
}

export function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep] = React.useState(0)

  const handleNext = React.useCallback(() => {
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }, [])

  const handleBack = React.useCallback(() => {
    setStep((s) => Math.max(s - 1, 0))
  }, [])

  const handleFinish = React.useCallback(() => {
    markOnboardingComplete()
    navigate({ to: "/" })
  }, [navigate])

  const CurrentStep = STEP_COMPONENTS[step]

  const stepProps = React.useMemo(() => {
    const base = {
      onNext: handleNext,
      onBack: handleBack,
    }

    switch (step) {
      case 0:
        return { ...base, onNext: handleNext }
      case 1:
        return { ...base, onNext: handleNext }
      case 2:
        return { ...base, onNext: handleNext }
      case 3:
        return { ...base, onNext: handleNext }
      case 4:
        return { onFinish: handleFinish }
      default:
        return base
    }
  }, [step, handleNext, handleBack, handleFinish])

  return (
    <div className="flex min-h-svh flex-col bg-background">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/40 px-6">
        <div className="flex items-center gap-2">
          <Waveform weight="fill" className="size-4 text-primary" />
          <span className="text-sm font-semibold tracking-tight">Whisply</span>
        </div>
        <StepIndicator steps={STEPS} currentIndex={step} />
      </header>

      {/*
        Content. min-h-0 + overflow-y-auto so the step can grow taller than
        the viewport (3 permission groups + the action footer) and the user
        can still scroll to the Continue button. items-start so overflowing
        content doesn't get clipped against the bottom edge.
      */}
      <div
        data-ui-scroll-container
        className="flex min-h-0 flex-1 flex-col items-stretch overflow-y-auto px-6 py-6"
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col py-6">
          <CurrentStep {...(stepProps as any)} />
        </div>
      </div>

      {/* Footer hint */}
      <footer className="flex h-10 shrink-0 items-center justify-center border-t border-border/30">
        <p className="text-[11px] text-muted-foreground/50">
          {step + 1} of {STEPS.length}
        </p>
      </footer>
    </div>
  )
}
