# Documentation index

Guides, specs, and reference copies for Transcription Conniption. Markup rules in the [online HSMS manual](https://hispanicseminary.org/manual-en.htm) win over any local copy.

## Product and architecture

| Document | What it covers |
|----------|----------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Expo / React Native map: studio, parse pipeline, facsimile, library, copilot, and export. |
| [HSMS-EDITOR.md](HSMS-EDITOR.md) | How the scriptorium turns a plain-text transcription into a live leaf, with validation and scholarly export. |
| [HSMS-LAYOUT.md](HSMS-LAYOUT.md) | How HSMS lines become columns, baselines, glosses, and drop-cap boxes on the page. |
| [HSMS-TYPOGRAPHY.md](HSMS-TYPOGRAPHY.md) | Ink, parchment, abbreviations, and decorated initials so the leaf reads as a facsimile, not a modern edition. |
| [PORTING-FROM-HSMS-MANUALS.md](PORTING-FROM-HSMS-MANUALS.md) | What to bring over from the sibling `gu/manuals` repo (proofer, OSTA, analizador, Voyant) and what to leave behind. |
| [REASONING-GRAPH.md](REASONING-GRAPH.md) | Manuscript reasoning graph (schema 1.0): claims, folios, embeddings, and precompiled copilot chains. |

## HSMS and OSTA reference

| Document | What it covers |
|----------|----------------|
| [HSMS-manual.md](HSMS-manual.md) | Markdown copy of Mackenzie’s *Manual of Manuscript Transcription* (5th ed., 1997). The [online manual](https://hispanicseminary.org/manual-en.htm) is authoritative. |
| [OSTA-guide.md](OSTA-guide.md) | Short citation and query cheat-sheet for the Old Spanish Textual Archive (fields, wildcards, lemma and POS). |

## Vision transcription and Azure agents

| Document | What it covers |
|----------|----------------|
| [AZURE_HSMS_AGENT_ORCHESTRATION.md](AZURE_HSMS_AGENT_ORCHESTRATION.md) | Pass 1 vision OCR and Pass 2 syntax repair: which model runs, and what stays on the device. |
| [prompt-hsms-transcriber.md](prompt-hsms-transcriber.md) | Paleographic vision prompt (Foundry instructions). Runtime copy lives in `services/hsmsOpenAIInstructions.ts`. |
| [azure_hsms_transcriber_prompt.md](azure_hsms_transcriber_prompt.md) | Deployment checklist for that prompt: file search off, Pass 2 only after critical linter errors. |

## Specs

The [usability plan](specs/USABILITY-REMEDIATION.md) orders the area specs. It was written from the [walkthrough](specs/Transcription%20Conniption%20Walkthrough/index.html) (20 October 2026).

| Document | What it covers |
|----------|----------------|
| [USABILITY-REMEDIATION.md](specs/USABILITY-REMEDIATION.md) | Walkthrough findings mapped to specs, with the order of work. |
| [Transcription Conniption Walkthrough](specs/Transcription%20Conniption%20Walkthrough/index.html) | Annotated screens of eleven problems found while using the web build as a researcher. |
| [SPEC-FOLIO-VIEWPORT.md](specs/SPEC-FOLIO-VIEWPORT.md) | Fit, zoom, and pan so the whole leaf stays reachable from a phone to a wide desktop. |
| [SPEC-VALIDATION.md](specs/SPEC-VALIDATION.md) | One validator, one mnemonic registry, and diagnostics that name the manual section and the line. |
| [SPEC-EDITOR.md](specs/SPEC-EDITOR.md) | Source editor: line map, spellcheck off for medieval spelling, and help for mnemonics and braces. |
| [SPEC-CONCORDANCE-LANGUAGE.md](specs/SPEC-CONCORDANCE-LANGUAGE.md) | Lemmas only when a dictionary exists for the witness language; otherwise group by surface form. |
| [SPEC-STUDIO-IA.md](specs/SPEC-STUDIO-IA.md) | Studio layout, one place per action, export sheet, display settings, and wording. |
| [SPEC-LIBRARY.md](specs/SPEC-LIBRARY.md) | Catalog titles from `{RMK:}` tags, grouped works, and opening a witness without wiping the current edit. |
| [SPEC-ACCESSIBILITY.md](specs/SPEC-ACCESSIBILITY.md) | Named controls, keyboard use, and screen-reader labels (WCAG 2.1 AA on web). |
| [SPEC-ORNATE-INITIALS.md](specs/SPEC-ORNATE-INITIALS.md) | Decorated drop caps that follow the witness tradition (woodcut, penwork, illumination) from `{RMK:}` and `{INn.}`. |
| [SPEC-I18N.md](specs/SPEC-I18N.md) | Instant UI locales for Iberian and Latin American languages, kept separate from the witness language. |
| [SPEC-COPILOT.md](specs/SPEC-COPILOT.md) | Offline research copilot: natural-language questions routed to deterministic recipes over the parsed witness. |
| [SPEC-LIGHTWEIGHT.md](specs/SPEC-LIGHTWEIGHT.md) | What stays on the device until a backend is turned on, and the size and startup budget. |
| [SPEC-PDF-INGEST.md](specs/SPEC-PDF-INGEST.md) | Future path from a PDF of a book or manuscript to an HSMS draft aligned to page images. |
