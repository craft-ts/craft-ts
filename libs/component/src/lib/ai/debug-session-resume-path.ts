/**
 * The small JSONPath subset used by resume declarations: `$`, `.key`,
 * `["key"]`, `[0]` and `[*]`. Declarations are data sent to the dashboard, so
 * a path is a string, never a function.
 */
export type ResumePathSegment = string | number | '*';

export function parseResumePath(
  path: string,
): readonly ResumePathSegment[] | undefined {
  if (!path.startsWith('$')) return undefined;
  const segments: ResumePathSegment[] = [];
  let index = 1;
  while (index < path.length) {
    const character = path[index];
    if (character === '.') {
      const match = /^[A-Za-z_$][\w$-]*/.exec(path.slice(index + 1));
      if (!match) return undefined;
      segments.push(match[0]);
      index += 1 + match[0].length;
      continue;
    }
    if (character === '[') {
      const end = path.indexOf(']', index);
      if (end < 0) return undefined;
      const inner = path.slice(index + 1, end);
      if (inner === '*') segments.push('*');
      else if (/^\d+$/.test(inner)) segments.push(Number(inner));
      else {
        try {
          const key: unknown = JSON.parse(inner);
          if (typeof key !== 'string') return undefined;
          segments.push(key);
        } catch {
          return undefined;
        }
      }
      index = end + 1;
      continue;
    }
    return undefined;
  }
  return segments;
}

/** Every value the path reaches; `[*]` fans out over arrays and objects. */
export function readResumePath(value: unknown, path: string): unknown[] {
  const segments = parseResumePath(path);
  if (!segments) return [];
  let current: unknown[] = [value];
  for (const segment of segments) {
    current = current.flatMap((item) => {
      if (segment === '*') {
        if (Array.isArray(item)) return item;
        return isRecord(item) ? Object.values(item) : [];
      }
      if (typeof segment === 'number')
        return Array.isArray(item) && segment < item.length
          ? [item[segment]]
          : [];
      return isRecord(item) && Object.hasOwn(item, segment)
        ? [item[segment]]
        : [];
    });
  }
  return current;
}

/** The single value at a path without wildcard, if any. */
export function readResumePathValue(value: unknown, path: string): unknown {
  return readResumePath(value, path)[0];
}

/** Turns a JSON string, possibly encoded several times, back into data. */
export function decodeNestedJson(value: unknown, maxDepth = 3): unknown {
  let current = value;
  for (let depth = 0; depth < maxDepth && typeof current === 'string'; depth++) {
    try {
      current = JSON.parse(current) as unknown;
    } catch {
      break;
    }
  }
  return current;
}

/** Converts a reference path (`$.user.id`, `response.body.token`) to its segments without the root. */
export function resumePathKeys(path: string): readonly string[] {
  return path
    .replace(/^\$\.?/, '')
    .split(/[.[\]"']+/)
    .filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
