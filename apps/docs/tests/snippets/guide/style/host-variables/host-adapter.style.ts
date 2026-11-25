// #region adapter
import {
  craftGlobalStyles,
  cssVars,
  defineVarTokens,
  kind,
  palette,
  set,
} from '@craft-ts/style';

const themed = { inherits: true } as const;

/**
 * The contract the views read, owned by this project: registered with
 * `@property`, typed, and the only thing a view imports.
 */
export const hostTheme = cssVars('hostTheme', {
  accent: kind.color(palette.accent.info, themed),
  surface: kind.color(palette.surface.raised, themed),
});

/**
 * What the host page owns: `--host-accent` and `--host-surface-1`. Read here
 * and nowhere else — `defineVarTokens` registers nothing and emits no
 * `@property`, so the host keeps its own registration.
 */
const page = defineVarTokens('host', {
  accent: kind.color(palette.accent.info),
  'surface-1': kind.color(palette.surface.raised),
}).tokens;

// Fill the contract from the host's variables, on `:root`.
craftGlobalStyles('hostAdapter', {
  root: [
    set(hostTheme.accent, page.accent),
    set(hostTheme.surface, page['surface-1']),
  ],
});
// #endregion adapter
