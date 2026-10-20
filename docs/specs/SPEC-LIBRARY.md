# Spec: Library Catalog Metadata, Grouping, and Opening Witnesses

**Status:** Approved · **Owner:** Lead Engineer · **Last updated:** 2026-10-20
**Related:** [USABILITY-REMEDIATION.md](USABILITY-REMEDIATION.md) · [SPEC-STUDIO-IA.md](SPEC-STUDIO-IA.md) §3.2 · [SPEC-ACCESSIBILITY.md](SPEC-ACCESSIBILITY.md) · [SPEC-LIGHTWEIGHT.md](SPEC-LIGHTWEIGHT.md) §9 Q2
**Fixes:** Walkthrough finding 9 (titles are file paths; ". desconocido"; ~40 ungrouped *Celestina* rows; opened witness shows its file name)

---

## 1. Goal

Present the corpus as a citable library catalog: multi-part works are aggregated under unified work cards, titles and metadata reflect scholarly RMK tags rather than internal file paths, and opening a witness instantiates an isolated workspace without disturbing active user edits.

---

## 2. Technical Requirements & Architecture

### 2.1 Catalog Data Schema v2 (`LIB-1` – `LIB-5`)

1. **Schema (`LIBRARY_CATALOG_FORMAT` = `hsms-library-catalog/2`)** in `utils/libraryCatalog.ts`:
   - Fields: `hsmsId`, `titleSource`, `authorUnknown`, `date`, `year` (number|null), `workId`, `partLabel`, `partOrder`, `path`, `repository`, `shelfmark`, `language`.
   - Legacy bridge: `upgradeCatalogEntryToV2` / `normalizeLibraryCatalog` accept v1 sidecars.

2. **Metadata cleaning**:
   - `". desconocido"` / unknown authors → `authorUnknown: true`, display *"Author unknown"*; titles never equal desconocido.
   - Implausible years (e.g. `9247`) rejected as imprint years.

3. **Work aggregation** (`utils/workGrouping.ts`):
   - Shared `workId` (e.g. Celestina path/title heuristic) → one `WorkGroup` with naturally sorted parts.

### 2.2 Studio Workspace Isolation (`LIB-20`)

- `createWorkspaceFromLibraryEntry` (`utils/workspaceIngest.ts`) persists a **new** workspace; Library screen calls `hydrateFromWorkspace` (does not `applyTranscription` onto the active buffer).

### 2.3 Library UI

- Work cards with expandable parts; Open is `accessibilityRole="button"`.
- Result line: *N witnesses in M works*.

---

## 3. Module map

```text
utils/libraryCatalog.ts      # v2 schema + upgrade/normalize
utils/workGrouping.ts        # WorkGroup tree
utils/workspaceIngest.ts     # createWorkspaceFromLibraryEntry
hooks/useLibraryCatalog.ts   # normalize on load + workGroups
app/(tabs)/library.tsx       # WorkGroup cards + isolated open
```

---

## 4. Tests

| Test | Gate |
|------|------|
| `__tests__/libraryCatalogV2.test.ts` — upgrade + Celestina grouping | Pass |
