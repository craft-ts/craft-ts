/**
 * `<<< @/path/file.ts#region{2-5}`: the VitePress code import, resolved at
 * build time. Pure functions only; reading the file is the parser's job.
 */
export interface SnippetDirective {
  readonly path: string;
  readonly region?: string;
  readonly highlight: readonly number[];
  readonly language?: string;
  readonly title?: string;
}

const DIRECTIVE =
  /^<<<\s+([^\s#{]+)(?:#([\w-]+))?(?:\{([^}]*)\})?(?:\s+([\w-]+))?(?:\s+\[(.*)\])?\s*$/;

/** `1,3-5` → `[1, 3, 4, 5]`. Anything that is not a number is ignored. */
export const parseLineRanges = (spec: string | undefined): number[] => {
  if (!spec) return [];
  const lines: number[] = [];
  for (const part of spec.split(',')) {
    const [from, to] = part.trim().split('-').map(Number);
    if (from === undefined || Number.isNaN(from)) continue;
    const last = to === undefined || Number.isNaN(to) ? from : to;
    for (let line = from; line <= last; line += 1) lines.push(line);
  }
  return lines;
};

export const parseSnippetDirective = (
  line: string,
): SnippetDirective | undefined => {
  const match = DIRECTIVE.exec(line.trim());
  if (!match) return undefined;
  const [, path, region, ranges, language, title] = match;
  return {
    path: path as string,
    ...(region ? { region } : {}),
    highlight: parseLineRanges(ranges),
    ...(language ? { language } : {}),
    ...(title ? { title } : {}),
  };
};

const REGION_START = /^\s*(?:\/\/|#|<!--|\/\*)\s*#region\s+([\w-]+)/;
const REGION_END = /^\s*(?:\/\/|#|<!--|\/\*)\s*#endregion(?:\s+([\w-]+))?/;
const ANY_REGION_MARKER = /^\s*(?:\/\/|#|<!--|\/\*)\s*#(?:end)?region\b/;

export interface ExtractedSnippet {
  readonly lines: readonly string[];
  /** 1-based line number, in the file, of the first extracted line. */
  readonly firstLine: number;
  readonly found: boolean;
}

/**
 * The lines of `source` inside `#region name … #endregion name`, without the
 * markers. With no region, the whole file minus any region markers.
 */
export const extractRegion = (
  source: string,
  region?: string,
): ExtractedSnippet => {
  const all = source.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  if (!region) {
    return {
      lines: all.filter((line) => !ANY_REGION_MARKER.test(line)),
      firstLine: 1,
      found: true,
    };
  }
  const start = all.findIndex(
    (line) => REGION_START.exec(line)?.[1] === region,
  );
  if (start < 0) return { lines: [], firstLine: 1, found: false };
  let depth = 0;
  const lines: string[] = [];
  for (let index = start + 1; index < all.length; index += 1) {
    const line = all[index] as string;
    if (REGION_START.test(line)) {
      depth += 1;
      continue;
    }
    const end = REGION_END.exec(line);
    if (end) {
      if (depth === 0 && (!end[1] || end[1] === region)) break;
      depth = Math.max(0, depth - 1);
      continue;
    }
    lines.push(line);
  }
  return { lines, firstLine: start + 2, found: true };
};
