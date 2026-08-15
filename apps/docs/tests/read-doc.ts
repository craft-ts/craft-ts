import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const docsRoot = fileURLToPath(new URL('..', import.meta.url));
const SNIPPET_IMPORT = /^<<<\s+@\/([^\s#{]+)(?:#([^\s{#]+))?.*$/gm;
const REGION_LINE = /^\/\/ ?#?((?:end)?region) ([\w*-]+)$/;

const extractRegion = (source: string, regionName: string) => {
  const lines = source.split('\n');
  let start = -1;

  for (const [index, line] of lines.entries()) {
    const match = REGION_LINE.exec(line.trim());
    if (start < 0 && match?.[1] === 'region' && match[2] === regionName) {
      start = index + 1;
      continue;
    }
    if (start >= 0 && match?.[1] === 'endregion' && match[2] === regionName) {
      return lines.slice(start, index).join('\n');
    }
  }

  return null;
};

/** Read a markdown page and inline VitePress `<<<` snippet regions. */
export const readDoc = (fromTests: string): string => {
  const markdownPath = fileURLToPath(new URL(fromTests, import.meta.url));
  const markdown = readFileSync(markdownPath, 'utf8');

  return markdown.replace(
    SNIPPET_IMPORT,
    (all, file: string, region?: string) => {
      const abs = join(docsRoot, file);
      if (!existsSync(abs)) {
        return all;
      }

      const source = readFileSync(abs, 'utf8');
      if (!region) {
        return source;
      }

      return extractRegion(source, region) ?? all;
    },
  );
};
