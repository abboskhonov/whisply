import * as React from "react"
import {
  CaretLeft,
  CaretRight,
  Copy,
  MagnifyingGlass,
  Trash,
} from "@phosphor-icons/react"
import { invoke } from "@tauri-apps/api/core"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  type DictationArchiveCursor,
  useDictationArchive,
} from "@/hooks/use-dictation-archive"
import { HISTORY_DATE_RANGES, type HistoryDateRange } from "@/lib/history"
import { dictationQueryKeys } from "@/lib/dictation-queries"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
})
const NUMBER_FORMATTER = new Intl.NumberFormat()
const ALL_METHODS_VALUE = "__all_methods__"

export function DictationArchive() {
  const queryClient = useQueryClient()
  const [search, setSearch] = React.useState("")
  const [dateRange, setDateRange] = React.useState<HistoryDateRange>("all_time")
  const [insertionMethod, setInsertionMethod] = React.useState<string | null>(
    null
  )
  const [previousCursors, setPreviousCursors] = React.useState<
    DictationArchiveCursor[]
  >([])
  const cursor = previousCursors.at(-1) ?? null
  const { data, error, isLoading, isFetching, isSearchPending } =
    useDictationArchive(search, dateRange, insertionMethod, cursor)
  const isFirstPage = previousCursors.length === 0
  const isSearching = isSearchPending || isFetching
  const hasActiveFilters = Boolean(
    search.trim() || dateRange !== "all_time" || insertionMethod
  )
  const dateRangeItems = HISTORY_DATE_RANGES.map((range) => ({
    value: range.value,
    label: range.label,
  }))
  const insertionMethodItems = [
    { value: ALL_METHODS_VALUE, label: "All methods" },
    ...(data?.insertion_methods ?? []).map((method) => ({
      value: method,
      label: formatInsertionMethod(method),
    })),
  ]
  const deleteDictation = useMutation({
    mutationFn: (id: number) => invoke("delete_dictation", { id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: dictationQueryKeys.root })
      toast.success("Dictation deleted")
    },
    onError: () => toast.error("Couldn’t delete dictation"),
  })

  async function copyDictation(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Dictation copied")
    } catch {
      toast.error("Couldn’t copy dictation")
    }
  }

  function resetPagination() {
    setPreviousCursors([])
  }

  function updateSearch(value: string) {
    setSearch(value)
    resetPagination()
  }

  function updateDateRange(value: string | null) {
    if (!value) return

    setDateRange(value as HistoryDateRange)
    setInsertionMethod(null)
    resetPagination()
  }

  function updateInsertionMethod(value: string | null) {
    if (!value) return

    setInsertionMethod(value === ALL_METHODS_VALUE ? null : value)
    resetPagination()
  }

  function showNextPage() {
    if (data?.next_cursor) {
      setPreviousCursors((cursors) => [...cursors, data.next_cursor!])
    }
  }

  function showPreviousPage() {
    setPreviousCursors((cursors) => cursors.slice(0, -1))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col justify-between gap-3 px-1 xl:flex-row xl:items-end">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            Dictation archive
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Browse and filter every completed dictation.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <label className="relative block sm:w-64">
            <span className="sr-only">Search dictations</span>
            <MagnifyingGlass
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="pl-8"
              placeholder="Search dictations…"
              value={search}
              onChange={(event) => updateSearch(event.target.value)}
            />
          </label>
          <Select
            items={dateRangeItems}
            value={dateRange}
            onValueChange={updateDateRange}
          >
            <SelectTrigger
              aria-label="Archive date range"
              className="w-full sm:w-32"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end" alignItemWithTrigger={false}>
              <SelectGroup>
                {HISTORY_DATE_RANGES.map((range) => (
                  <SelectItem key={range.value} value={range.value}>
                    {range.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            items={insertionMethodItems}
            value={insertionMethod ?? ALL_METHODS_VALUE}
            onValueChange={updateInsertionMethod}
          >
            <SelectTrigger
              aria-label="Archive insertion method"
              className="w-full sm:w-36"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end" alignItemWithTrigger={false}>
              <SelectGroup>
                <SelectItem value={ALL_METHODS_VALUE}>All methods</SelectItem>
                {(data?.insertion_methods ?? []).map((method) => (
                  <SelectItem key={method} value={method}>
                    {formatInsertionMethod(method)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border/60 bg-card/40">
        {isLoading || isSearchPending ? (
          <p
            className="px-4 py-10 text-center text-sm text-muted-foreground"
            aria-busy="true"
          >
            Loading archive…
          </p>
        ) : error ? (
          <p
            className="px-4 py-10 text-center text-sm text-destructive"
            role="alert"
          >
            Couldn’t load your dictation archive.
          </p>
        ) : data?.dictations.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {hasActiveFilters
              ? "No dictations match your filters."
              : "No completed dictations yet."}
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {data?.dictations.map((dictation) => (
              <li key={dictation.id} className="group/row px-4 py-3">
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                  <p className="min-w-0 text-[13.5px] leading-relaxed text-foreground">
                    {dictation.text}
                  </p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <time className="text-xs text-muted-foreground tabular-nums">
                      {DATE_FORMATTER.format(new Date(dictation.created_at_ms))}
                    </time>
                    <div className="flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/row:opacity-100 sm:focus-within:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="size-7 text-muted-foreground hover:text-foreground"
                        aria-label="Copy dictation"
                        onClick={() => void copyDictation(dictation.text)}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        aria-label="Delete dictation"
                        disabled={deleteDictation.isPending}
                        onClick={() => deleteDictation.mutate(dictation.id)}
                      >
                        <Trash className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
                <p className="mt-1.5 text-[11px] font-medium tracking-wide text-muted-foreground">
                  {formatMetadata(
                    dictation.word_count,
                    dictation.audio_duration_ms,
                    dictation.insertion_method
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {data?.dictations.length ? (
        <div className="flex items-center justify-between gap-3 px-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={isFirstPage || isSearching}
            onClick={showPreviousPage}
          >
            <CaretLeft weight="bold" />
            Newer
          </Button>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {isSearching ? "Loading…" : `Page ${previousCursors.length + 1}`}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={!data.next_cursor || isSearching}
            onClick={showNextPage}
          >
            Older
            <CaretRight weight="bold" />
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function formatMetadata(
  wordCount: number,
  durationMs: number,
  insertionMethod: string
) {
  const totalMinutes = Math.floor(durationMs / 60_000)
  const duration =
    totalMinutes >= 60
      ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`
      : totalMinutes > 0
        ? `${totalMinutes} min`
        : durationMs > 0
          ? "<1 min"
          : "0 min"

  return `${NUMBER_FORMATTER.format(wordCount)} ${
    wordCount === 1 ? "word" : "words"
  } · ${duration} · ${formatInsertionMethod(insertionMethod)}`
}

function formatInsertionMethod(method: string) {
  return method
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
}
