/** Extra English triggers that separate commonly confused recipes. */
export const EN: Record<string, string[]> = {
  "lex.code_switching": ["where does the language switch", "passages written in another language", "switches between romance and latin"],
  "ml.foreign_ratio": ["what fraction of the words are foreign", "proportion of the token count in other languages", "how much of the text is latin as a percentage"],
  "corr.editorial_overrides": ["editor restores what the scribe deleted", "editorial reversal of a scribal correction"],
  "corr.deletions_scribal_vs_editorial": ["how many words were crossed out", "struck through by the copyist versus by the editor"],
  "morph.contractions": ["preposition and article fused into one word", "words like delos written as a single unit"],
  "colloc.prep_article": ["how often does en take an article", "en with or without the article"],
  "damage.illegible": ["defaced or erased passages", "unreadable text"],
  "damage.reconstructions_by_hand": ["text the editor supplied by reconstruction", "reconstructed readings"],
  "layout.wrapback": ["text carried back to the previous line", "wrap-back at the column foot"],
  "syntax.punctuation": ["how the scribe punctuates", "punctuation habits of the copyist"],
  "dial.tagged_spans": ["passages marked as aragonese", "spans tagged with a dialect code"],
  "lex.greek_formulas": ["christ and jesus abbreviated with greek letters", "chrismon abbreviations xps"],
  "corpus.term_frequency": [
    "words appearing most frequently",
    "most often used words",
    "how often each word is used",
    "words that occur most frequently",
    "frequency list of the words",
    "word counts ranked from most common",
    "commonest words in the witness",
  ],
  "corpus.ngrams": [
    "two-word combinations",
    "word sequences of length two",
  ],
  "corpus.vocab_density": [
    "vocabulary density per folio",
    "lexical richness of each folio",
  ],
};
