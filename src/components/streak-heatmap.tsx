import * as React from "react"

import { cn } from "@/lib/utils"

type HeatmapLevel = 0 | 1 | 2 | 3 | 4

type ActivityDay = {
  date: string
  dictation_count: number
}

type StreakHeatmapProps = {
  activity: ActivityDay[]
  weeks?: number
  className?: string
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const
const MONTH_FORMATTER = new Intl.DateTimeFormat(undefined, { month: "short" })
const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
})

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

export function StreakHeatmap({
  activity,
  weeks = 26,
  className,
}: StreakHeatmapProps) {
  const data = React.useMemo(() => buildHeatmap(activity, weeks), [activity, weeks])

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex pl-8">
        {data.map((week, index) => (
          <div
            key={localDateKey(week[0].date)}
            className="w-3 text-[10px] font-medium tracking-wide text-muted-foreground"
          >
            {index === 0 || week[0].date.getMonth() !== data[index - 1][0].date.getMonth()
              ? MONTH_FORMATTER.format(week[0].date)
              : ""}
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <div className="flex flex-col gap-0.5 pt-px">
          {DAY_LABELS.map((day, index) => (
            <div
              key={day}
              className="flex h-3 items-center text-[10px] leading-none text-muted-foreground"
              style={{ visibility: index % 2 === 1 ? "visible" : "hidden" }}
            >
              {day}
            </div>
          ))}
        </div>

        <div className="flex gap-0.5">
          {data.map((week) => (
            <div key={week[0].date.toISOString()} className="flex flex-col gap-0.5">
              {week.map((day) => (
                <div
                  key={day.date.toISOString()}
                  className={cn("size-3 rounded-[2px]", levelClass(day.level))}
                  title={`${DATE_FORMATTER.format(day.date)}: ${day.count} ${day.count === 1 ? "dictation" : "dictations"}`}
                  aria-label={`${DATE_FORMATTER.format(day.date)}: ${day.count} ${day.count === 1 ? "dictation" : "dictations"}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1.5 pt-2 pl-8">
        <span className="text-[10px] text-muted-foreground">Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className={cn("size-2.5 rounded-[2px]", levelClass(level as HeatmapLevel))}
          />
        ))}
        <span className="text-[10px] text-muted-foreground">More</span>
      </div>
    </div>
  )
}

function buildHeatmap(activity: ActivityDay[], weeks: number) {
  const activityByDate = new Map(
    activity.map((day) => [day.date, day.dictation_count])
  )
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(today)
  start.setDate(today.getDate() - (weeks - 1) * 7 - today.getDay())

  return Array.from({ length: weeks }, (_, weekIndex) =>
    Array.from({ length: 7 }, (_, dayIndex) => {
      const date = new Date(start)
      date.setDate(start.getDate() + weekIndex * 7 + dayIndex)
      const count = activityByDate.get(localDateKey(date)) ?? 0

      return {
        date,
        count,
        level: Math.min(count, 4) as HeatmapLevel,
      }
    })
  )
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}
