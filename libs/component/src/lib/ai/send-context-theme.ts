import { ai, aiTheme } from './ai-overlay.style';

/** CSS colours, application CSS variables, or typed Craft style colour tokens. */
type ThemeColor = string | { readonly css: string };
export type SendContextColors = Partial<
  Record<
    Exclude<keyof typeof ai, 'launcher-right' | 'launcher-bottom'>,
    ThemeColor
  >
>;

/** Partial palettes; omitted colours keep the built-in defaults. */
export interface SendContextTheme {
  /** Colour mode used by the built-in palette. `document` follows `data-mode` when present. */
  readonly colorScheme?: 'document' | 'system' | 'light' | 'dark';
  readonly light?: SendContextColors;
  readonly dark?: SendContextColors;
}

/** Apply on the theme roots, where the built-in palette is declared. */
export function applySendContextTheme(
  host: HTMLElement,
  theme: SendContextTheme | undefined,
): () => void {
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  const mode = theme?.colorScheme ?? 'document';

  function prefersDark(): boolean {
    if (mode === 'dark') return true;
    if (mode === 'light') return false;
    if (mode === 'document') {
      const documentMode = document.documentElement.getAttribute('data-mode');
      if (documentMode === 'dark') return true;
      if (documentMode === 'light') return false;
    }
    return media?.matches ?? false;
  }

  const update = () => {
    const dark = prefersDark();
    const colors = { ...theme?.light, ...(dark ? theme?.dark : {}) };
    for (const root of Array.from(host.getElementsByClassName(aiTheme.root))) {
      if (!(root instanceof HTMLElement)) continue;
      if (mode === 'system') {
        root.removeAttribute('data-craftAiScheme');
      } else {
        const documentMode = document.documentElement.getAttribute('data-mode');
        if (
          mode === 'document' &&
          documentMode !== 'dark' &&
          documentMode !== 'light'
        ) {
          root.removeAttribute('data-craftAiScheme');
        } else {
          root.setAttribute(
            'data-craftAiScheme',
            mode === 'document' ? documentMode! : dark ? 'dark' : 'light',
          );
        }
      }
      for (const key of Object.keys(ai) as (keyof typeof ai)[]) {
        if (key === 'launcher-right' || key === 'launcher-bottom') continue;
        const color = colors[key];
        if (color === undefined)
          root.style.removeProperty(ai[key].declaration.name);
        else
          root.style.setProperty(
            ai[key].declaration.name,
            typeof color === 'string' ? color : color.css,
          );
      }
    }
  };
  const observer =
    typeof MutationObserver === 'undefined'
      ? undefined
      : new MutationObserver(update);
  update();
  if (mode === 'system' || mode === 'document') {
    media?.addEventListener('change', update);
  }
  if (mode === 'document') {
    observer?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-mode'],
    });
  }
  return () => {
    observer?.disconnect();
    media?.removeEventListener('change', update);
  };
}
