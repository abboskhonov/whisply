import { invoke } from "@tauri-apps/api/core"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { dictationQueryKeys } from "@/lib/dictation-queries"
import { isTauri } from "@/lib/tauri"

export type Snippet = {
  id: number
  name: string
  body: string
  tags: string[]
  used_count: number
}

export type NewSnippet = {
  name: string
  body: string
  tags: string[]
}

async function listSnippets(): Promise<Snippet[]> {
  return invoke<Snippet[]>("list_snippets")
}

export function useSnippets() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: dictationQueryKeys.snippets,
    queryFn: listSnippets,
    enabled: isTauri(),
  })

  const addSnippet = useMutation({
    mutationFn: (snippet: NewSnippet) =>
      invoke<Snippet>("add_snippet", snippet),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: dictationQueryKeys.snippets,
      }),
  })

  const deleteSnippet = useMutation({
    mutationFn: (snippetId: number) =>
      invoke<void>("delete_snippet", { snippetId }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: dictationQueryKeys.snippets,
      }),
  })

  return {
    snippets: query.data ?? [],
    error: query.error,
    isLoading: query.isPending,
    addSnippet,
    deleteSnippet,
  }
}
