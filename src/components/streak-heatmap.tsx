import * as React from "react"

import { cn } from "@/lib/utils"

type HeatmapLevel = 0 | 1 | 2 | 3 | 4

type StreakHeatmapProps = {
  weeks?: number
  className?: string
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const

const MONTH_LABELS: Array<{ week: number; label: string }> = [
  { week: 0, label: "Mar" },
  { week: 5, label: "Apr" },
  { week: 9, label: "May" },
  { week: 14, label: "Jun" },
  { week: 18, label: "Jul" },
  { week: 23, label: "Aug" },
]

function levelClass(level: HeatmapLevel): string {
  switch (level) {
    case 0:
      return "bg-muted"
    case 1:
      return "bg-primary/20"
    case 2:
      return "bg-primary/40"
    case 3:
      return "bg-primary/60"
    case 4:
      return "bg-primary"
  }
}

function generateData(weeks: number): HeatmapLevel[][] {
  const data: HeatmapLevel[][] = []
  for (let w = 0; w < weeks; w++) {
    const week: HeatmapLevel[] = []
    for (let d = 0; d < 7; d++) {
      const seed = (w * 7 + d + 1) * 9301 + 49297
      const r = (seed % 233280) / 233280
      let level: HeatmapLevel
      if (r < 0.3) level = 0
      else if (r < 0.5) level = 1
      else if (r < 0.7) level = 2
      else if (r < 0.9) level = 3
      else level = 4
      week.push(level)
    }
    data.push(week)
  }
  return data
}

export function StreakHeatmap({ weeks = 26, className }: StreakHeatmapProps) {
  const data = React.useMemo(() => generateData(weeks), [weeks])

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex pl-8">
        {Array.from({ length: weeks }).map((_, i) => {
          const label = MONTH_LABELS.find((m) => m.week === i)
          return (
            <div
              key={i}
              className="w-3 text-[10px] font-medium tracking-wide text-muted-foreground"
            >
              {label?.label ?? ""}
            </div>
          )
        })}
      </div>

      <div className="flex gap-3">
        <div className="flex flex-col gap-0.5 pt-px">
          {DAY_LABELS.map((day, i) => (
            <div
              key={day}
              className="h-3 text-[10px] text-muted-foreground leading-none flex items-center"
              style={{ visibility: i % 2 === 1 ? "visible" : "hidden" }}
            >
              {day}
            </div>
          ))}
        </div>

        <div className="flex gap-0.5">
          {data.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.5">
              {week.map((level, di) => (
                <div
                  key={di}
                  className={cn("size-3 rounded-[2px]", levelClass(level))}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1.5 pt-2 pl-8">
        <span className="text-[10px] text-muted-foreground">More</span>
        {[4, 3, 2, 1, 0].map((level) => (
          <div
            key={level}
            className={cn(
              "size-2.5 rounded-[2px]",
              levelClass(level as HeatmapLevel)
            )}
          />
        ))}
        <span className="text-[10px] text-muted-foreground">Less</span>
      </div>
    </div>
  )
}
