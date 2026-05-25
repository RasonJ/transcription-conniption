import type { ManuscriptBlock, ParsedManuscript, Token } from "../constants/manuscript";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tokenToTei(token: Token): string {
  const v = escapeXml(token.value);
  const rawVal = token.raw ? escapeXml(token.raw) : "";
  let inner: string;

  switch (token.type) {
    case "expansion":
      inner = `<choice><abbr>${rawVal || "…"}</abbr><expan>${v}</expan></choice>`;
      break;
    case "scribal_deletion":
      inner = `<del rend="strikethrough" source="scribe">${v}</del>`;
      break;
    case "editorial_deletion":
      inner = `<del rend="overstrike">${v}</del>`;
      break;
    case "scribal_insertion":
      inner = `<add place="above" resp="${token.hand ?? "scribe"}">${v}</add>`;
      break;
    case "editorial_insertion":
      inner = `<add place="inline">${v}</add>`;
      break;
    case "reconstructed_text":
      inner = `<supplied reason="illegible" cert="low">[${v}]</supplied>`;
      break;
    case "illegible_text":
      inner = `<gap reason="illegible" extent="${v}"><desc>illegible</desc></gap>`;
      break;
    case "missing_fragment":
      inner = `<gap reason="lost" extent="${v}"><desc>lacuna</desc></gap>`;
      break;
    case "mechanical_lacuna":
      inner = `<space dim="horizontal" extent="lacuna"/>`;
      break;
    case "superscript":
      inner = `<hi rend="superscript">${v}</hi>`;
      break;
    case "calderon":
    case "calderon_two":
    case "calderon_three":
      inner = `<milestone unit="paragraph" rend="${token.type}"/>`;
      break;
    case "blank_space":
      inner = `<space dim="horizontal" extent="${v || "unknown"}"/>`;
      break;
    case "otiose_mark":
      inner = `<am rend="otiose">~</am>`;
      break;
    case "hyphen":
      inner = `<pc type="hyphen">-</pc>`;
      break;
    case "scribal_punctuation":
      inner = `<pc type="scribal">${rawVal || v}</pc>`;
      break;
    case "figure_anchor":
      inner = `<figure xml:id="${escapeXml(token.figureId ?? "fig")}" type="${token.figureType ?? "ILL"}"><figDesc>${v}</figDesc></figure>`;
      break;
    case "drop_initial":
      inner = `<hi rend="drop-initial" facs="${token.initialDepth ?? 1}">${v}</hi>`;
      break;
    default:
      inner = escapeXml(token.normalized ?? token.value);
  }

  let inlineLang = null;
  if (token.envLayers) {
    for (let i = token.envLayers.length - 1; i >= 0; i--) {
      if (token.envLayers[i].type === "language_span") {
        inlineLang = token.envLayers[i];
        break;
      }
    }
  }

  return inlineLang
    ? `<foreign xml:lang="${escapeXml(inlineLang.code)}">${inner}</foreign>`
    : inner;
}

function blockToTei(block: ManuscriptBlock): string {
  const inner = block.tokens.map(tokenToTei).join("");
  const colAttr = block.columns && block.columns > 1 ? ` rend="columns-${block.columns}"` : "";

  switch (block.type) {
    case "rubric":
      return `<head rend="rubric"${colAttr}>${inner}</head>\n`;
    case "gloss":
      return `<note type="gloss"${colAttr}>${inner}</note>\n`;
    case "addendum":
      return `<note type="addendum"${colAttr}>${inner}</note>\n`;
    case "language_span":
      return `<foreign xml:lang="${block.language ?? "und"}"${colAttr}>${inner}</foreign>\n`;
    case "diagram":
      return `<figure><figDesc>Diagram placeholder</figDesc></figure>\n`;
    case "initial_container":
      return `<figure type="initial"><label>${inner}</label></figure>\n`;
    default:
      if (block.lineNumber) {
        return `<l n="${escapeXml(block.lineNumber)}"${colAttr}>${inner}</l>\n`;
      }
      return `<p${colAttr}>${inner}</p>\n`;
  }
}

export function exportToTEIXML(parsed: ParsedManuscript): string {
  const chunks: string[] = [];
  const title = escapeXml(parsed.metadata.title || "Untitled");
  const author = escapeXml(parsed.metadata.author || "Unknown");

  chunks.push(
    `<?xml version="1.0" encoding="UTF-8"?>\n`,
    `<TEI xmlns="http://www.tei-c.org/ns/1.0">\n`,
    `  <teiHeader>\n`,
    `    <fileDesc>\n`,
    `      <titleStmt><title>${title}</title><author>${author}</author></titleStmt>\n`,
    `      <sourceDesc><p>Exported from Transcription Conniption (HSMS transcription)</p></sourceDesc>\n`,
    `    </fileDesc>\n`,
    `  </teiHeader>\n`,
    `  <text xml:lang="osp">\n    <body>\n`,
  );

  for (let fi = 0; fi < parsed.folios.length; fi++) {
    const folio = parsed.folios[fi];
    chunks.push(
      `      <div type="folio" n="${escapeXml(folio.id)}">\n`,
      `        <pb n="${escapeXml(folio.id)}"/>\n`,
    );

    for (let hi = 0; hi < folio.headings.length; hi++) {
      chunks.push(`        <head type="running">${escapeXml(folio.headings[hi])}</head>\n`);
    }

    for (let bi = 0; bi < folio.blocks.length; bi++) {
      chunks.push(`        ${blockToTei(folio.blocks[bi])}`);
    }

    if (folio.catchword) {
      chunks.push(`        <fw type="catchword">${escapeXml(folio.catchword)}</fw>\n`);
    }
    if (folio.signature) {
      chunks.push(`        <fw type="signature">${escapeXml(folio.signature)}</fw>\n`);
    }
    chunks.push(`      </div>\n`);
  }

  chunks.push(`    </body>\n  </text>\n</TEI>\n`);
  return chunks.join("");
}

export function exportNormalizedTEI(parsed: ParsedManuscript): string {
  const title = escapeXml(parsed.metadata.title || "Untitled");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<TEI xmlns="http://www.tei-c.org/ns/1.0">\n` +
    `  <teiHeader><fileDesc><titleStmt><title>${escapeXml(title)} (normalized)</title></titleStmt></fileDesc></teiHeader>\n` +
    `  <text><body><p>${escapeXml(parsed.reconstructedFlow ?? "")}</p></body></text>\n</TEI>\n`
  );
}
