export const HISTORY_DATE_RANGES = [
  { value: "today", label: "Today" },
  { value: "last_seven_days", label: "Last 7 days" },
  { value: "this_month", label: "This month" },
  { value: "all_time", label: "All time" },
] as const

export type HistoryDateRange = (typeof HISTORY_DATE_RANGES)[number]["value"]
