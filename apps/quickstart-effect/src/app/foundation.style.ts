/**
 * The quickstart's whole styling: a palette, the page theme on the document,
 * and the one class the task page uses.
 *
 * The reset and the good defaults (focus ring, reduced motion, colour scheme)
 * come from craft-ts itself — see `craftStyle()` in `vite.config.ts`.
 */
import {
  color,
  craftGlobalStyles,
  craftStyles,
  darkOf,
  definePalette,
  fontFamily,
  fontWeight,
  bg,
  minHeight,
  num,
  scheme,
  systemFontStack,
  unit,
  when,
} from '@craft-ts/style';

export const quickstartUi = definePalette('quickstartUi', {
  surface: { page: { light: '#f8fafc', dark: '#0f172a' } },
  text: {
    strong: { light: '#1e293b', dark: '#e2e8f0' },
    danger: { light: '#b91c1c', dark: '#fca5a5' },
  },
});

craftGlobalStyles('quickstart', {
  elements: {
    html: [minHeight(unit.pct(100))],
    body: [
      minHeight(unit.pct(100)),
      fontFamily(systemFontStack(['ui-sans-serif', 'system-ui'], 'sans-serif')),
      bg(quickstartUi.surface.page),
      color(quickstartUi.text.strong),
      when(scheme.dark, [
        bg(darkOf(quickstartUi.surface.page)),
        color(darkOf(quickstartUi.text.strong)),
      ]),
    ],
  },
});

export const taskPage = craftStyles('quickstartTask', {
  error: [
    fontWeight(num(600)),
    color(quickstartUi.text.danger),
    when(scheme.dark, [color(darkOf(quickstartUi.text.danger))]),
  ],
});
