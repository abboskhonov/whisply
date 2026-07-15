import { invoke } from "@tauri-apps/api/core"
import { useQuery } from "@tanstack/react-query"

import { dictationQueryKeys } from "@/lib/dictation-queries"
import { isTauri } from "@/lib/tauri"

export type HomeDashboard = {
  today: DashboardDay
  yesterday: DashboardDay
  week_dictation_duration_ms: number
  active_days_this_week: number
  recent_dictations: StoredDictation[]
}

type DashboardDay = {
  word_count: number
  dictation_count: number
  audio_duration_ms: number
}

export type StoredDictation = {
  id: number
  created_at_ms: number
  text: string
}

async function fetchHomeDashboard(): Promise<HomeDashboard> {
  return invoke<HomeDashboard>("get_home_dashboard")
}

export function useHomeDashboard() {
  const query = useQuery({
    queryKey: dictationQueryKeys.home,
    queryFn: fetchHomeDashboard,
    enabled: isTauri(),
  })

  return {
    dashboard: query.data,
    error: query.error,
    isLoading: query.isPending,
  }
}
