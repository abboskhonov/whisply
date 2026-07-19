import { trackedInvoke, isTauri } from "./tauri"

export type DictionaryEntry = {
  id: number
  term: string
  pronunciation?: string | null
  entry_type: "name" | "acronym" | "jargon" | "other"
  note?: string | null
}
const KEY = "whisply-dictionary"
function browserEntries(): DictionaryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]")
  } catch {
    return []
  }
}
export async function listDictionaryEntries(): Promise<DictionaryEntry[]> {
  return isTauri() ? trackedInvoke("list_dictionary_entries") : browserEntries()
}
export async function addDictionaryEntry(
  input: Omit<DictionaryEntry, "id">
): Promise<DictionaryEntry> {
  if (isTauri()) {
    return trackedInvoke("add_dictionary_entry", {
      term: input.term,
      pronunciation: input.pronunciation,
      entryType: input.entry_type,
      note: input.note,
    })
  }
  const entry = { ...input, id: Date.now() }
  localStorage.setItem(KEY, JSON.stringify([...browserEntries(), entry]))
  return entry
}
export async function deleteDictionaryEntry(id: number): Promise<void> {
  if (isTauri())
    return trackedInvoke("delete_dictionary_entry", { entryId: id })
  localStorage.setItem(
    KEY,
    JSON.stringify(browserEntries().filter((e) => e.id !== id))
  )
}
