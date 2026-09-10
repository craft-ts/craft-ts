/**
 * A group of nodes the reason points at, and the token that stands for it.
 *
 * One reason usually carries more than one complaint — this row is misaligned,
 * and further down that button is cut — so the reference has to live *inside*
 * the sentence it belongs to rather than beside the whole text. The token is
 * plain text in the textarea, which makes the reason the only thing that has
 * to survive: deleting a token deletes its reference, with no second list to
 * keep in step.
 */
export interface Mention {
  readonly id: number;
  readonly paths: readonly string[];
}

export const mentionToken = (id: number, count: number): string =>
  `[#${id}: ${count} node${count === 1 ? '' : 's'}]`;

/**
 * The reason field is a `contenteditable`, not a `textarea`.
 *
 * A textarea cannot hold anything but characters, so a reference in it could
 * only ever be the literal `[#1: 2 nodes]` — legible, but no more than that: no
 * way to see which nodes it means without leaving the sentence and reading a
 * list beside it. As an element, the reference is a chip that says what it
 * points at on hover, and the list beside the field stops being needed.
 *
 * The plain text is still the model. Everything downstream — the prose, which
 * groups are live, which sentence each one carries — reads the serialised
 * string, so the chips are a rendering of the reason and never a second
 * version of it.
 */
export const MENTION_ID = 'data-mention-id';

export const describePaths = (paths: readonly string[]): string =>
  paths.length > 6
    ? `${paths.slice(0, 6).join(' · ')} · +${paths.length - 6} more`
    : paths.join(' · ');

/** Re-labels a reference in place, so refining a selection edits it. */
export const relabelChip = (
  chip: HTMLElement,
  paths: readonly string[],
): void => {
  chip.setAttribute('data-count', String(paths.length));
  chip.setAttribute('data-paths', describePaths(paths));
  chip.textContent = mentionToken(
    Number(chip.getAttribute(MENTION_ID) ?? 0),
    paths.length,
  );
};

export const chipFor = (
  document: Document,
  id: number,
  paths: readonly string[],
): HTMLElement => {
  const chip = document.createElement('span');
  chip.className = 'mention-chip';
  chip.setAttribute(MENTION_ID, String(id));
  chip.setAttribute('data-count', String(paths.length));
  // Not `title`: a native tooltip waits a second, cannot be styled, and would
  // sit on top of the one drawn here.
  chip.setAttribute('data-paths', describePaths(paths));
  // Atomic: the caret steps over it and a backspace removes the whole
  // reference, which is what deleting a reference should mean.
  chip.contentEditable = 'false';
  chip.textContent = mentionToken(id, paths.length);
  return chip;
};

/** The field, as the plain text every rule downstream is written against. */
export const textOf = (field: HTMLElement): string => {
  let text = '';
  const walk = (node: Node): void => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent ?? '';
        continue;
      }
      if (!(child instanceof HTMLElement)) continue;
      if (child.hasAttribute(MENTION_ID)) {
        text += child.textContent ?? '';
        continue;
      }
      if (child.tagName === 'BR') {
        text += '\n';
        continue;
      }
      // A browser wraps new lines in `div`s of its own making.
      if (text && !text.endsWith('\n')) text += '\n';
      walk(child);
    }
  };
  walk(field);
  return text;
};

export const ANY_MENTION = /\[#\d+: \d+ nodes?\]/g;

export const mentionPattern = (id: number): RegExp =>
  new RegExp(`\\[#${id}: \\d+ nodes?\\]`);

/** The prose of a reason, with the reference tokens taken back out. */
export const proseOf = (text: string): string =>
  text
    .replace(ANY_MENTION, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();

/**
 * What a reference carries: everything written since the previous one.
 *
 * The first rule tried was "the sentence the token stands in", and it was
 * wrong for the way people actually write. A reviewer types the complaint,
 * ends it, and *then* points at the group — so the caret is past the full stop
 * and the token opens the next sentence rather than closing its own.
 *
 * Position, not punctuation, settles it: each reference takes the text between
 * the reference before it and itself. Referencing first and explaining after
 * reads the other way round, so a group with nothing before it takes what
 * follows instead.
 */
export const MENTION_WITH_ID = /\[#(\d+): \d+ nodes?\]/g;

export const noteForMention = (text: string, id: number): string => {
  const tokens = [...text.matchAll(MENTION_WITH_ID)];
  const at = tokens.findIndex((token) => Number(token[1]) === id);
  const self = tokens[at];
  if (at < 0 || !self || self.index === undefined) return proseOf(text);

  const previous = tokens[at - 1];
  const from =
    previous && previous.index !== undefined
      ? previous.index + previous[0].length
      : 0;
  const before = proseOf(text.slice(from, self.index));
  if (before) return before;

  const next = tokens[at + 1];
  const to = next?.index ?? text.length;
  return proseOf(text.slice(self.index + self[0].length, to)) || proseOf(text);
};

export const eventValue = (event: Event): string => {
  const target = event.target;
  return target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
    ? target.value
    : '';
};
