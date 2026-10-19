/**
 * HSMS physical / spatial layer: Folio → Column → Block → Line → Token,
 * drop initials, figure anchors, hyphenation, expansions, interventions.
 */
import type { ParsedManuscript, Token } from "../../constants/manuscript";
import { computeReasoningDagHash } from "./hash";
import type {
  BlockAttributes,
  ColumnAttributes,
  DropInitialAttributes,
  EditorialInterventionAttributes,
  ExpansionAttributes,
  FigureAnchorAttributes,
  FolioAttributes,
  LineAttributes,
  PunctuationAttributes,
  ReasoningGraphDoc,
  ReasoningNode,
  ReasoningRelation,
  TokenAttributes,
} from "./types";
import { DEFAULT_LOD_BY_TYPE } from "./types";

function utcNowIso(): string {
  return new Date().toISOString();
}

function finalize(doc: ReasoningGraphDoc): ReasoningGraphDoc {
  doc.dag_hash = computeReasoningDagHash(doc);
  return doc;
}

function upsertNode(doc: ReasoningGraphDoc, node: ReasoningNode): void {
  const next: ReasoningNode = {
    ...node,
    lod_tier: node.lod_tier ?? DEFAULT_LOD_BY_TYPE[node.type],
    subgraph: node.subgraph ?? `docstruct:${doc.nodes.find((n) => n.type === "Witness")?.id ?? "open"}`,
  };
  const idx = doc.nodes.findIndex((n) => n.id === next.id);
  if (idx >= 0) {
    doc.nodes[idx] = {
      ...doc.nodes[idx],
      ...next,
      attributes: { ...doc.nodes[idx].attributes, ...next.attributes },
      lod_tier: next.lod_tier ?? doc.nodes[idx].lod_tier,
      subgraph: next.subgraph ?? doc.nodes[idx].subgraph,
    };
  } else doc.nodes.push(next);
}

function upsertEdge(
  doc: ReasoningGraphDoc,
  source: string,
  target: string,
  relation: ReasoningRelation,
  properties?: Record<string, unknown>,
): void {
  const id = `E:${source}:${relation}:${target}`;
  const next = {
    id,
    source,
    target,
    source_type: doc.nodes.find((n) => n.id === source)?.type,
    target_type: doc.nodes.find((n) => n.id === target)?.type,
    relation,
    properties: { created_at: utcNowIso(), ...properties },
  };
  const idx = doc.edges.findIndex((e) => (e.id ?? `E:${e.source}:${e.relation}:${e.target}`) === id);
  if (idx >= 0) {
    doc.edges[idx] = {
      ...doc.edges[idx],
      ...next,
      properties: { ...doc.edges[idx].properties, ...next.properties },
    };
  } else doc.edges.push(next);
}

function parseFolioSide(folioId: string): { folioNumber: string; side: "recto" | "verso" } {
  const m = folioId.match(/^(\d+)([rv])$/i);
  if (m) {
    return {
      folioNumber: `${m[1]}${m[2]!.toLowerCase()}`,
      side: m[2]!.toLowerCase() === "v" ? "verso" : "recto",
    };
  }
  return { folioNumber: folioId, side: folioId.toLowerCase().endsWith("v") ? "verso" : "recto" };
}

function mapBlockType(type: string): BlockAttributes["type"] {
  if (type === "rubric" || type === "gloss" || type === "addendum" || type === "heading") return type;
  return "prose";
}

function interventionTypeFor(token: Token): EditorialInterventionAttributes["interventionType"] | null {
  switch (token.type) {
    case "scribal_deletion":
      return "scribal_deletion";
    case "scribal_insertion":
      return "scribal_insertion";
    case "editorial_deletion":
      return "editorial_deletion";
    case "editorial_insertion":
      return "editorial_insertion";
    default:
      return null;
  }
}

function isPunctuationToken(token: Token): PunctuationAttributes["type"] | null {
  if (token.type === "calderon") return "calderon";
  if (token.type === "calderon_two") return "calderon_two";
  if (token.type === "scribal_punctuation") return "scribal_punctuation";
  return null;
}

function looksLikeAbbreviation(raw: string): boolean {
  return /<[^>]+>|@~|[@^]/.test(raw);
}

export type SpatialSeedMode = "shallow" | "deep";

export type SpatialSeedOptions = {
  manuscriptId?: string;
  /** shallow = folio/column/block/footer/next_folio; deep = + lines/tokens/hyphens/dropcaps */
  mode?: SpatialSeedMode;
  /** Cap tokens emitted per folio in deep mode (default unlimited). */
  maxTokensPerFolio?: number;
};

/**
 * Attach physical containment + reading-order edges from a ParsedManuscript.
 * Call after seedFromWitness (or on any graph that already has MANUSCRIPT / FOLIO stubs).
 */
export function seedSpatialStructure(
  graphDoc: ReasoningGraphDoc,
  parsed: ParsedManuscript,
  options?: SpatialSeedOptions,
): ReasoningGraphDoc {
  const doc: ReasoningGraphDoc = {
    ...graphDoc,
    nodes: [...graphDoc.nodes],
    edges: [...graphDoc.edges],
  };
  const mode = options?.mode ?? "shallow";
  const manuscriptId =
    options?.manuscriptId ??
    doc.nodes.find((n) => n.type === "Manuscript")?.id ??
    "MANUSCRIPT:open";

  // Enrich manuscript physical bibliography when present on parsed metadata.
  const ms = doc.nodes.find((n) => n.id === manuscriptId);
  if (ms?.type === "Manuscript") {
    upsertNode(doc, {
      id: manuscriptId,
      type: "Manuscript",
      attributes: {
        ...ms.attributes,
        repository: ms.attributes.repository ?? parsed.metadata.witness?.library,
        city: ms.attributes.city ?? parsed.metadata.witness?.city ?? parsed.metadata.imprint?.city,
        dateCreated: ms.attributes.dateCreated ?? parsed.metadata.imprint?.date,
        author: ms.attributes.author ?? parsed.metadata.author,
        language: ms.attributes.language ?? "SPA",
      },
    });
  }

  let prevFolioId: string | null = null;
  parsed.folios.forEach((folio, folioIdx) => {
    const folioNodeId = `FOLIO:${folio.id}`;
    const { folioNumber, side } = parseFolioSide(folio.id);
    const folioAttrs: FolioAttributes = {
      id: folioNodeId,
      folioNumber,
      side,
      sequenceIndex: folioIdx,
      catchword: folio.catchword,
      signature: folio.signature,
    };
    upsertNode(doc, { id: folioNodeId, type: "Folio", attributes: folioAttrs });
    upsertEdge(doc, manuscriptId, folioNodeId, "has_folio", { sequenceIndex: folioIdx });

    if (prevFolioId) {
      upsertEdge(doc, prevFolioId, folioNodeId, "next_folio", {});
    }
    prevFolioId = folioNodeId;

    if (folio.catchword) {
      const cwId = `TOKEN:${folio.id}:catchword`;
      upsertNode(doc, {
        id: cwId,
        type: "Token",
        attributes: {
          id: cwId,
          raw: folio.catchword,
          diplomaticValue: folio.catchword,
          normalizedValue: folio.catchword,
          tokenType: "catchword",
        } satisfies TokenAttributes,
      });
      upsertEdge(doc, folioNodeId, cwId, "has_footer", { footerKind: "catchword" });
    }
    if (folio.signature) {
      const sigId = `TOKEN:${folio.id}:signature`;
      upsertNode(doc, {
        id: sigId,
        type: "Token",
        attributes: {
          id: sigId,
          raw: folio.signature,
          diplomaticValue: folio.signature,
          tokenType: "signature",
        } satisfies TokenAttributes,
      });
      upsertEdge(doc, folioNodeId, sigId, "has_footer", { footerKind: "signature" });
    }

    for (const heading of folio.headings ?? []) {
      const hid = `BLOCK:${folio.id}:heading:${heading.slice(0, 24)}`;
      upsertNode(doc, {
        id: hid,
        type: "Block",
        attributes: { id: hid, type: "heading", language: undefined } satisfies BlockAttributes,
      });
      upsertEdge(doc, folioNodeId, hid, "has_heading", {});
    }

    // Group blocks by column count → Column nodes
    const columnIds = new Map<number, string>();
    const ensureColumn = (cols: number): string => {
      const idx = Math.max(1, cols || 1);
      if (columnIds.has(idx)) return columnIds.get(idx)!;
      const colId = `COLUMN:${folio.id}:CB${idx}`;
      const attrs: ColumnAttributes = {
        id: colId,
        columnIndex: idx,
        layoutType: `CB${idx}`,
      };
      upsertNode(doc, { id: colId, type: "Column", attributes: attrs });
      upsertEdge(doc, folioNodeId, colId, "has_column", {});
      columnIds.set(idx, colId);
      return colId;
    };

    let tokensEmitted = 0;
    let prevLineId: string | null = null;
    let pendingHyphenTokenId: string | null = null;
    let activeDropInitialId: string | null = null;
    let dropIndentRemaining = 0;

    folio.blocks.forEach((block, blockIdx) => {
      const colId = ensureColumn(block.columns);
      const blockId = `BLOCK:${folio.id}:${blockIdx}`;
      const blockAttrs: BlockAttributes = {
        id: blockId,
        type: mapBlockType(block.type),
        language: block.language,
        columns: block.columns,
      };
      upsertNode(doc, { id: blockId, type: "Block", attributes: blockAttrs });
      upsertEdge(doc, colId, blockId, "contains_block", { sequenceIndex: blockIdx });

      if (mode === "shallow") return;

      const lineNumber = block.lineNumber ?? String(blockIdx + 1);
      const lineId = `LINE:${folio.id}:${lineNumber}:${blockIdx}`;
      const lineAttrs: LineAttributes = {
        id: lineId,
        lineNumber,
        sequenceIndex: blockIdx,
      };
      upsertNode(doc, { id: lineId, type: "Line", attributes: lineAttrs });
      upsertEdge(doc, blockId, lineId, "contains_line", {});
      if (prevLineId) upsertEdge(doc, prevLineId, lineId, "next_line", {});
      prevLineId = lineId;

      if (block.type === "gloss") {
        upsertEdge(doc, blockId, lineId, "glosses_line", {});
      }

      if (activeDropInitialId && dropIndentRemaining > 0) {
        upsertEdge(doc, activeDropInitialId, lineId, "indents", {
          remainingDepth: dropIndentRemaining,
        });
        dropIndentRemaining -= 1;
        if (dropIndentRemaining <= 0) activeDropInitialId = null;
      }

      let prevTokenId: string | null = null;
      for (let ti = 0; ti < block.tokens.length; ti++) {
        if (options?.maxTokensPerFolio != null && tokensEmitted >= options.maxTokensPerFolio) break;
        const token = block.tokens[ti]!;
        const tokenId = `TOKEN:${folio.id}:${blockIdx}:${ti}`;
        tokensEmitted += 1;

        // Drop initial
        if (token.type === "drop_initial" || token.initialDepth) {
          const depth = token.initialDepth ?? 1;
          const dropId = `DROP:${folio.id}:${blockIdx}:${ti}`;
          const dropAttrs: DropInitialAttributes = {
            id: dropId,
            letter: token.value || token.raw,
            depthInLines: depth,
            style: "ornate",
          };
          upsertNode(doc, { id: dropId, type: "DropInitial", attributes: dropAttrs });
          activeDropInitialId = dropId;
          dropIndentRemaining = depth;
          upsertEdge(doc, dropId, lineId, "indents", { remainingDepth: depth });
        }

        const punctKind = isPunctuationToken(token);
        if (punctKind) {
          const punctId = `PUNCT:${folio.id}:${blockIdx}:${ti}`;
          upsertNode(doc, {
            id: punctId,
            type: "Punctuation",
            attributes: { id: punctId, type: punctKind, raw: token.raw } satisfies PunctuationAttributes,
          });
        }

        const tokAttrs: TokenAttributes = {
          id: tokenId,
          raw: token.raw,
          diplomaticValue: token.value || token.raw,
          normalizedValue: token.normalized ?? token.value,
          tokenType: token.type,
          hand: token.hand,
        };
        upsertNode(doc, { id: tokenId, type: "Token", attributes: tokAttrs });
        upsertEdge(doc, lineId, tokenId, "contains_token", { sequenceIndex: ti });

        if (token.type === "figure_anchor" || token.figureId || token.figureType) {
          const figId = `FIGURE:${token.figureId ?? `${folio.id}_${blockIdx}_${ti}`}`;
          const figAttrs: FigureAnchorAttributes = {
            id: figId,
            figureId: token.figureId,
            mnemonicType: token.figureType,
          };
          upsertNode(doc, { id: figId, type: "FigureAnchor", attributes: figAttrs });
          upsertEdge(doc, tokenId, figId, "located_at", {});
        }

        if (prevTokenId) upsertEdge(doc, prevTokenId, tokenId, "next_token", {});
        prevTokenId = tokenId;

        if (pendingHyphenTokenId) {
          upsertEdge(doc, pendingHyphenTokenId, tokenId, "hyphenated_to", {});
          pendingHyphenTokenId = null;
        }
        if (token.type === "hyphen" || /-$/.test(token.raw) || /-$/.test(token.value)) {
          pendingHyphenTokenId = tokenId;
        }

        if (looksLikeAbbreviation(token.raw) && token.normalized && token.normalized !== token.raw) {
          const expId = `EXP:${folio.id}:${blockIdx}:${ti}`;
          const supplied = token.normalized.replace(token.value, "") || token.normalized;
          upsertNode(doc, {
            id: expId,
            type: "Expansion",
            attributes: {
              id: expId,
              suppliedText: supplied,
              type: "abbreviation",
            } satisfies ExpansionAttributes,
          });
          upsertEdge(doc, tokenId, expId, "has_expansion", {});
        }

        const intervention = interventionTypeFor(token);
        if (intervention) {
          const intId = `INT:${folio.id}:${blockIdx}:${ti}`;
          upsertNode(doc, {
            id: intId,
            type: "EditorialIntervention",
            attributes: {
              id: intId,
              interventionType: intervention,
              hand: token.hand ?? "hand1",
            } satisfies EditorialInterventionAttributes,
          });
          upsertEdge(doc, tokenId, intId, "has_intervention", {});
        }

        const lemma = (token.normalized ?? token.value ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
        if (lemma.length > 1 && token.type !== "hyphen" && !punctKind) {
          const lemmaId = `LEMMA:${lemma}`;
          upsertNode(doc, {
            id: lemmaId,
            type: "LemmaNode",
            attributes: { id: lemmaId, lemma, language: block.language },
          });
          upsertEdge(doc, tokenId, lemmaId, "maps_to_lemma", {});
        }
      }
    });
  });

  return finalize(doc);
}

/** Lines indented by a given drop-initial letter (Cypher INDENTS analogue). */
export function linesIndentedByDropInitial(
  graphDoc: ReasoningGraphDoc,
  letter: string,
): Array<{ lineId: string; lineNumber?: string; tokens: string[] }> {
  const drops = graphDoc.nodes.filter(
    (n) => n.type === "DropInitial" && String(n.attributes.letter ?? "").toLowerCase() === letter.toLowerCase(),
  );
  const out: Array<{ lineId: string; lineNumber?: string; tokens: string[] }> = [];
  for (const drop of drops) {
    const lineIds = graphDoc.edges
      .filter((e) => e.source === drop.id && e.relation === "indents")
      .map((e) => e.target);
    for (const lineId of lineIds) {
      const line = graphDoc.nodes.find((n) => n.id === lineId);
      const tokenIds = graphDoc.edges
        .filter((e) => e.source === lineId && e.relation === "contains_token")
        .map((e) => e.target);
      const tokens = tokenIds.map((tid) => {
        const t = graphDoc.nodes.find((n) => n.id === tid);
        return String(t?.attributes.diplomaticValue ?? t?.attributes.raw ?? "");
      });
      out.push({
        lineId,
        lineNumber: line?.attributes.lineNumber as string | undefined,
        tokens,
      });
    }
  }
  return out;
}

/** Unstitch hyphenated token pairs into full words. */
export function unstitchHyphenatedWords(
  graphDoc: ReasoningGraphDoc,
): Array<{ left: string; right: string; fullWord: string }> {
  return graphDoc.edges
    .filter((e) => e.relation === "hyphenated_to")
    .map((e) => {
      const a = graphDoc.nodes.find((n) => n.id === e.source);
      const b = graphDoc.nodes.find((n) => n.id === e.target);
      const left = String(a?.attributes.diplomaticValue ?? a?.attributes.raw ?? "").replace(/-$/, "");
      const right = String(b?.attributes.diplomaticValue ?? b?.attributes.raw ?? "");
      return { left, right, fullWord: left + right };
    });
}

/** Build a KWIC window by walking next_token / reverse next_token from a lemma. */
export function kwicFromLemma(
  graphDoc: ReasoningGraphDoc,
  lemma: string,
  window = 5,
): Array<{ lemmaId: string; left: string[]; hit: string; right: string[] }> {
  const lemmaId = lemma.startsWith("LEMMA:") ? lemma : `LEMMA:${lemma.toLowerCase()}`;
  const hits = graphDoc.edges.filter((e) => e.relation === "maps_to_lemma" && e.target === lemmaId);
  const nextBySource = new Map<string, string>();
  const prevByTarget = new Map<string, string>();
  for (const e of graphDoc.edges) {
    if (e.relation !== "next_token") continue;
    nextBySource.set(e.source, e.target);
    prevByTarget.set(e.target, e.source);
  }
  const label = (id: string) => {
    const n = graphDoc.nodes.find((x) => x.id === id);
    return String(n?.attributes.diplomaticValue ?? n?.attributes.raw ?? "");
  };

  return hits.map((h) => {
    const left: string[] = [];
    let cur = prevByTarget.get(h.source);
    for (let i = 0; i < window && cur; i++) {
      left.unshift(label(cur));
      cur = prevByTarget.get(cur);
    }
    const right: string[] = [];
    cur = nextBySource.get(h.source);
    for (let i = 0; i < window && cur; i++) {
      right.push(label(cur));
      cur = nextBySource.get(cur);
    }
    return { lemmaId, left, hit: label(h.source), right };
  });
}

/** Latin (or other) gloss tokens with a given intervention hand. */
export function glossTokensByHand(
  graphDoc: ReasoningGraphDoc,
  language: string,
  hand: string,
): Array<{ blockId: string; tokenId: string; interventionId: string }> {
  const glossBlocks = graphDoc.nodes.filter(
    (n) =>
      n.type === "Block" &&
      n.attributes.type === "gloss" &&
      String(n.attributes.language ?? "").toUpperCase() === language.toUpperCase(),
  );
  const out: Array<{ blockId: string; tokenId: string; interventionId: string }> = [];
  for (const block of glossBlocks) {
    const lineIds = graphDoc.edges
      .filter((e) => e.source === block.id && e.relation === "contains_line")
      .map((e) => e.target);
    for (const lineId of lineIds) {
      const tokenIds = graphDoc.edges
        .filter((e) => e.source === lineId && e.relation === "contains_token")
        .map((e) => e.target);
      for (const tokenId of tokenIds) {
        const ints = graphDoc.edges.filter((e) => e.source === tokenId && e.relation === "has_intervention");
        for (const ie of ints) {
          const inode = graphDoc.nodes.find((n) => n.id === ie.target);
          if (String(inode?.attributes.hand ?? "") === hand) {
            out.push({ blockId: block.id, tokenId, interventionId: ie.target });
          }
        }
      }
    }
  }
  return out;
}
