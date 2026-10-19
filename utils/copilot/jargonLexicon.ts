/**
 * Multilingual / paleographic jargon pre-pass (dental Spanglish lexicon adapted).
 * Normalizes author/editor slang into canonical English tokens before routing.
 */

export interface JargonResult {
  canonical: string;
  replacements: Array<{ from: string; to: string }>;
}

/** Longer phrases first so "ortografía moderna" wins over "ortografía". */
const ALIASES: Array<[RegExp, string]> = [
  // Display / UI
  [/\bortograf[ií]a\s+moderna\b/gi, "modern orthography"],
  [/\bgraf[ií]a\s+moderna\b/gi, "modern orthography"],
  [/\bn[uú]meros?\s+de\s+l[ií]nea\b/gi, "line numbers"],
  [/\bn[uú]meros?\s+de\s+linha\b/gi, "line numbers"],
  [/\bcopi(?:ar)?\s+texto\s+plano\b/gi, "copy plain text"],

  // Concordance / stats
  [/\bconcord[aà]ncia(?:\s+de|\s+para)?\b/gi, "concordance for"],
  [/\bconcordan[cç]a(?:\s+de|\s+para)?\b/gi, "concordance for"],
  [/\bkwic\b/gi, "keyword in context"],
  [/\brecuento\b/gi, "word count"],
  [/\brecompte\b/gi, "word count"],
  [/\bcontagem\b/gi, "word count"],
  [/\bfrecuencia\b/gi, "frequency"],
  [/\bfreq[uü][eè]ncia\b/gi, "frequency"],
  [/\bh[aá]pax\b/gi, "hapax"],
  [/\bhapax\s+legomena\b/gi, "hapax legomena"],

  // Paleography
  [/\breclamos?\b/gi, "catchwords"],
  [/\bcatchwords?\b/gi, "catchwords"],
  [/\binicial(?:es)?\s+iluminad[ao]s?\b/gi, "illuminated initials"],
  [/\bdrop\s+caps?\b/gi, "illuminated initials"],
  [/\btachaduras?\b/gi, "scribal deletions"],
  [/\bexpunciones?\b/gi, "scribal deletions"],
  [/\babreviaturas?\b/gi, "abbreviations"],
  [/\babrevia[cç][oõ]es?\b/gi, "abbreviations"],
  [/\btil(?:de)?s?\s+nasal(?:es)?\b/gi, "nasal suspension tildes"],
  [/\bmacrones?\b/gi, "abbreviation macrons"],
  [/\bglosas?\b/gi, "glosses"],
  [/\bgloses?\b/gi, "glosses"],
  [/\baddenda\b/gi, "addenda"],
  [/\bf[oó]lio\b/gi, "folio"],
  [/\bfolha\b/gi, "folio"],
  [/\btestemunhos?\b/gi, "witness"],
  [/\btestimonios?\b/gi, "witness"],
  [/\btestemu[ñn]os?\b/gi, "witness"],
  [/\bsignatura\b/gi, "shelfmark"],
  [/\bcota\b/gi, "shelfmark"],
  [/\bbiblioteca\b/gi, "library"],

  // Count / KWIC phrasing (Iberian) — map onto English trigger phrases
  [/\bcu[aá]ntas\s+veces\s+aparece\b/gi, "how many times appears"],
  [/\bquantas\s+vezes\s+aparece\b/gi, "how many times appears"],
  [/\bonde\s+aparece\b/gi, "show me where"],
  [/\bd[oó]nde\s+aparece\b/gi, "show me where"],

  // Validation / preflight
  [/\bpreflight\b/gi, "run structural lint"],
  [/\blint\s+estrutural\b/gi, "run structural lint"],
  [/\blint\s+estructural\b/gi, "run structural lint"],
];

export function canonicalizeJargon(text: string): JargonResult {
  let canonical = text;
  const replacements: JargonResult["replacements"] = [];
  for (const [re, to] of ALIASES) {
    re.lastIndex = 0;
    if (!re.test(canonical)) continue;
    re.lastIndex = 0;
    const next = canonical.replace(re, (match) => {
      replacements.push({ from: match, to });
      return to;
    });
    canonical = next;
  }
  return { canonical, replacements };
}
