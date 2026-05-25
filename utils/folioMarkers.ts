/** Parse [fol. …] markers including column-track suffixes (42rA, cxxvib). */
export const FOLIO_MARKER_RE = /^\[fol\.\s*([^\]]+)\]/i;

/** Digit folio + optional column track (42rA, 12vB). Roman folios use {@link parseFolioMarker}. */
export const COMPLEX_FOLIO_RE = /^\[fol\.\s*(\d+[rvdD])([A-Da-d])?\]/i;

export type ParsedFolioMarker = {
  id: string;
  initialColumns: number;
  columnTrack?: string;
};

export type ComplexFolioParseResult = {
  id: string;
  injectedColumns?: number;
};

const COLUMN_LAYOUT_MAP: Record<string, number> = {
  A: 2,
  B: 2,
  C: 2,
  D: 2,
  b: 2,
  c: 2,
  d: 2,
};

function columnsFromTrackSuffix(suffix: string): number {
  return COLUMN_LAYOUT_MAP[suffix] ?? 1;
}

function parseFolioBody(raw: string): ParsedFolioMarker {
  const folioMatch =
    raw.match(/^([a-z0-9]+[rvdD])([A-Da-d])$/i) || raw.match(/^([a-z]+)([b-d])$/i);

  if (folioMatch) {
    const track = folioMatch[2];
    return {
      id: raw,
      initialColumns: columnsFromTrackSuffix(track),
      columnTrack: track,
    };
  }

  return { id: raw, initialColumns: 1 };
}

export function parseFolioMarker(line: string): ParsedFolioMarker | null {
  const match = line.match(FOLIO_MARKER_RE);
  if (!match) return null;
  return parseFolioBody(match[1].trim());
}

export function parseComplexFolio(line: string): ComplexFolioParseResult | null {
  const complex = line.match(COMPLEX_FOLIO_RE);
  if (complex) {
    const suffix = complex[2];
    return {
      id: suffix ? `${complex[1]}${suffix}` : complex[1],
      injectedColumns: suffix ? columnsFromTrackSuffix(suffix) : undefined,
    };
  }

  const parsed = parseFolioMarker(line);
  if (!parsed) return null;

  return {
    id: parsed.id,
    injectedColumns: parsed.initialColumns > 1 ? parsed.initialColumns : undefined,
  };
}
