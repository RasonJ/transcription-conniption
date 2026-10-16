# OSTA quick reference (Transcription Conniption)

Summarized from the HSMS *Old Spanish Textual Archive* user manuals (`gu/manuals/OSTA/`, CC BY-NC-SA 4.0). Prefer this cheat-sheet in-app; follow live HSMS / OSTA sites for authoritative wording.

## Citing OSTA

Suggested bibliographic form (adapt style guides as needed):

> Gago Jover, Francisco y F. Javier Pueyo Mena. 2021– . *Old Spanish Textual Archive*. Hispanic Seminary of Medieval Studies. Online at <http://osta.oldspanishtextualarchive.org/> [*access date*].

- Cite individual works with the work id (e.g. `HSMS-0003-0001`) or a full codex id (e.g. `HSMS-0003`), plus author/title when known.
- When publishing quantitative results, include the query string and filters as shown in the results pane so others can reproduce the hit set.
- Report transcription errors or tool bugs to the HSMS editors so the archive can improve.

Local witnesses in this workstation use filenames like `TEXT.SIGLA.txt` and library catalog ids derived from those sigla.

## Query fields (expert search mental model)

| Field | Meaning |
|-------|---------|
| Paleographic / HSMS form | Diplomatic string as transcribed |
| `word` | Normalized orthographic token |
| `lemma` | Dictionary lemma (analizador / `hsms.src`) |
| `pos` | EAGLES-style morphological tag (e.g. `NCMS000`, `VMN0000`) |

Case / diacritic flags commonly appear as `%c` / `%d` on field constraints in the classic OSTA CQP-style syntax.

## Wildcards & operators (cheat-sheet)

| Token | Role | Example idea |
|-------|------|----------------|
| `.` | One character | `ca.a` → *casa*, *cama*, … |
| `.*` | Zero or more chars | `amarga.*` |
| `.+` | One or more chars | `amarga.+` (excludes bare *amarga*) |
| `?` | Previous char optional | `res?cebir` → *recebir* / *rescebir* |
| `*` | Previous char ×0+ | `cas*as*` |
| `+` | Previous char ×1+ | `car+o` → *caro* / *carro* |
| `{n}` / `{m,n}` | Exact / range repetition | POS or word sequences |
| `[]` | Any single word (gap) | between two anchored hits |
| `[abc]` / `[^mt]` | Character class / negation | orthographic variants |
| `!` | Negate a field test | `pos!='V.*'` |
| `&` / `\|` | AND / OR within a token constraint | lemma + POS |

Examples adapted from the manuals (not executed here):

- `[(word='plantas?' & pos='NC.*'%c)]` — noun *planta(s)*
- `[(lemma='perro'%cd)] within text sort by yearobra`
- `[(word='h?a[buv]er'%c)]` — orthographic variants of *haber*

In Transcription Conniption, prefer Copilot recipes (`corpus.term_frequency`, `corpus.ngrams`, search passages) and library sidecars for local work; full CQP UI remains a later phase.

## Metadata filters researchers expect

Classic OSTA filtering axes (useful when enriching Library filters):

- Century / year of composition or printing
- Text typology / materia
- Author, translator, printer, place
- Language / script tags
- Witness sigla and work identifiers

## HSMS structural tags ↔ meaning

Crosswalk lives in `docs/HSMS-manual.md` and the Studio linter. High-traffic mnemonics:

| Tag | Role |
|-----|------|
| `{CB1.` … | Column / text block |
| `{RUB.` | Rubric |
| `{GL.` / `{AD.` | Gloss / addendum |
| `{IN`*n*`.` | Drop initial (depth *n*) |
| `{LAT.` … | Language span |
| `{CW.` / `{SG.` | Catchword / signature |
| `{RMK:` … `}` | Header remark (same-line close) |

## Related in this repo

| Need | Where |
|------|--------|
| Full HSMS transcription rules | `docs/HSMS-manual.md` |
| Proofer incident port notes | `docs/PORTING-FROM-HSMS-MANUALS.md` |
| Lemma + POS index build | `scripts/generate-hsms-dictionary-index.mjs` |
| Live corpus / About links | About tab · [OSTA on GitHub](https://github.com/hispanicseminary/OSTA) |

*Derived from HSMS manuals; do not paste large verbatim HTML. Attribute Hispanic Seminary of Medieval Studies when redistributing.*
