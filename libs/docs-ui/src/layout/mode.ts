import { craftComponent, type Input } from '@craft-ts/component';
import { craftExpose, craftService, state } from '@craft-ts/core';
import { DocIconButton } from '../button/button.ts';
import { MODE_STORAGE_KEY } from '../foundation/season.ts';

export type Mode = 'light' | 'dark';

const STORAGE_KEY = MODE_STORAGE_KEY;

const stored = (): Mode | undefined => {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : undefined;
  } catch {
    return undefined;
  }
};

/** What the page is showing right now: the document's `data-mode`, else the system's. */
const current = (): Mode => {
  if (typeof document === 'undefined') return 'light';
  const forced = document.documentElement.getAttribute('data-mode');
  if (forced === 'light' || forced === 'dark') return forced;
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
};

/** Writes the choice where the page and the next visit can see it. */
const apply = (next: Mode): Mode => {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-mode', next);
  }
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, next);
  } catch {
    // Refused storage: the choice lasts for this visit only.
  }
  return next;
};

/**
 * The appearance of the page: light or dark, written as `data-mode` on the
 * document root — the attribute the foundation's rules answer — and remembered
 * across visits. The first visit follows the system; the first press makes the
 * choice explicit. Storage is a browser boundary and may be refused: then the
 * choice simply lasts until the page is closed.
 */
export const { DocModeView, provideDocModeView } = craftService(
  { name: 'docModeView', providedIn: 'toProvide' },
  function* () {
    const initial = stored() ?? current();
    if (typeof document !== 'undefined' && stored()) {
      document.documentElement.setAttribute('data-mode', initial);
    }
    const mode = yield* state('mode', initial as Mode, ({ update }) => ({
      choose: (next: Mode) => update(() => apply(next)),
      toggle: () => update((value) => apply(value === 'dark' ? 'light' : 'dark')),
    }));
    yield* craftExpose('toggle', mode.toggle);
    yield* craftExpose('choose', mode.choose);
  },
);

export interface ModeToggleInput {
  readonly label: Input<string>;
}

/**
 * The button that switches the appearance. Its glyph shows where it goes — the
 * moon in light, the sun in dark — and its name says the same in words.
 */
export const DocModeToggle = craftComponent('DocModeToggle', {}, function* (
  props: ModeToggleInput,
) {
  const view = yield* DocModeView();
  return DocIconButton({
    label: props.label,
    icon: function* () {
      return (yield* view.mode()) === 'dark' ? ('sun' as const) : ('moon' as const);
    },
    disabled: function* () {
      return false;
    },
    press: (() => view.toggle()) as never,
  });
});
