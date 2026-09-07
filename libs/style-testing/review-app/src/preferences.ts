/**
 * The two choices the reviewer makes about the tool rather than about a render.
 *
 * Both follow the same rule: take the environment's answer unless the reviewer
 * has given one. A theme picked on this machine must survive a reload, and a
 * reviewer who has never touched the control must get what their system asks
 * for — including when it changes while the page is open.
 *
 * Kept out of the component because the first paint has to know them. Reading
 * a theme after the app renders is a flash of the wrong one.
 */
export type Locale = 'en' | 'fr';

/** `system` is not a third theme: it is the absence of a choice. */
export type ThemeChoice = 'system' | 'light' | 'dark';

const THEME_KEY = 'craft-review-theme';
const LOCALE_KEY = 'craft-review-locale';

const store = (): Storage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    // A browser told to block site data throws on the accessor itself.
    return undefined;
  }
};

const read = (key: string): string | undefined => {
  try {
    return store()?.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
};

const write = (key: string, value: string): void => {
  try {
    store()?.setItem(key, value);
  } catch {
    // A preference that cannot be remembered is still a preference for this
    // session; losing it must not take the click with it.
  }
};

export const isLocale = (value: unknown): value is Locale =>
  value === 'en' || value === 'fr';

export const isThemeChoice = (value: unknown): value is ThemeChoice =>
  value === 'system' || value === 'light' || value === 'dark';

/** The language to open in: the stored choice, else the browser's. */
export const initialLocale = (): Locale => {
  const stored = read(LOCALE_KEY);
  if (isLocale(stored)) return stored;
  const languages = globalThis.navigator?.languages ?? [
    globalThis.navigator?.language ?? 'en',
  ];
  return languages.some((tag) => tag?.toLowerCase().startsWith('fr'))
    ? 'fr'
    : 'en';
};

export const storeLocale = (locale: Locale): void => write(LOCALE_KEY, locale);

export const initialTheme = (): ThemeChoice => {
  const stored = read(THEME_KEY);
  return isThemeChoice(stored) ? stored : 'system';
};

export const storeTheme = (theme: ThemeChoice): void =>
  write(THEME_KEY, theme);

/**
 * Writes the choice where CSS can see it.
 *
 * `system` removes the attribute rather than resolving it to a value, so the
 * media query stays in charge and a machine that switches to dark at sunset
 * takes the page with it.
 */
export const applyTheme = (theme: ThemeChoice, root: HTMLElement): void => {
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
};

export const applyLocale = (locale: Locale, root: HTMLElement): void => {
  root.setAttribute('lang', locale);
};
