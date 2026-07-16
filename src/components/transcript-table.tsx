import * as React from "react"

import { cn } from "@/lib/utils"

type TranscriptGroupProps = {
  label: string
  count?: number
  className?: string
  children: React.ReactNode
}

export function TranscriptGroup({
  label,
  count,
  className,
  children,
}: TranscriptGroupProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between px-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        <span>{label}</span>
        {typeof count === "number" ? (
          <span className="text-[10.5px] text-muted-foreground/70 tabular-nums">
            {count} {count === 1 ? "transcript" : "transcripts"}
          </span>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-lg border border-border/60 bg-card/40">
        <ul className="divide-y divide-border/60">{children}</ul>
      </div>
    </div>
  )
}

type TranscriptRowProps = {
  time: string
  text?: string | null
  actions?: React.ReactNode
} & Omit<React.ComponentPropsWithoutRef<"li">, "children">

export const TranscriptRow = React.forwardRef<
  HTMLLIElement,
  TranscriptRowProps
>(function TranscriptRow({ time, text, actions, className, ...props }, ref) {
  return (
    <li ref={ref} className={cn("group/row", className)} {...props}>
      <div className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-4 px-4 py-3 transition-colors group-hover/row:bg-muted/60">
        <time className="text-xs font-medium text-muted-foreground tabular-nums">
          {time}
        </time>
        <p
          className={cn(
            "min-w-0 text-[13.5px] leading-relaxed",
            text ? "text-foreground" : "text-muted-foreground/40 italic"
          )}
        >
          {text ?? <span aria-hidden>—</span>}
        </p>
        <div
          className={cn(
            "flex shrink-0 items-center gap-1 transition-opacity",
            actions
              ? "opacity-0 group-hover/row:opacity-100 focus-within:opacity-100"
              : "opacity-0"
          )}
        >
          {actions}
        </div>
      </div>
    </li>
  )
})
