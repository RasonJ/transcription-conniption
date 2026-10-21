# Spec: Library Catalog Metadata, Grouping, and Opening Witnesses

**Status:** Approved, partly implemented · **Owner:** Lead Engineer · **Last updated:** 2026-10-20
**Related:** [USABILITY-REMEDIATION.md](USABILITY-REMEDIATION.md) · [SPEC-STUDIO-IA.md](SPEC-STUDIO-IA.md) §3.2 (open as new workspace) · [SPEC-ACCESSIBILITY.md](SPEC-ACCESSIBILITY.md) · [SPEC-LIGHTWEIGHT.md](SPEC-LIGHTWEIGHT.md) §9 Q2 (Library network)
**Fixes:** walkthrough finding 9 (titles are file paths; ". desconocido"; ~40 ungrouped *Celestina* rows; opened witness shows its file name)

---

## 1. Goal

The Library reads like a catalog: each work appears once with its title, author, date, place and holding institution; multi-part works are grouped; and opening a witness carries its metadata into the Studio without replacing the user's work.

### Non-goals

- A full OSTA search product (word/lemma/POS queries across the corpus). That remains the stretch item in `docs/PORTING-FROM-HSMS-MANUALS.md`.
- Editing catalog metadata in the app.

---

## 2. Findings (observed 2026-10-20, 739 witnesses)

| # | Observation |
|---|-------------|
| B1 | Row titles are path-derived: "1500/acrósticos 2 (Celestina)", "1500/auto 02 (Celestina)". |
| B2 | The first row is ". desconocido" (leading punctuation; "desconocido" = unknown, used as a title). Its other fields (HSMS-0480 · 9247, Madrid · Biblioteca Nacional de España, `TEXT.PLG.txt`) are good. |
| B3 | *La Celestina* occupies roughly 40 consecutive rows (`auto_02`, `auto_04a`, `auto_04b`, …), pushing every other work far down. Default order appears to be by file path. |
| B4 | Opening a row in the Studio shows "Transcription source: 1500/auto_02.txt" and no title/author card (the Nunes sample does show one, from its `{RMK:}` lines). |
| B5 | Opening a witness replaced the active workspace (see SPEC-STUDIO-IA S9). |
| B6 | "Open in Studio →" is a non-button element (see SPEC-ACCESSIBILITY). |

Pipeline involved: `scripts/build-library-catalog.ts` → `buildLibraryCatalog()` / `buildLibraryCatalogEntry()` → `extractLibraryMetadata()` (calls `parseHsMsText()`, `inferManuscriptTitle()`, `extractYearFromImprintDate()`, `extractYearFromRmkLines()`), formats `LIBRARY_CATALOG_FORMAT` / `LIBRARY_ENTRY_FORMAT`, loaded by `useLibraryCatalog()`; rendered by `LibraryRow()` in `app/(tabs)/library.tsx`.

---

## 3. Requirements

### 3.1 Catalog data (build time)

| ID | Requirement | Acceptance |
|----|-------------|------------|
| LIB-1 | Bump the catalog format (`LIBRARY_CATALOG_FORMAT` v+1) with explicit fields: `hsmsId`, `title`, `titleSource` (`rmk` \| `filename` \| `manual`), `author`, `authorUnknown: boolean`, `date` (display string) + `year` (number, for sorting), `place`, `printer`, `repository`, `shelfmark`, `language` (detected witness language), `workId`, `partLabel`, `partOrder`, `path`. | Schema test; old-format catalogs still load (reader accepts v and v+1 for one release) |
| LIB-2 | Title extraction order: (1) `{RMK:}` identification lines per manual §0.1 (title line); (2) a curated overrides file `assets/library/overrides.json` keyed by `hsmsId` or path; (3) a cleaned filename (`auto_02` → "Auto 2") only as last resort, with `titleSource: "filename"`. | Report (LIB-5) lists every `filename`-sourced title |
| LIB-3 | Normalize metadata strings: trim leading/trailing punctuation and whitespace; map "desconocido", "anónimo", "unknown", empty → `authorUnknown: true` with display "Author unknown" (localized); never use "desconocido" as a title. | ". desconocido" no longer appears; that row shows a real title or "Untitled (HSMS-0480)" |
| LIB-4 | Group parts: entries sharing a work (same directory + same RMK title stem, or an override) get one `workId`; `partLabel` from the file stem ("Auto 2", "Auto 4a", "Argumento general"); `partOrder` from a natural sort of the stem. | *Celestina* yields 1 work with ~40 parts in natural order (2, 3, 4, 4a, 4b, 5 …) |
| LIB-5 | `npm run build:library` emits `out/library-metadata-report.json`: counts and lists of entries with `titleSource=filename`, `authorUnknown`, missing year, missing repository. | CI artifact; tracked, not gated |

### 3.2 Library screen

| ID | Requirement | Acceptance |
|----|-------------|------------|
| LIB-10 | Rows show **title** (prominent), **author · date**, **place · repository · shelfmark** (secondary), and **HSMS id** (small). File path only in a details disclosure. | Snapshot |
| LIB-11 | Multi-part works render as one row with "40 parts ▾"; expanding lists parts with their own "Open" action. Search matches inside parts and auto-expands matching works. | Searching "auto 4" shows *Celestina* expanded to Auto 4, 4a, 4b |
| LIB-12 | Sort control: Author (default) · Date · Title. Stable secondary sort by title then part order. Collation via `Intl.Collator` for the UI locale. | Unit test |
| LIB-13 | Keep the three search fields (Author, Year, Keywords) but add a single **Search all** box above them on phones; the three fields move into "More filters". Year accepts ranges ("1490–1520"). | Unit test on `filterLibraryEntries()` for ranges |
| LIB-14 | Result count reads "739 witnesses in 312 works" (numbers from the catalog). | Snapshot |
| LIB-15 | "Open" is a real button ([SPEC-ACCESSIBILITY.md](SPEC-ACCESSIBILITY.md) A11Y-1) and opens the witness **as a new workspace** ([SPEC-STUDIO-IA.md](SPEC-STUDIO-IA.md) §3.2). | Previous workspace intact after opening |

### 3.3 Carrying metadata into the Studio

| ID | Requirement | Acceptance |
|----|-------------|------------|
| LIB-20 | The new workspace's title, author, imprint and HSMS id come from the catalog entry (`buildLibraryEntryPayload()`), so the witness card ([SPEC-STUDIO-IA.md](SPEC-STUDIO-IA.md) §3.1 region B) shows them immediately. | Opening *Celestina* Auto 2 shows "La Celestina — Auto 2 · Fernando de Rojas · 1500" |
| LIB-21 | The "Transcription source" selector shows the title with the path as secondary text. | Snapshot |
| LIB-22 | The witness card links back: "From the Library · HSMS-…" → returns to the Library scrolled to that entry. | Manual |

---

## 4. Tests

| Test | Gate |
|------|------|
| Catalog build on the OSTA checkout: no title starting with punctuation; no title equal to an "unknown" token | Pass |
| *Celestina* grouping and natural order | Pass |
| Back-compat: v and v+1 catalogs load | Pass |
| Library screen snapshot (en, es-419) with grouped and ungrouped works | Reviewed |

## 5. Rollout

| Phase | Scope |
|-------|-------|
| LIB-P1 | LIB-1…3, 10, 15, 20, 21 |
| LIB-P2 | LIB-4, 11, 12, 14 (grouping and sort) |
| LIB-P3 | LIB-5, 13, 22 |

## 6. Open questions

1. Which fields does OSTA's own metadata (outside the transcription files) provide, and can the build read it instead of parsing `{RMK:}` lines?
2. Who maintains `overrides.json`? Recommended: the project director, reviewed through PRs, seeded from the LIB-5 report.

---

## 7. Implementation status (2026-10-20, from the repo)

What the repo copy of this spec reports as done. Not yet checked against the code.

| Item | Status |
|------|--------|
| LIB-1 catalog v2 (`hsms-library-catalog/2`) with `upgradeCatalogEntryToV2` / `normalizeLibraryCatalog` for v1 sidecars | Shipped |
| LIB-3 unknown-author normalization; implausible imprint years (e.g. `9247`) rejected | Shipped |
| LIB-4 work grouping (`utils/workGrouping.ts`, `WorkGroup` with naturally sorted parts) | Shipped |
| LIB-11, 14 work cards with expandable parts; "N witnesses in M works" | Shipped |
| LIB-15 open as a new workspace (`createWorkspaceFromLibraryEntry` in `utils/workspaceIngest.ts`; Library calls `hydrateFromWorkspace`, not `applyTranscription`) | Shipped. The repo spec labelled this LIB-20; it is LIB-15 here |
| Test `__tests__/libraryCatalogV2.test.ts` (upgrade + *Celestina* grouping) | Shipped |
| LIB-2 title source order and `overrides.json`; LIB-5 metadata report | Not started |
| LIB-10 row layout (title, author · date, place · repository · shelfmark) | Not confirmed |
| LIB-12 sort, LIB-13 search-all and year ranges | Not started |
| LIB-20, 21 catalog metadata in the Studio witness card and source selector; LIB-22 back-link | Not started |
