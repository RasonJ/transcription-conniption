# Spec: PDF Ingest → HSMS Markup → High-Fidelity Digital Witness

**Status:** Draft (future, backend-dependent) · **Owner:** TBD · **Last updated:** 2026-10-16 (implementation status added)
**Related:** [SPEC-LIGHTWEIGHT.md](SPEC-LIGHTWEIGHT.md) (Tier 2 boundary) · [SPEC-COPILOT.md](SPEC-COPILOT.md) · [SPEC-I18N.md](SPEC-I18N.md) · [HSMS-LAYOUT.md](../HSMS-LAYOUT.md) · [HSMS-TYPOGRAPHY.md](../HSMS-TYPOGRAPHY.md)

---

## 1. Goal

A researcher uploads a PDF of a manuscript or early printed book. PDFs can be large: hundreds of pages, often several hundred MB to a few GB. The service:

1. extracts the page images at full fidelity,
2. analyzes page layout and recognizes the text,
3. produces a **valid HSMS transcription draft**,
4. aligns every HSMS line to its region on the page image, and
5. delivers a **high-fidelity digital witness**: deep-zoom page images, the HSMS text, line-level image↔text linking, and a facsimile render calibrated to the real page's measurements.

The researcher then **reviews and corrects** the draft in the existing editor. The machine output is a starting point, never a finished edition.

### Principles

| Principle | Consequence |
|-----------|-------------|
| **HSMS stays pure.** | Machine uncertainty, coordinates, and provenance live in a sidecar file, never as invented markup. Low recognition confidence is **not** written as `[??]`, because `[??]` is an editorial claim about the manuscript. |
| **The client stays light.** | The app never parses a PDF and never downloads full-resolution images unless the user asks. All heavy work is server-side (SPEC-LIGHTWEIGHT Tier 2). |
| **Human in the loop.** | Every folio has a review state. Exports of unreviewed material are labeled as machine drafts. |
| **Partial results early.** | Folios stream to the client as they finish. A researcher can review fol. 1r while fol. 240v is still processing. |
| **One parser everywhere.** | The server validates output with the same TypeScript compiler and linter as the app (`compileManuscriptTree`, `lintHsmsTranscription`), packaged as a shared module. |

### Non-goals (v1)

- Producing critical or normalized editions.
- Recognizing music notation, seals, or non-Latin scripts. Aljamiado and Hebrew-script material is flagged as a region and left for manual transcription.

---

## 2. Inputs

| Input kind | Typical source | Path |
|------------|----------------|------|
| **Scanned manuscript in a PDF** | Library digitization downloaded by the researcher | Full pipeline: images → layout → HTR → HSMS |
| **Scanned early print / incunable in a PDF** | Same | Full pipeline with print OCR models (usually much higher accuracy than manuscript HTR) |
| **Born-digital PDF of a modern edition** (text layer present) | Published diplomatic or paleographic edition | Text-layer extraction → sigla mapping to HSMS (edition-specific rules) → no image alignment unless facsimile plates are present |
| **IIIF manifest URL** (no PDF) | Many libraries publish IIIF | Skip PDF intake; fetch images via IIIF Image API at needed resolution. Cheapest path, and the best first milestone (§11). |
| Mixed PDF | Edition with facsimile plates | Page classifier routes each page |

Each upload also carries user-supplied metadata: title, shelfmark, holding institution, date range, script family (optional), witness language, **rights statement**, and source URL. These become `{RMK:}` lines and IIIF manifest metadata.

---

## 3. Client responsibilities (kept small)

| Concern | Spec |
|---------|------|
| **Upload** | Resumable, chunked upload (tus protocol or S3 multipart via presigned URLs; pick one, server's choice). 8–16 MB chunks; resumes after app restart or network loss. Native uses a background upload task so it survives backgrounding; web uses the File API with `Blob.slice`. |
| **Size limits** | Configurable server limit, initially 4 GB per file and 2,000 pages. The client checks size before starting and shows a clear message. |
| **Integrity** | Server computes SHA-256 of the assembled file. Client sends file size + name + a hash of the first and last 1 MB as a resume key (hashing GB-size files on a phone is too slow). |
| **Job UI** | `ingest.*` strings (SPEC-I18N). Per-stage progress via Server-Sent Events, with polling fallback. Folios appear in the workspace as they finish. |
| **Consent** | Before upload: what is sent, where it is stored, retention period, and a **separate opt-in** for using corrections to improve models. Stored in the workspace record. |
| **Images** | Fetched from the IIIF Image API at the size the viewport needs (tiles for deep zoom, small derivatives for thumbnails and figure slots). "Download for offline" lets the user pick a resolution per witness. |
| **Bundle size impact** | The ingest UI is a lazy Tier 2 module, excluded from builds with the backend flag off. The deep-zoom viewer is lazy Tier 1 (useful for manual IIIF import too). Target ≤ 60 KB gzip combined. |

---

## 4. Server pipeline

A job is a DAG of idempotent stages over pages. Pages are processed in parallel; each stage writes versioned outputs so any stage can be re-run (e.g. with a better HTR model) without redoing earlier ones.

```text
 upload/IIIF ──► 1 Intake ──► 2 Page images ──► 3 Page classification & folio assignment
                                                   │
                                                   ▼
                     4 Layout analysis (zones, lines, baselines)
                                                   │
                                                   ▼
                     5 Text recognition (OCR/HTR, per-char confidence)
                                                   │
                                                   ▼
                     6 HSMS conversion (zones→mnemonics, chars→HSMS notation)
                                                   │
                                                   ▼
                     7 Validation (shared TS compiler + linter) ──fail──► repair rules / flag folio
                                                   │
                                                   ▼
                     8 Alignment sidecar + geometry ──► 9 Packaging (HSMS, sidecar, IIIF, TEI, PAGE)
```

### 4.1 Stage 1: Intake

- PDFs are a common attack vector: parse only inside a sandboxed worker with CPU, memory, and time limits. Run a malware scan, reject encrypted PDFs (with a clear message), and validate structure (`qpdf --check`).
- Store the original immutably in object storage, keyed by SHA-256 (deduplicates repeat uploads).

### 4.2 Stage 2: Page images (fidelity-critical)

- **Prefer extracting the embedded image streams** at native resolution and bit depth (`pdfimages`-style) over re-rendering. Library PDFs usually wrap one scan per page, and re-rendering would resample and recompress it.
- Fall back to rendering at ≥ 400 dpi when a page is vector or composited.
- Preserve ICC color profiles; record source dpi.
- Detect and split **double-page spreads** into two folio sides.
- Generate pyramidal TIFF (or JPEG 2000) and serve through an **IIIF Image API 3** server. Keep originals; derivatives are disposable.

### 4.3 Stage 3: Page classification and folio assignment

- Classify each page: folio side, blank, cover/binding, flyleaf/guard sheet, color target/ruler, edition prose page, plate.
- Propose folio ids `1r, 1v, 2r…` following HSMS manual §1.2 (the editor imposes their own sequence; old foliation is ignored or kept in `{HD.}` per §2.6). The user can set the starting folio, mark guard sheets (§1.22), and fix the sequence in a **folio sequencing screen** before stage 6 finalizes. This is cheap to fix early and expensive later.
- Blank sides produce only the folio indication (§1.23).

### 4.4 Stage 4: Layout analysis

Detect zones and lines with polygons and baselines. Use a **SegmOnto-compatible** zone vocabulary (the community ontology for historical document layout), because it maps cleanly onto HSMS mnemonics:

| Layout zone / line | HSMS output |
|--------------------|-------------|
| Main text zone(s); count of columns | `{CB1.}` / `{CB2.}` envelope; column order per manual §3.1 |
| Running title zone | `{HD. …}` (per-column `{HDn.}` when headings sit over columns, §2.5) |
| Margin text zone | `{GL.}` family by side (`{GLL.}`, `{GLR.}` …); classifier proposes gloss vs addendum (`{AD.}`) by hand/ink cues, flagged for review |
| Quire marks zone (foot of page) | `{CW.}` on versos, `{SG.}` on rectos (manual §4) |
| Drop capital zone | `{INn.}` with **n = number of text lines the box spans** (from line geometry), plus one grapheme (HSMS-LAYOUT §2.3) |
| Graphic zone | `{ILL.}` / `{MIN.}` / `{DIAG.}` anchor by classifier; image region cropped into the figure slot (§6.3) |
| Numbering zone (old foliation) | dropped, or kept in `{HD.}` via ` \ ` per §2.61 (user option) |
| Interlinear line | `[^…]` scribal insertion candidate, flagged |
| Damage zone | not converted to markup; recorded in the sidecar to guide review |

Models: start from published segmentation models trained on medieval and early-modern material, and fine-tune on Iberian witnesses. The model and version are recorded per page.

### 4.5 Stage 5: Text recognition

- **Model registry** keyed by script family and period: early print / incunable roman and gothic type, Gothic *textualis*, *precortesana*, *cortesana*, *procesal*, humanistic. Auto-classified per page, user-overridable, recorded per page.
- Output: diplomatic transcription per line with **per-character confidence**, using MUFI/Unicode code points for special characters and abbreviation marks (macron/tilde, *q* with stroke, Tironian *et*, superscript letters, long *s*, etc.).
- **Fine-tuning loop:** reviewed lines from this witness (with the user's opt-in) retrain a witness-specific model after a threshold of corrected lines (e.g. 200), then unreviewed folios are re-recognized. This is how HTR gets usable on a new hand, so it is a core feature, not an extra.

### 4.6 Stage 6: HSMS conversion

A deterministic converter (`hsms-from-page`) in the shared TypeScript package:

| Concern | Rule |
|---------|------|
| **Characters** | Map Unicode/MUFI to HSMS notation via the **inverse** of `utils/generated/hsmsDiacriticMap.ts` + legacy `@`-notation (e.g. combining tilde → `~`, cedilla → `c'`). Unmapped code points are kept and listed in a conversion report. Never silently dropped. |
| **Abbreviations** | HTR transcribes marks as written. Expansions (`q<ue>`, `p<er>`) are **editorial decisions**: the converter *proposes* them from abbreviation tables + the lemma dictionary and writes them as HSMS expansions **only above a confidence threshold**. Each proposal is recorded in the sidecar as `machine_expansion` so the review UI can highlight and bulk-accept or reject them. A "keep abbreviated" option produces no expansions. |
| **Word division across columns/folios** | Apply manual §3.12 automatically: a column never closes on an incomplete word; the remainder is brought back after a hyphen and dropped from the next column's start. Every such move is logged in the sidecar so alignment still points at the right image line. |
| **Line structure** | One HSMS source line per physical line (the app's core invariant, HSMS-LAYOUT §5.4). Optional line-number prefixes. |
| **Metadata** | `{RMK:}` lines from user metadata, plus one provenance remark, e.g. `{RMK: Machine-assisted transcription draft; reviewed folios listed in sidecar.}` (wording per HSMS remark rules: one closing period, no internal periods/colons, §5.2). |
| **No uncertainty markup** | Low confidence never becomes `[??]`, `[*…]`, or `??`. It lives in the sidecar only. Those notations are reserved for the researcher's judgment about the manuscript. |

### 4.7 Stage 7: Validation

- Run `lintHsmsTranscription` and `compileManuscriptTree` on the output. **Gate:** zero parse errors per folio. On failure, apply repair rules (close unbalanced envelopes, move stray `}`), re-validate, and if it still fails, mark the folio `needs_attention` with the lint codes (shared with SPEC-I18N validation codes).
- Run `scanRenderedMarkupLeakage` on an HTML export as a final check that no markup leaks into the rendered leaf.

### 4.8 Stage 8: Alignment sidecar and page geometry

See §5.

### 4.9 Stage 9: Packaging

| Artifact | Purpose |
|----------|---------|
| `witness.txt` | HSMS transcription (authoritative text) |
| `witness.hsmsfacs.json` | Alignment + geometry + confidence + provenance sidecar (§5) |
| `manifest.json` | **IIIF Presentation 3** manifest, with canvases per folio side and a transcription annotation per line (W3C Web Annotation, `motivation: supplementing`) so any IIIF viewer can show the text on the image |
| `witness.tei.xml` | TEI P5 from the existing `teiExport.ts`, extended with `<facsimile>/<surface>/<zone>` and `@facs` links from `<lb/>` to zones |
| `page/*.xml` | PAGE XML (or ALTO) per page for interoperability with HTR platforms, so researchers can move to or from tools such as eScriptorium or Transkribus |
| Conversion report | Unmapped characters, expansion proposals, §3.12 moves, failed folios, model versions |

---

## 5. Sidecar: `hsms-facsimile-sidecar/1`

HSMS has no coordinate syntax, so image linking lives beside the text.

```typescript
interface HsmsFacsSidecar {
  format: "hsms-facsimile-sidecar/1";
  witnessHash: string;                       // hash of witness.txt this sidecar was built for
  source: {
    kind: "pdf" | "iiif" | "edition_pdf";
    sha256?: string; manifestUrl?: string;
    rights: string; institution?: string; shelfmark?: string;
  };
  pipeline: { jobId: string; stages: Record<string, { model?: string; version: string; at: string }> };
  folios: Record<FolioId, {
    canvasId: string;                        // IIIF canvas
    imageService: string;                    // IIIF Image API base URL
    pixelSize: [w: number, h: number];
    dpi?: number;
    geometry: FolioGeometry;                 // §6.1
    review: "machine" | "in_review" | "reviewed" | "needs_attention";
    lines: Array<{
      sourceLine: number;                    // line index in witness.txt
      anchor: string;                        // content hash + ordinal, for re-alignment after edits
      polygon: [number, number][];           // image px
      baseline: [number, number][];
      zone: string;                          // SegmOnto zone type
      confidence: number;                    // mean char confidence 0–1
      lowConfidenceSpans?: Array<[start: number, end: number, conf: number]>;
      words?: Array<{ text: string; box: [x: number, y: number, w: number, h: number] }>;
      machineExpansions?: Array<{ at: number; proposal: string; conf: number; status: "proposed" | "accepted" | "rejected" }>;
    }>;
    figures?: Record<FigureId, { polygon: [number, number][]; crop: string /* IIIF region URL */ }>;
  }>;
}
```

### 5.1 Keeping alignment through edits

Researchers will edit the text, so line indices shift. On each workspace save:

1. Diff old vs new `witness.txt` line arrays (Myers diff; files are line-oriented, so this is fast).
2. Carry each sidecar line across unchanged or modified lines. Deleted lines drop their link; inserted lines are unlinked until the user draws or assigns a region.
3. Re-anchor by `anchor` when the diff is ambiguous.
4. Update `witnessHash`.

This runs on-device. It is small and pure TS (Tier 1).

---

## 6. The high-fidelity digital witness

### 6.1 Measured page geometry drives the facsimile

Today the SVG facsimile uses fixed constants (`CANVAS_W = 800`, `MARGIN = 48`, `LH = 24`, HSMS-LAYOUT §6.2). HSMS-TYPOGRAPHY §11 lists "metrics derived from facsimile metrology" as future work. Ingest supplies those metrics per folio:

```typescript
interface FolioGeometry {
  aspect: number;                          // page h / w
  writingArea: Box;                        // ruled frame, normalized 0–1
  columns: Box[];                          // per column
  meanLineSpacing: number;                 // normalized
  linesPerColumn: number[];
  initials?: Record<string, Box>;          // keyed by line index
  marginZones?: Box[];
}
```

`pageLayout.ts` gains a `layoutForFolio(geometry?)` function. When geometry exists, margins, column widths, gutter, line advance, and drop-cap boxes come from the real page (scaled to the 800 px logical width). Otherwise today's constants apply unchanged, so typed-in witnesses render exactly as now. Font size is scaled to the measured x-height relative to line spacing, so lines fill the column as they do on the leaf.

### 6.2 Three linked views

| View | Description |
|------|-------------|
| **Image** | Deep-zoom IIIF viewer (lazy module). Line polygons overlay on hover/tap; tapping a polygon scrolls the HSMS editor and the parchment to that line. Optional low-confidence heatmap during review. |
| **Facsimile** | Existing SVG facsimile, geometry-calibrated (§6.1), with real initials and figures cropped from the page (§6.3). The "reading-room" view. |
| **Text** | HSMS editor / parchment / synoptic normalized pane, as today. |

These form the **synoptic triple view** (diplomatic · normalized · image), which is ARCHITECTURE extension point #9. On wide screens all three panes appear; on phones, a segmented control switches between them, keeping the same line selected.

### 6.3 Automatic figure and initial crops

The app already supports uploaded scans per `figureId` (`assetMap`) and per drop cap (`uploadedUri`). Ingest fills these automatically with IIIF region URLs (`…/{x},{y},{w},{h}/max/0/default.jpg`) for every `{ILL.}`, `{MIN.}`, `{DIAG.}`, and `{INn.}`. The procedural ornate initials remain the fallback for typed-in witnesses.

### 6.4 Bundle format v2

`.hsms` bundles currently embed images as base64 (`hsms-scriptorium-bundle/1`), which would be prohibitive for a 400-page witness. `hsms-scriptorium-bundle/2`:

- carries `witness.txt` + sidecar + metadata,
- references images by IIIF URL by default,
- optionally embeds images at a chosen resolution for offline exchange,
- still imports v1 bundles unchanged.

---

## 7. Review workflow

1. **Sequence:** confirm folio order, guard sheets, and the start folio (§4.3).
2. **Review by folio:** the image pane and the editor side by side. Low-confidence spans and machine-proposed expansions are highlighted. Keyboard shortcuts: next low-confidence span, accept/reject expansion, mark folio reviewed.
3. **Bulk actions:** accept all expansions of one abbreviation type (e.g. every `q<ue>`) across the witness after spot-checking. Preview the count first.
4. **Retrain:** after the opt-in threshold, offer "Improve recognition for the remaining folios" (§4.5).
5. **Copilot hooks:** `ingest.low_confidence` and `ingest.unreviewed` recipes (SPEC-COPILOT §9.4). Every copilot answer on a witness with unreviewed folios carries a note saying how much of the evidence is unreviewed machine output.
6. **Export labeling:** exports list reviewed vs unreviewed folios in the provenance remark and the TEI header (`<revisionDesc>`, `<respStmt>` naming the pipeline and models).

---

## 8. API (v1 sketch)

```text
POST   /v1/uploads                        → { uploadId, chunkSize, endpoint }   (tus/multipart)
POST   /v1/ingest-jobs                    { uploadId | iiifManifestUrl, metadata, options }
                                          options: { scriptFamily?, witnessLanguage?, pageRange?,
                                                     startFolio?, expansions: "propose"|"none",
                                                     models?: { layout?, htr? } }
                                          → { jobId }
GET    /v1/ingest-jobs/{jobId}            → stage status, per-page progress, errors
GET    /v1/ingest-jobs/{jobId}/events     → SSE: stage/page progress, folio_ready
POST   /v1/ingest-jobs/{jobId}/sequence   folio assignment corrections (before stage 6 finalizes)
GET    /v1/witnesses/{id}/hsms            → witness.txt (ETag = witnessHash)
GET    /v1/witnesses/{id}/sidecar         → hsmsfacs.json
GET    /v1/witnesses/{id}/manifest        → IIIF Presentation 3
GET    /v1/witnesses/{id}/tei | /page/{folio}.xml
POST   /v1/witnesses/{id}/corrections     reviewed lines (only with training opt-in)
POST   /v1/witnesses/{id}/rerecognize     { folios, model }
DELETE /v1/witnesses/{id}                 hard delete: originals, derivatives, sidecar, training data
```

Auth: per-user tokens, witness-level ACLs (owner + optional collaborators, read/write). All endpoints are idempotent where possible; job creation takes an idempotency key.

---

## 9. Non-functional targets (to validate with a prototype)

| Metric | Target |
|--------|--------|
| Max upload | 4 GB / 2,000 pages (configurable) |
| Upload resume | Survives app restart and network loss; ≤ 1 chunk re-sent |
| First folio ready | ≤ 2 min after upload completes (300-page PDF, standard queue) |
| Full job, 300 pages | ≤ 30 min including HTR on shared GPU capacity |
| HSMS validity | 100% of delivered folios parse with zero errors; failures are `needs_attention`, never silently delivered |
| Print OCR CER | Report per model; target ≤ 3% on incunable test set before shipping print path |
| Manuscript HTR CER | Report per script family; ship with honest per-model numbers. Fine-tuned witness models should beat base models on the same witness's held-out reviewed lines |
| Layout | Zone F1 per type reported; `{CB.}` column-count accuracy ≥ 98% on test set |
| Client | No PDF code in the app; image bytes fetched ≤ what the viewport needs |

### 9.1 Evaluation corpus

OSTA provides HSMS transcriptions for many witnesses whose digitizations are publicly available. Pairs of (digitization, OSTA transcription) form a natural **gold standard** for end-to-end evaluation: compare generated HSMS to OSTA HSMS after alignment (character error rate on text, precision/recall on mnemonics such as `{CB.}`, `{IN.}`, `{CW.}`, `{GL.}`). Use only images whose license allows it; record the license per item.

---

## 10. Security, privacy, rights

- Encryption in transit and at rest; per-user storage isolation.
- **Retention:** originals kept until the user deletes the witness; configurable auto-delete of originals after packaging (derivatives kept).
- **No training on user material without explicit opt-in**, revocable; revocation removes the witness's lines from future training sets.
- **Rights:** a rights statement is required at upload; IIIF manifests carry it (`rights`, `requiredStatement`). Sharing a witness with other users is blocked when the rights statement forbids redistribution.
- PDF processing is sandboxed (§4.1).

---

## 11. Rollout (each step is useful on its own)

| Phase | Scope | Value without later phases |
|-------|-------|----------------------------|
| **I0** | **IIIF manifest import** (no backend ML): fetch page images, folio sequencing, image pane, manual line↔region linking, sidecar v1, bundle v2 | High-fidelity witness for manual transcribers; works with most library digitizations; light client-only + tiny proxy |
| **I1** | PDF intake + page extraction + IIIF serving | Same as I0 for researchers who only have PDFs |
| **I2** | Layout analysis → **HSMS skeleton**: folio markers, `{CB.}`, `{HD.}`, `{CW.}`/`{SG.}`, `{INn.}` with correct depth, figure anchors with auto-crops, one empty line per detected line, geometry-calibrated facsimile | Removes the tedious structural part of transcription; researcher types text into ready lines |
| **I3** | OCR for early print / incunables + HSMS conversion + review UI | Near-complete drafts for printed witnesses |
| **I4** | Manuscript HTR with script-family models + fine-tuning loop | Drafts for manuscript hands that improve as the researcher works |
| **I5** | Abbreviation expansion proposals + bulk review; copilot ingest recipes | Speeds the most editorially sensitive step without automating the judgment |

## 12. Open questions

1. Build vs integrate for HTR: run our own Kraken-class stack, or integrate an existing platform (eScriptorium API, Transkribus) for I3/I4 and keep only conversion and alignment in-house?
2. Should gloss vs addendum classification be attempted at all in v1, or always left to the reviewer?
3. Hosting of IIIF derivatives for witnesses whose rights forbid public serving: authenticated IIIF (IIIF Auth API 2) or app-only signed URLs?
4. Should folio sequencing (§4.3) block the pipeline, or run stage 6 optimistically and re-run on correction?

---

## 13. Implementation status (2026-10-16)

The owner has built a **client-side** vision path that differs from §3–4 (server pipeline): PDFs are sliced to page images in the app (`utils/pdfPageExtractor*.ts`, pdf.js loaded lazily as its own web chunk), each page goes to an Azure vision agent, and `utils/ingestAgentTranscription.ts` lints, compiles and repairs the HSMS before it reaches the parchment (pass-two repair for flagged pages). That covers I3/I4-style drafts without a backend, at the cost of the "client never parses a PDF" principle; the size caps (25 pages by default) keep it bounded.

Pieces from this spec now in the repo:

| Spec item | Status |
|-----------|--------|
| I0 IIIF import | `IngestPanel` (localized, behind the backend flag) loads a manifest and **creates a workspace**: one `[fol. …]` heading per canvas (ids from canvas labels, else 1r, 1v, 2r…) and IIIF images as folio backgrounds (`utils/ingest/iiifWorkspace.ts`) |
| §5 sidecar | Vision transcriptions now store a `hsms-facsimile-sidecar/1` in the workspace (`utils/ingest/visionSidecar.ts`): per-folio review state (`machine`, or `needs_attention` when lint errors remain), source-line membership, provenance. No polygons or confidence: the agent does not return them |
| §5.1 alignment through edits | Implemented: every text change realigns the sidecar (Myers diff + anchors) |
| §7 review workflow | Copilot `ingest.unreviewed` lists unreviewed sides with a "Mark fol. … reviewed" action; `ingest.low_confidence` says confidence is unavailable |
| §6.4 bundle v2 | `utils/ingest/bundleV2.ts` exists; the `.hsms` export still writes v1 and does not carry the sidecar yet |
| §6.1 geometry | `layoutForFolio(geometry?)` exists; no producer of geometry yet, so renderers use the fixed constants |
| Server API (§8) | Not started (no backend) |
