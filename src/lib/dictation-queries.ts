export const dictationQueryKeys = {
  root: ["dictation"] as const,
  home: ["dictation", "home"] as const,
  insights: (dateRange: string) =>
    ["dictation", "insights", dateRange] as const,
  archive: (
    search: string,
    dateRange: string,
    insertionMethod: string | null,
    cursor: { created_at_ms: number; id: number } | null
  ) =>
    [
      "dictation",
      "archive",
      search,
      dateRange,
      insertionMethod,
      cursor?.created_at_ms ?? null,
      cursor?.id ?? null,
    ] as const,
  snippets: ["snippets"] as const,
}
