import { invoke } from "@tauri-apps/api/core"
import { useQuery } from "@tanstack/react-query"

import { dictationQueryKeys } from "@/lib/dictation-queries"
import type { HistoryDateRange } from "@/lib/history"
import { isTauri } from "@/lib/tauri"

export type InsightsDashboard = {
  total_word_count: number
  total_dictation_count: number
  average_words_per_minute: number
  insertion_methods: InsertionMethodUsage[]
  current_streak_days: number
  longest_streak_days: number
  activity: DailyActivity[]
}

export type InsertionMethodUsage = {
  method: string
  dictation_count: number
}

export type DailyActivity = {
  date: string
  dictation_count: number
}

async function fetchInsightsDashboard(
  dateRange: HistoryDateRange
): Promise<InsightsDashboard> {
  return invoke<InsightsDashboard>("get_insights_dashboard", { dateRange })
}

export function useInsightsDashboard(dateRange: HistoryDateRange) {
  const query = useQuery({
    queryKey: dictationQueryKeys.insights(dateRange),
    queryFn: () => fetchInsightsDashboard(dateRange),
    enabled: isTauri(),
  })

  return {
    dashboard: query.data,
    error: query.error,
    isLoading: query.isPending,
  }
}
