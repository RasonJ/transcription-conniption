/** Local intent phrases for manuscript assistant routing (hash-embed prototypes). */
export const MANUSCRIPT_INTENT_PROTOTYPES = {
  find_rubric:
    "show rubrics find titles section heading red text rubric {RUB.}",
  find_gloss:
    "find glosses marginal notes commentary addenda gloss {GL.} {AD.}",
  goto_folio:
    "go to folio page leaf [fol. 2r] turn to page folio side verso recto",
  show_abbreviations:
    "explain abbreviations expanded text scribal marks expansions <ue> suspension",
  search_text:
    "search phrase find word occurrence text query where does it say",
} as const;

export type ManuscriptIntent = keyof typeof MANUSCRIPT_INTENT_PROTOTYPES;
