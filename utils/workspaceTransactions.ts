/**
 * Non-destructive workspace open (SPEC-STUDIO-IA §3.2 / S9).
 * Samples, library entries, and blank transcriptions always create a new workspace;
 * the previous active workspace remains in the index with unchanged text.
 */
import type { ScriptoriumWorkspace } from "@/constants/manuscript";
import { createWorkspace, persistWorkspace } from "@/utils/scriptoriumWorkspace";

export async function openAsNewWorkspace(params: {
  transcriptionText: string;
  manuscriptTitle?: string;
  sourceFileName?: string;
}): Promise<ScriptoriumWorkspace> {
  const newWs = createWorkspace({
    transcriptionText: params.transcriptionText,
    manuscriptTitle: params.manuscriptTitle,
    sourceFileName: params.sourceFileName,
  });

  // persistWorkspace already sets activeWorkspaceId on the index.
  await persistWorkspace(newWs);
  return newWs;
}
