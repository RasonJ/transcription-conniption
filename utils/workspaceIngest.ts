/**
 * Workspace-safe library open (SPEC-LIBRARY LIB-20 / SPEC-STUDIO-IA S9).
 * Creates a new workspace so the active scriptorium is not overwritten.
 */
import type { ScriptoriumWorkspace } from "@/constants/manuscript";
import type { LibraryCatalogEntry } from "./libraryCatalog";
import { openAsNewWorkspace } from "./workspaceTransactions";

/**
 * Creates and persists a dedicated workspace for a Library witness
 * without replacing active user edits in memory (caller must hydrate).
 */
export async function createWorkspaceFromLibraryEntry(
  entry: LibraryCatalogEntry,
  transcriptionText: string,
): Promise<ScriptoriumWorkspace> {
  const title =
    entry.title && !/^untitled$/i.test(entry.title)
      ? entry.hsmsId
        ? `${entry.title} (${entry.hsmsId})`
        : entry.title
      : entry.hsmsId
        ? `Untitled (${entry.hsmsId})`
        : entry.baseName;

  return openAsNewWorkspace({
    transcriptionText,
    manuscriptTitle: title,
    sourceFileName: entry.sourceFileName || entry.path,
  });
}
