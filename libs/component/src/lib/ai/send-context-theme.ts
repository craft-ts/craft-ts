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
  readonly light?: SendContextColors;
  readonly dark?: SendContextColors;
}

/** Apply on the theme roots, where the built-in palette is declared. */
export function applySendContextTheme(
  host: HTMLElement,
  theme: SendContextTheme | undefined,
): () => void {
  if (!theme) return () => undefined;
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  const update = () => {
    const colors = { ...theme.light, ...(media?.matches ? theme.dark : {}) };
    for (const root of Array.from(host.getElementsByClassName(aiTheme.root))) {
      if (!(root instanceof HTMLElement)) continue;
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
  update();
  media?.addEventListener('change', update);
  return () => media?.removeEventListener('change', update);
}
