import { craftToken, type GetDeps } from '@craft-ng/core';

type StyleRoot = Document | ShadowRoot;

type StyleEntry = {
  refs: number;
  css: string;
  order: number;
  sheet?: CSSStyleSheet;
  element?: HTMLStyleElement;
};

const supportsAdoptedStyleSheets =
  typeof CSSStyleSheet === 'function' &&
  typeof Document !== 'undefined' &&
  'adoptedStyleSheets' in Document.prototype &&
  'replaceSync' in CSSStyleSheet.prototype;

export type CraftStyleRegistry = {
  acquire(root: StyleRoot, key: string, css: string, order: number): () => void;
};

export function createCraftStyleRegistry(): CraftStyleRegistry {
  const roots = new WeakMap<StyleRoot, Map<string, StyleEntry>>();

  function acquire(
    root: StyleRoot,
    key: string,
    css: string,
    order: number,
  ): () => void {
    let entries = roots.get(root);
    if (!entries) {
      entries = new Map();
      roots.set(root, entries);
    }

    const existing = entries.get(key);
    if (existing) {
      existing.refs += 1;
      return () => release(root, key, existing);
    }

    const entry: StyleEntry = { refs: 1, css, order };
    if (supportsAdoptedStyleSheets) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      entry.sheet = sheet;
    } else {
      const document = root instanceof Document ? root : root.ownerDocument;
      const element = document!.createElement('style');
      element.setAttribute('data-craft-sheet', key);
      element.textContent = css;
      if (root instanceof Document) {
        (root.head ?? root.documentElement).appendChild(element);
      } else {
        root.appendChild(element);
      }
      entry.element = element;
    }
    entries.set(key, entry);
    sync(root, entries);
    return () => release(root, key, entry);
  }

  function release(root: StyleRoot, key: string, entry: StyleEntry): void {
    if (entry.refs === 0) return;
    entry.refs -= 1;
    if (entry.refs > 0) return;

    entry.element?.remove();
    const entries = roots.get(root);
    entries?.delete(key);
    if (entries) sync(root, entries);
  }

  function sync(root: StyleRoot, entries: Map<string, StyleEntry>): void {
    if (!supportsAdoptedStyleSheets) {
      const parent =
        root instanceof Document ? (root.head ?? root.documentElement) : root;
      [...entries.values()]
        .sort((left, right) => left.order - right.order)
        .forEach((entry) => {
          if (entry.element) parent.appendChild(entry.element);
        });
      return;
    }
    const registered = new Set(
      [...entries.values()]
        .map((entry) => entry.sheet)
        .filter((sheet): sheet is CSSStyleSheet => Boolean(sheet)),
    );
    const current = [...root.adoptedStyleSheets].filter(
      (sheet) => !registered.has(sheet),
    );
    const craftSheets = [...entries.values()]
      .sort((left, right) => left.order - right.order)
      .map((entry) => entry.sheet)
      .filter((sheet): sheet is CSSStyleSheet => Boolean(sheet));
    root.adoptedStyleSheets = [...current, ...craftSheets];
  }

  return { acquire };
}

export const CRAFT_STYLE_REGISTRY =
  craftToken<CraftStyleRegistry>('CraftStyleRegistry');

export const ɵfallbackCraftStyleRegistry = createCraftStyleRegistry();

export type GenDeps_CraftStyleRegistry = GetDeps<{
  deps: {};
  provided: {};
}>;
