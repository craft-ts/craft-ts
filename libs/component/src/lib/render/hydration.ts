export type HydrationMismatchReason =
  | 'element-absent'
  | 'tag-mismatch'
  | 'text-absent'
  | 'text-mismatch'
  | 'boundary-absent';

export class HydrationMismatchError extends Error {
  readonly key: string;
  readonly expected: string;
  readonly actual: string | null;
  readonly reason: HydrationMismatchReason;
  readonly actualNode: Node | null;

  constructor(
    options: Readonly<{
      key: string;
      expected: string;
      actual: string | null;
      reason: HydrationMismatchReason;
      actualNode?: Node | null;
    }>,
  ) {
    super(
      `Craft hydration mismatch at "${options.key}": expected ${options.expected}, received ${options.actual ?? 'nothing'} (${options.reason}).`,
    );
    this.name = 'HydrationMismatchError';
    this.key = options.key;
    this.expected = options.expected;
    this.actual = options.actual;
    this.reason = options.reason;
    this.actualNode = options.actualNode ?? null;
  }
}

export type HydrationCursor = Readonly<{
  claimElement(key: string, tag: string): Element;
  claimText(key: string, expected?: string): Text;
  claimBoundary(key: string, label: string): Comment;
  recordMismatch(error: HydrationMismatchError): void;
  finish(): void;
}>;

type TextClaim = Readonly<{
  text: Text;
  start: Comment;
  end: Comment;
}>;

export function createHydrationCursor(
  host: Element,
  onMismatch?: (error: HydrationMismatchError) => void,
): HydrationCursor {
  const elements = new Map<string, Element>();
  const boundaries = new Map<string, Comment>();
  const text = new Map<string, TextClaim>();
  const claimed = new Set<Node>();
  const mismatches: HydrationMismatchError[] = [];

  for (const element of host.querySelectorAll<Element>('[data-craft-hk]')) {
    const key = element.getAttribute('data-craft-hk');
    if (key) elements.set(key, element);
  }

  walkComments(host, (comment) => {
    const marker = parseMarker(comment.data);
    if (!marker) return;
    if (marker.label === 'craft-text:start') {
      const end = nextComment(
        comment.nextSibling,
        'craft-text:end',
        marker.key,
      );
      if (!end) return;
      let value = comment.nextSibling;
      if (value === end) {
        value = host.ownerDocument.createTextNode('');
        end.parentNode?.insertBefore(value, end);
      }
      if (value?.nodeType === Node.TEXT_NODE) {
        text.set(marker.key, {
          text: value as Text,
          start: comment,
          end,
        });
      }
      return;
    }
    if (marker.label !== 'craft-text:end') {
      boundaries.set(boundaryAddress(marker.key, marker.label), comment);
    }
  });

  const cursor: HydrationCursor = {
    claimElement(key, tag) {
      const element = elements.get(key);
      if (!element) {
        throw new HydrationMismatchError({
          key,
          expected: `<${tag}>`,
          actual: null,
          reason: 'element-absent',
        });
      }
      if (element.tagName.toLowerCase() !== tag.toLowerCase()) {
        throw new HydrationMismatchError({
          key,
          expected: `<${tag}>`,
          actual: `<${element.tagName.toLowerCase()}>`,
          reason: 'tag-mismatch',
          actualNode: element,
        });
      }
      claimed.add(element);
      return element;
    },
    claimText(key, expected) {
      const entry = text.get(key);
      if (!entry) {
        throw new HydrationMismatchError({
          key,
          expected: expected === undefined ? 'text' : JSON.stringify(expected),
          actual: null,
          reason: 'text-absent',
        });
      }
      if (expected !== undefined && entry.text.nodeValue !== expected) {
        throw new HydrationMismatchError({
          key,
          expected: JSON.stringify(expected),
          actual: JSON.stringify(entry.text.nodeValue),
          reason: 'text-mismatch',
          actualNode: entry.text,
        });
      }
      claimed.add(entry.text);
      claimed.add(entry.start);
      claimed.add(entry.end);
      return entry.text;
    },
    claimBoundary(key, label) {
      const comment = boundaries.get(boundaryAddress(key, label));
      if (!comment) {
        throw new HydrationMismatchError({
          key,
          expected: `<!--${label}-->`,
          actual: null,
          reason: 'boundary-absent',
        });
      }
      claimed.add(comment);
      return comment;
    },
    recordMismatch(error) {
      mismatches.push(error);
      onMismatch?.(error);
    },
    finish() {
      for (const entry of text.values()) {
        if (claimed.has(entry.text)) {
          entry.start.remove();
          entry.end.remove();
        } else {
          entry.start.remove();
          entry.text.remove();
          entry.end.remove();
        }
      }
      for (const element of elements.values()) {
        if (!claimed.has(element) && element.parentNode) element.remove();
      }
      for (const comment of boundaries.values()) {
        if (!claimed.has(comment) && comment.parentNode) comment.remove();
      }
      if (mismatches.length > 0 && isDevelopment()) {
        console.warn(
          `Craft hydrated with ${mismatches.length} local remount${mismatches.length === 1 ? '' : 's'}.`,
          mismatches,
        );
      }
    },
  };

  return cursor;
}

function walkComments(parent: Node, visit: (comment: Comment) => void): void {
  for (const child of [...parent.childNodes]) {
    if (child.nodeType === Node.COMMENT_NODE) visit(child as Comment);
    walkComments(child, visit);
  }
}

function nextComment(
  node: Node | null,
  label: string,
  key: string,
): Comment | null {
  let current = node;
  while (current) {
    if (current.nodeType === Node.COMMENT_NODE) {
      const marker = parseMarker((current as Comment).data);
      if (marker?.label === label && marker.key === key) {
        return current as Comment;
      }
    }
    current = current.nextSibling;
  }
  return null;
}

function parseMarker(value: string): { label: string; key: string } | null {
  const separator = value.lastIndexOf('|hk:');
  if (separator === -1) return null;
  return {
    label: value.slice(0, separator),
    key: value.slice(separator + 4),
  };
}

function boundaryAddress(key: string, label: string): string {
  return `${key}\u0000${label}`;
}

function isDevelopment(): boolean {
  const processRef = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process;
  return (
    processRef === undefined || processRef.env?.['NODE_ENV'] !== 'production'
  );
}
