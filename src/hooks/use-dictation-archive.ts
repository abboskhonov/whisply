import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { useQuery } from "@tanstack/react-query"

import { dictationQueryKeys } from "@/lib/dictation-queries"
import type { HistoryDateRange } from "@/lib/history"
import { isTauri } from "@/lib/tauri"

export type DictationArchiveCursor = {
  created_at_ms: number
  id: number
}

export type ArchiveDictation = {
  id: number
  created_at_ms: number
  text: string
  word_count: number
  audio_duration_ms: number
  insertion_method: string
}

export type DictationArchivePage = {
  dictations: ArchiveDictation[]
  insertion_methods: string[]
  next_cursor: DictationArchiveCursor | null
}

async function fetchDictationArchive(
  cursor: DictationArchiveCursor | null,
  search: string,
  dateRange: HistoryDateRange,
  insertionMethod: string | null
): Promise<DictationArchivePage> {
  return invoke<DictationArchivePage>("get_dictation_archive", {
    query: {
      cursor,
      search: search || null,
      date_range: dateRange,
      insertion_method: insertionMethod,
    },
  })
}

export function useDictationArchive(
  search: string,
  dateRange: HistoryDateRange,
  insertionMethod: string | null,
  cursor: DictationArchiveCursor | null
) {
  const normalizedSearch = search.trim()
  const deferredSearch = React.useDeferredValue(normalizedSearch)
  const query = useQuery({
    queryKey: dictationQueryKeys.archive(
      deferredSearch,
      dateRange,
      insertionMethod,
      cursor
    ),
    queryFn: () =>
      fetchDictationArchive(cursor, deferredSearch, dateRange, insertionMethod),
    enabled: isTauri(),
  })

  return {
    ...query,
    isSearchPending: normalizedSearch !== deferredSearch,
  }
}
