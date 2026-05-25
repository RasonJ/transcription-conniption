import type { ParsedManuscript, Token } from "../constants/manuscript";
import { formatRunningHeaderText } from "./metadataText";
import { buildSpatialFolio, zipColumnBlockRows, type SpatialLine } from "./spatialAst";

export type LegacyHtmlExportOptions = {
  showExpanded?: boolean;
  showDeletions?: boolean;
  useNormalizedDiacritics?: boolean;
  suppressOtioseMarks?: boolean;
};

const DEFAULT_OPTIONS: Required<LegacyHtmlExportOptions> = {
  showExpanded: true,
  showDeletions: true,
  useNormalizedDiacritics: true,
  suppressOtioseMarks: false,
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function displayTokenValue(token: Token, options: Required<LegacyHtmlExportOptions>): string {
  if (token.type === "text" && token.normalized && options.useNormalizedDiacritics) {
    return token.normalized;
  }
  return token.value ?? "";
}

function renderTokensToHtml(
  tokens: Token[],
  blockType: string,
  options: Required<LegacyHtmlExportOptions>,
): string {
  const pieces: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const val = escapeHtml(displayTokenValue(token, options));

    switch (token.type) {
      case "drop_initial":
      case "env_open":
      case "env_close":
        break;
      case "expansion":
        if (options.showExpanded) {
          pieces.push(`<i>${val}</i>`);
        }
        break;
      case "scribal_deletion":
      case "editorial_deletion":
        if (options.showDeletions) {
          const inner =
            token.type === "scribal_deletion" ? `(${val})` : val;
          pieces.push(
            `<span style="color: #999; text-decoration: line-through;">${inner}</span>`,
          );
        }
        break;
      case "reconstructed_text":
        pieces.push(
          `<span style="color: #2a6e22; font-style: italic;">[${val}]</span>`,
        );
        break;
      case "illegible_text":
        pieces.push(`<span style="color: #a08060;">&#9633;&#9633;</span>`);
        break;
      case "missing_fragment":
        pieces.push(`<span style="color: #a08060; font-style: italic;">&hellip;</span>`);
        break;
      case "mechanical_lacuna":
        pieces.push("&#160;");
        break;
      case "scribal_insertion":
      case "editorial_insertion": {
        const border =
          token.type === "editorial_insertion" ? "border: 1px solid #c0a060;" : "";
        pieces.push(
          `<span style="background-color: #f4ebd0; color: #5a2317; padding: 0 2px; ${border}">/${val}/</span>`,
        );
        break;
      }
      case "superscript":
        pieces.push(`<sup style="font-size: 0.75em; vertical-align: super;">${val}</sup>`);
        break;
      case "calderon":
        pieces.push(`<span style="color: #9b2217; font-weight: bold;">&#182;</span>`);
        break;
      case "calderon_two":
        pieces.push(`<span style="color: #9b2217; font-weight: bold;">&#182;&#182;</span>`);
        break;
      case "calderon_three":
        pieces.push(`<span style="color: #9b2217; font-weight: bold;">&#182;&#182;&#182;</span>`);
        break;
      case "scribal_punctuation": {
        const punct = token.value === "$." || token.value === "$;" ? ";" : token.value;
        pieces.push(`<span style="color: #9b2217; font-weight: bold;">${escapeHtml(punct)}</span>`);
        break;
      }
      case "citation_wrap":
        pieces.push(
          `<span style="color: #a08060; font-style: italic; font-size: 0.95em; letter-spacing: -0.02em;">${val}</span>`,
        );
        break;
      case "blank_space":
        if (/^\[\s*\]$/.test(token.raw ?? "")) {
          pieces.push("&#160;");
        } else {
          pieces.push("&#160;&#160;&#160;");
        }
        break;
      case "otiose_mark":
        if (!options.suppressOtioseMarks) pieces.push("~");
        break;
      case "hyphen":
        pieces.push("-");
        break;
      case "figure_anchor":
        pieces.push(
          `<span style="color: #1a3a5a; font-style: italic; font-weight: bold;">[${escapeHtml(token.figureType ?? "FIG")}]</span>`,
        );
        break;
      case "text":
      default: {
        const nestedRubric = token.envLayers?.some((l) => l.type === "rubric");
        const nestedForeign = token.envLayers?.some((l) => l.type === "language_span");
        if (nestedRubric || blockType === "rubric") {
          pieces.push(val);
        } else if (nestedForeign || blockType === "language_span") {
          pieces.push(`<i>${val}</i>`);
        } else {
          pieces.push(val);
        }
      }
    }
  }
  return pieces.join("");
}

function renderDropInitial(token: Token): string {
  const depth = token.initialDepth ?? 3;
  const fontSize = Math.max(depth * 15, 32);
  return (
    `<span class="drop-initial-cap" style="font-size: ${fontSize}px; font-weight: bold; ` +
    `font-family: Georgia, serif; text-transform: capitalize; color: #9b2217; float: left; ` +
    `margin-right: 6px; margin-top: 2px; line-height: 0.85em; border: 1px solid #d4af37; padding: 2px 4px; background: #fffdf5; border-radius: 4px;">` +
    `${escapeHtml(token.value)}</span>`
  );
}

function trimDropCapFromBodyTokens(tokens: Token[], capGrapheme: string): Token[] {
  if (!capGrapheme) return tokens;

  let remaining = capGrapheme;
  const out = tokens.map((t) => ({ ...t }));

  for (let i = 0; i < out.length && remaining.length > 0; i++) {
    const tok = out[i];
    if (tok.type !== "text") continue;

    const plain = tok.value ?? "";
    if (!plain) continue;

    if (plain.startsWith(remaining)) {
      const slice = plain.slice(remaining.length);
      out[i] = {
        ...tok,
        value: slice,
        raw: (tok.raw ?? plain).slice(remaining.length),
        ...(tok.normalized?.startsWith(remaining)
          ? { normalized: tok.normalized.slice(remaining.length) }
          : {}),
      };
      remaining = "";
      break;
    }

    if (remaining.startsWith(plain)) {
      remaining = remaining.slice(plain.length);
      out[i] = { ...tok, value: "", raw: "" };
    }
  }

  return out.filter((t) => t.type !== "text" || (t.value ?? "").length > 0);
}

function renderSpatialLine(line: SpatialLine, options: Required<LegacyHtmlExportOptions>): string {
  const block = line.block;
  if (block.type === "diagram") {
    return `<div style="border: 1px dashed #9b2217; background-color: #faf6eb; padding: 16px; text-align: center; margin: 12px 0; color: #5a2317; font-style: italic; font-family: Georgia, serif;">[Esquema / Diagrama Manuscrito]</div>`;
  }

  const dropInitial = block.tokens.find((t) => t.type === "drop_initial");
  let bodyTokens = block.tokens.filter(
    (t) => t.type !== "drop_initial" && t.type !== "figure_anchor",
  );
  if (dropInitial?.value) {
    bodyTokens = trimDropCapFromBodyTokens(bodyTokens, dropInitial.value);
  }

  let cellClass = "text-content-cell";
  if (block.type === "rubric") cellClass += " rubric-style";
  else if (block.type === "gloss") cellClass += " gloss-style";
  else if (block.type === "language_span") cellClass += " foreign-style";

  let html = `<div class="line-row-container" style="position: relative; display: flex; width: 100%; align-items: flex-start; margin-bottom: 2px;">`;
  html += `<span class="line-number-cell">${block.lineNumber ? escapeHtml(block.lineNumber) : ""}</span>`;
  html += `<div class="${cellClass}" style="flex: 1; min-width: 0; text-align: ${block.type === "rubric" ? "center" : "justify"};">`;

  if (dropInitial) {
    html += renderDropInitial(dropInitial);
  }

  html += renderTokensToHtml(bodyTokens, block.type, options);

  if (line.wrapBackSuffix) {
    html += `<span class="wrap-back-overlay" style="position: absolute; right: 0; top: 0; font-style: italic; color: #1a0a05; opacity: 0.85; pointer-events: none;">${escapeHtml(line.wrapBackSuffix)}</span>`;
  }

  html += `</div></div>`;
  return html;
}

/**
 * Serialize a parsed manuscript AST into a self-contained legacy-style HTML document
 * (parchment palette, flex row layout, float:left initials) aligned with HSMSLib output.
 */
export function exportToLegacyHTML(
  parsed: ParsedManuscript,
  options: LegacyHtmlExportOptions = {},
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const title = escapeHtml(parsed.metadata.title || "Transcription Conniption");
  const author = escapeHtml(parsed.metadata.author || "");

  let html = `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body {
      font-family: 'Georgia', 'Times New Roman', Times, serif;
      background-color: #f4ebd0;
      color: #1a0a05;
      padding: 40px 20px;
      margin: 0;
    }
    .scriptorium-center { text-align: center; margin-bottom: 32px; }
    .manuscript-title { color: #1a0a05; font-size: 32px; font-weight: bold; margin: 0 0 8px; font-family: Georgia, serif; }
    .manuscript-author { font-size: 16px; font-weight: bold; color: #6d5339; margin-bottom: 18px; }
    .imprint-table { background-color: #ede3c4; margin: 0 auto; border-collapse: collapse; border: 1px solid #dfd3b6; border-radius: 4px; }
    .imprint-table td { padding: 8px 16px; color: #2b110c; font-size: 13px; font-weight: 500; }
    .folio-table { width: 100%; max-width: 800px; background-color: #fcfaf2; margin: 24px auto; border-collapse: collapse; border: 1px solid #dfd3b6; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border-radius: 6px; overflow: hidden; }
    .folio-header-row { font-weight: bold; background-color: #ede3c4; color: #6d5339; letter-spacing: 0.5px; }
    .folio-header-row td { padding: 8px 16px; font-size: 13px; }
    .running-header { text-align: center; font-weight: bold; font-style: italic; padding: 6px 16px; background-color: #f4ebd0; color: #9b2217; border-bottom: 1px solid #dfd3b6; }
    .parchment-sheet-card { padding: 24px 28px; background: #fffdf5; }
    .line-number-cell { width: 36px; font-family: monospace; font-size: 11px; color: #a08060; font-weight: bold; vertical-align: top; padding-top: 4px; text-align: right; padding-right: 8px; user-select: none; }
    .text-content-cell { font-size: 16px; line-height: 24px; color: #1a0a05; }
    .rubric-style { color: #9b2217; font-weight: bold; }
    .gloss-style { color: #4a3060; font-size: 13px; font-style: italic; }
    .foreign-style { font-style: italic; color: #1a3a5a; }
    .folio-footer { font-size: 12px; color: #a08060; margin-top: 14px; font-style: italic; border-top: 1px solid #dfd3b6; padding-top: 8px; }
    .column-layout-split { display: flex; width: 100%; gap: 36px; margin-bottom: 6px; align-items: flex-start; }
    .column-track-frame { flex: 1; min-width: 0; }
  </style>
</head>
<body>

  <div class="scriptorium-center">
    <h1 class="manuscript-title">${title}</h1>
    ${author ? `<div class="manuscript-author">${author}</div>` : ""}
`;

  const imprintRows: string[] = [];
  if (parsed.metadata.imprint?.city) {
    imprintRows.push(
      `      <tr><td><b>Imprint:</b> ${escapeHtml(parsed.metadata.imprint.city)}</td>` +
        `<td>${escapeHtml(parsed.metadata.imprint.printer || "")}</td>` +
        `<td>${escapeHtml(parsed.metadata.imprint.date || "")}</td></tr>`,
    );
  }
  if (parsed.metadata.witness?.library) {
    imprintRows.push(
      `      <tr><td><b>Witness:</b> ${escapeHtml(parsed.metadata.witness.city || "")}</td>` +
        `<td>${escapeHtml(parsed.metadata.witness.library)}</td>` +
        `<td>${escapeHtml(parsed.metadata.witness.shelfmark || "")}</td></tr>`,
    );
  }
  if (imprintRows.length > 0) {
    html += `    <table class="imprint-table">\n${imprintRows.join("\n")}\n    </table>\n`;
  }

  html += `  </div>\n`;

  for (let fi = 0; fi < parsed.folios.length; fi++) {
    const folio = parsed.folios[fi];
    html += `
  <table class="folio-table">
    <tr class="folio-header-row">
      <td>folio ${escapeHtml(folio.id)}</td>
    </tr>
`;

    for (let hi = 0; hi < folio.headings.length; hi++) {
      html += `    <tr><td class="running-header">${escapeHtml(formatRunningHeaderText(folio.headings[hi], { showExpanded: opts.showExpanded }))}</td></tr>\n`;
    }

    html += `    <tr>
      <td>
        <div class="parchment-sheet-card">
`;

    const spatialFolio = buildSpatialFolio(folio);

    for (let cbi = 0; cbi < spatialFolio.columnBlocks.length; cbi++) {
      const cb = spatialFolio.columnBlocks[cbi];
      const rows = zipColumnBlockRows(cb);

      if (cb.layout === 1) {
        for (let li = 0; li < rows.length; li++) {
          if (rows[li].left) {
            html += `          ${renderSpatialLine(rows[li].left!, opts)}\n`;
          }
        }
      } else {
        for (let ri = 0; ri < rows.length; ri++) {
          const row = rows[ri];
          html += `          <div class="column-layout-split">`;
          html += `<div class="column-track-frame">${row.left ? renderSpatialLine(row.left, opts) : ""}</div>`;
          html += `<div class="column-track-frame">${row.right ? renderSpatialLine(row.right, opts) : ""}</div>`;
          html += `</div>\n`;
        }
      }
    }

    if (folio.catchword || folio.signature) {
      html += `          <p class="folio-footer">`;
      if (folio.catchword) {
        html += `<b>Catchword:</b> ${escapeHtml(folio.catchword)} &nbsp;&nbsp;&nbsp;&nbsp;`;
      }
      if (folio.signature) {
        html += `<b>Signature:</b> ${escapeHtml(folio.signature)}`;
      }
      html += `</p>\n`;
    }

    html += `        </div>
      </td>
    </tr>
  </table>
`;
  }

  html += `
</body>
</html>`;
  return html;
}

/** Suggested download filename from source witness name. */
export function htmlExportFileName(sourceFileName?: string | null): string {
  const base = (sourceFileName ?? "manuscript").replace(/\.[^/.]+$/, "");
  const safe = base.replace(/[^\w.\-]+/g, "_") || "manuscript";
  return `${safe}.html`;
}
