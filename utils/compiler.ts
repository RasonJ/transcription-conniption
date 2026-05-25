/**
 * HSMS two-pass compiler entry points.
 *
 * Pass 1 — `tokenizeLineStructural` / `tokenizeString` (hsmsLexer + structuralAssembly)
 * Pass 2 — `assembleStructuralTokens` (environment stack → envLayers on tokens)
 * Pass 3 — `parseHsMsText` / `compileManuscriptTree` (line driver + block flush)
 */
export { parseHsMsText, parseHsMsText as compileManuscriptTree } from "./manuscriptParser";
export { lintHsmsTranscription, validationIssuesToLintReport, type LintReport } from "./hsmsLinter";
export { generateConcordanceIndex, computeManuscriptStats, enrichParsedManuscript } from "./analyzeManuscript";
export { tokenizeString } from "./hsmsLexer";
export {
  assembleStructuralTokens,
  tokenizeLineStructural,
  type BlockEnvironmentStack,
  type StructuralAssemblyResult,
} from "./structuralAssembly";
export { parseComplexFolio, parseFolioMarker } from "./folioMarkers";
export {
  applyWrapBackLinesInPlace,
  buildSpatialFolio,
  lineToAstNodes,
  zipColumnBlockRows,
  type SpatialColumnBlock,
  type SpatialFolio,
  type SpatialLine,
  type SpatialNode,
} from "./spatialAst";
