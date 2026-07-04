import * as React from "react"

import { cn } from "@/lib/utils"

type StatCardProps = {
  value: React.ReactNode
  label: string
  labelTrailing?: React.ReactNode
  className?: string
  children?: React.ReactNode
}

export function StatCard({
  value,
  label,
  labelTrailing,
  className,
  children,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-lg border border-border/60 bg-card/40 p-4",
        className
      )}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
          {value}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-[10.5px] font-medium tracking-wider text-muted-foreground uppercase">
        <span>{label}</span>
        {labelTrailing}
      </div>
      {children ? <div className="mt-auto">{children}</div> : null}
    </div>
  )
}

type StatGridProps = React.ComponentProps<"div">

export function StatGrid({ className, ...props }: StatGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3",
        className
      )}
      {...props}
    />
  )
}

type GaugeProps = {
  /** value 0..1, where 1 is the full half-circle (right end) */
  value: number
  /** Pixel size of the gauge; the stroke scales with it. */
  size?: number
  strokeWidth?: number
  trackClassName?: string
  fillClassName?: string
  className?: string
}

export function Gauge({
  value,
  size = 120,
  strokeWidth = 10,
  trackClassName,
  fillClassName,
  className,
}: GaugeProps) {
  const clamped = Math.max(0, Math.min(1, value))
  const radius = size / 2 - strokeWidth / 2
  const cx = size / 2
  const cy = size / 2
  // Half-circle arc from left to right (sweep 1, large 0)
  const d = `M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`
  const arcLength = Math.PI * radius
  const offset = arcLength * (1 - clamped)

  return (
    <svg
      viewBox={`0 0 ${size} ${size / 2 + strokeWidth / 2}`}
      width={size}
      height={size / 2 + strokeWidth / 2}
      className={className}
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        className={cn("stroke-muted", trackClassName)}
      />
      <path
        d={d}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={arcLength}
        strokeDashoffset={offset}
        className={cn("stroke-primary transition-[stroke-dashoffset] duration-500", fillClassName)}
      />
    </svg>
  )
}

type StatCardGaugeProps = {
  value: number
  sublabel: string
  className?: string
}

export function StatCardGauge({ value, sublabel, className }: StatCardGaugeProps) {
  return (
    <div className={cn("flex flex-col items-center gap-0.5 pt-1", className)}>
      <Gauge value={value} size={140} strokeWidth={10} />
      <div className="-mt-6 text-center text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {sublabel}
      </div>
      <div className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
        {Math.round(value * 100)}%
      </div>
    </div>
  )
}
