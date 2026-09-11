/**
 * The contrast proof, on the real design system rather than on a fixture.
 *
 * This is the witness the plan asks for: the sheets in this folder are the
 * ones the demo renders, the dump is the one the build plugin writes, and the
 * verdicts below come out of the same solver `craft-graph --style-contrast`
 * runs in CI. Nothing here opens a browser.
 *
 * The most valuable case in the file is the deliberately broken one at the
 * bottom. A check that has only ever been seen to pass has not been shown to
 * work; the falsification case puts a hover colour with a real 1.81:1 ratio
 * into a sheet and asserts that the report names *that* tone, in *that*
 * state, with *those* two tokens. If the analysis ever silently stops
 * enumerating the hover axis, that is the case that goes red.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  craftStyles,
  cssVars,
  color,
  backgroundImage,
  bg,
  darkOf,
  font,
  fontWeight,
  interaction,
  kind,
  num,
  registeredAtoms,
  registeredClasses,
  registeredVars,
  set,
  text,
  url,
  when,
} from '@craft-ts/style';
import { styleDump } from '@craft-ts/style/vite';
import {
  analyzeTextContrast,
  mergeStyleDump,
  paletteContrastMatrix,
  type DependencyGraph,
  type ResolvedTextContrast,
  type TextContrastResult,
} from '@craft-ts/dev-tools';
import { tone, ui } from './foundation.style.ts';
import './components.style.ts';

/* ------------------------------------------------------------------------ *
 * The graph, written by hand
 * ------------------------------------------------------------------------ */

/**
 * The element tree the demo renders, spelled out rather than extracted.
 *
 * `craft-graph --style-contrast` builds this half from the TypeScript program
 * — that path is covered in `style-contrast-report.spec.ts`. Reproducing it
 * here would need the whole demo in a ts-morph project for every case, and
 * would make a failure ambiguous between the extraction and the styles. What
 * this file is for is the *styles*.
 */
const element = (
  id: string,
  label: string,
  component: string,
  classes: readonly string[],
  extra: { parent?: string; text?: boolean } = {},
) => ({ id, label, component, classes, ...extra });

type Element = ReturnType<typeof element>;

function graphOf(elements: readonly Element[]): DependencyGraph {
  const components = [...new Set(elements.map((entry) => entry.component))];
  return {
    version: 1,
    rootDir: '/repo',
    tsConfigFilePath: '/repo/tsconfig.json',
    nodes: [
      ...components.map((name) => ({
        id: `c:${name}`,
        kind: 'component' as const,
        label: name,
      })),
      ...elements.map((entry) => ({
        id: entry.id,
        kind: 'styled-element' as const,
        label: entry.label,
        details: {
          component: entry.component,
          componentId: `c:${entry.component}`,
          classKeys: entry.classes,
          mayContainText: entry.text === true,
          textKind: entry.text ? 'static' : 'none',
          branch: '',
        },
      })),
    ],
    edges: elements.map((entry) => ({
      from: entry.parent ?? `c:${entry.component}`,
      to: entry.id,
      kind: 'contains' as const,
      evidence: 'ast' as const,
    })),
  };
}

const dump = () => styleDump(registeredClasses(), registeredAtoms(), registeredVars());

const analyse = (elements: readonly Element[]) => {
  const styles = dump();
  return analyzeTextContrast(mergeStyleDump(graphOf(elements), styles), styles);
};

const resolved = (results: readonly TextContrastResult[]) =>
  results.filter(
    (result): result is ResolvedTextContrast => result.kind === 'resolved',
  );

/**
 * Finds a scenario by name, folded rows included.
 *
 * The solver merges scenarios that produce the same answer and keeps one as
 * the row's name, so `tone=warning` may well be listed under
 * `scheme=dark+tone=warning` — same two colours, the theme changed nothing.
 * A plain `find` on the id would miss it and read as a missing scenario.
 */
const scenarioNamed = (
  results: readonly ResolvedTextContrast[],
  id: string,
  element?: string,
) =>
  results.find(
    (result) =>
      (element === undefined || result.element === element) &&
      (result.scenario.id === id || result.equivalentScenarios.includes(id)),
  );

/* ------------------------------------------------------------------------ *
 * The button, in every state it has
 * ------------------------------------------------------------------------ */

/**
 * The theme wrapper plus a button inside it.
 *
 * The wrapper matters: `dsTheme-root` is what paints the page and what writes
 * the inheriting theme variables, so a button judged without it has no
 * background at all. That is the render-context half of the analysis, and the
 * shape every real page has.
 */
const BUTTON_PAGE: readonly Element[] = [
  element('e:theme', 'div.theme', 'Page', ['dsTheme-root']),
  element('e:surface', 'div.surface', 'Page', ['dsCard-root'], {
    parent: 'e:theme',
  }),
  element('e:button', 'button.dsButton', 'DsButton', ['dsButton-root'], {
    parent: 'e:surface',
    text: true,
  }),
];

describe('the button, every tone and every state', () => {
  const results = () => resolved(analyse(BUTTON_PAGE));

  const at = (id: string) => scenarioNamed(results(), id);

  it('reaches every tone, size and hover combination', () => {
    // The button's own matrix is 36; sizes that do not change a colour fold
    // together, so the distinct contrast answers are fewer. What is checked
    // here is that no combination was skipped, which is the failure mode of
    // an enumeration that quietly drops an axis.
    const covered = new Set(
      results().flatMap((result) => [
        result.scenario.id,
        ...result.equivalentScenarios,
      ]),
    );
    for (const name of ['neutral', 'info', 'success', 'warning', 'danger']) {
      expect(covered.has(`tone=${name}`), `tone=${name} at rest`).toBe(true);
      expect(
        covered.has(`interaction.hover=active+tone=${name}`),
        `tone=${name} hovered`,
      ).toBe(true);
    }
  });

  it('passes every tone at rest', () => {
    for (const name of ['neutral', 'info', 'success', 'warning', 'danger']) {
      expect(at(`tone=${name}`)?.verdict, name).toBe('pass');
    }
  });

  it('passes every tone under the pointer', () => {
    // The five hover tokens added to the palette, measured rather than
    // eyeballed: each is darker than its resting fill, so each ratio is
    // higher. Nothing about "a bit darker" guarantees that, which is why the
    // hovered fills are tokens and not a function.
    for (const name of ['neutral', 'info', 'success', 'warning', 'danger']) {
      const rest = at(`tone=${name}`);
      const hovered = at(`interaction.hover=active+tone=${name}`);
      expect(hovered?.verdict, name).toBe('pass');
      expect(hovered?.ratio ?? 0, name).toBeGreaterThan(rest?.ratio ?? 0);
    }
  });

  it('names the token on both sides, not just the hexadecimal', () => {
    const warning = at('interaction.hover=active+tone=warning');
    expect(warning?.background.token).toBe('ui.accent.warningHover');
    expect(warning?.background.value).toBe('#684400');
    // The foreground reaches the button through the variable, so the report
    // shows the chain rather than only the endpoint.
    expect(warning?.foreground.source).toContain('--dsButton-ink');
  });
});

/* ------------------------------------------------------------------------ *
 * Inheritance, thresholds, and the things that cannot be proven
 * ------------------------------------------------------------------------ */

const CARD_PAGE: readonly Element[] = [
  element('e:theme', 'div.theme', 'Page', ['dsTheme-root']),
  element('e:card', 'div.card', 'Page', ['dsCard-root'], { parent: 'e:theme' }),
  element('e:title', 'h2.title', 'Page', ['dsCard-title'], {
    parent: 'e:card',
    text: true,
  }),
  element('e:body', 'p.body', 'Page', ['dsCard-body'], {
    parent: 'e:card',
    text: true,
  }),
];

describe('the card', () => {
  const results = () => resolved(analyse(CARD_PAGE));
  const body = () => results().find((result) => result.element === 'p.body');
  const title = () => results().find((result) => result.element === 'h2.title');

  it('takes the body background from the card, one level up', () => {
    // `dsCard-body` sets a colour and no background. The proof the plan asks
    // for: the text is `theme.inkMuted` and the surface behind it is the
    // card's `theme.raised`, resolved through the ancestor.
    expect(body()?.background.source).toContain('dsCard-root');
    expect(body()?.foreground.value).toBe('#5b6472');
    expect(body()?.background.value).toBe('#ffffff');
    expect(body()?.verdict).toBe('pass');
  });

  it('keeps the 18px bold title on the normal threshold, by half a pixel', () => {
    // `text.lg` is 1.125rem — 18px — and bold reaches the large threshold at
    // 18.5px. So this title is *normal* text and needs 4.5:1, which is the
    // kind of fact nobody gets right by eye and the reason the threshold is
    // computed rather than chosen per component.
    expect(title()).toMatchObject({
      fontSizePx: 18,
      fontWeight: 700,
      textScale: 'normal',
      required: 4.5,
    });
    expect(body()).toMatchObject({
      fontSizePx: 14,
      textScale: 'normal',
      required: 4.5,
    });
  });

  it('gives 22px bold the large threshold', () => {
    // `text.xl` at weight 700 clears 18.5px, so the same pair of colours is
    // judged at 3:1 here and at 4.5:1 on the title above.
    const display = resolved(
      analyse([
        element('e:card', 'div.card', 'Page', ['dsCard-root']),
        element('e:display', 'h1.display', 'Page', ['dsDisplay-root'], {
          parent: 'e:card',
          text: true,
        }),
      ]),
    )[0];
    expect(display).toMatchObject({
      fontSizePx: 22,
      fontWeight: 700,
      textScale: 'large',
      required: 3,
    });
  });

  it('re-judges the same card in dark mode', () => {
    const dark = results().filter((result) =>
      result.scenario.id.includes('scheme=dark'),
    );
    expect(dark.length).toBeGreaterThan(0);
    for (const result of dark) expect(result.verdict).toBe('pass');
  });
});

describe('what the demo cannot prove', () => {
  it('never calls an image background valid', () => {
    // Registered in the isolated sheet below rather than in the design
    // system: the point is what the analysis says about a background outside
    // its model, not that the demo has one.
    // `bg` is unused in that sheet — the surface paints an image and nothing
    // else, which is precisely the case with no answer.
    const results = analyse([
      element('e:hero', 'div.hero', 'Hero', ['dsGradient-root']),
      element('e:text', 'h1.title', 'Hero', ['dsGradient-title'], {
        parent: 'e:hero',
        text: true,
      }),
    ]);
    expect(results).toMatchObject([
      { kind: 'indeterminate', reason: 'unsupported-background' },
    ]);
    expect(results.some((result) => result.kind === 'resolved')).toBe(false);
  });
});

/* ------------------------------------------------------------------------ *
 * Falsification
 * ------------------------------------------------------------------------ */

describe('a hover colour that is not readable', () => {
  it('is named exactly: the tone, the state, and both tokens', () => {
    const results = resolved(
      analyse([
        element('e:theme', 'div.theme', 'Page', ['dsTheme-root']),
        element('e:bad', 'button.bad', 'BadButton', ['dsBadButton-root'], {
          parent: 'e:theme',
          text: true,
        }),
      ]),
    );
    const rest = scenarioNamed(results, 'tone=warning');
    const hovered = scenarioNamed(
      results,
      'interaction.hover=active+tone=warning',
    );

    // Readable at rest, unreadable under the pointer. This is the exact bug
    // the hover axis was added to catch, and the resting row passing is what
    // makes it invisible to everything else.
    expect(rest?.verdict).toBe('pass');
    expect(hovered?.verdict).toBe('fail');
    expect(hovered?.ratio).toBeCloseTo(1.814, 2);
    expect(hovered?.required).toBe(4.5);
    expect(hovered?.background.token).toBe('ui.accent.warning.dark');
    expect(hovered?.foreground.token).toBe('ui.text.onAccent');
  });
});

/* ------------------------------------------------------------------------ *
 * The informative table
 * ------------------------------------------------------------------------ */

describe('the palette matrix beside the usage proof', () => {
  const matrix = () =>
    paletteContrastMatrix(dump(), { usages: analyse(BUTTON_PAGE) });

  it('names the element that renders a pair, not the sheet that mentions it', () => {
    const onWarningHover = matrix().find(
      (pair) =>
        pair.foreground === 'ui.text.onAccent' &&
        pair.background === 'ui.accent.warningHover',
    );
    expect(onWarningHover?.light.normalText).toBe('pass');
    expect(onWarningHover?.usedBy).toEqual(['DsButton/button.dsButton']);
  });

  it('keeps a pair nobody renders out of the blocking half', () => {
    // `ui.text.onAccent` over `ui.surface.page` is white on white in light
    // mode — a real pair of the palette, and one no element renders. The
    // matrix lists it and reports it as used nowhere; `analyzeTextContrast`
    // never mentions it at all. That gap is the difference between a table
    // and a gate, and it is why the table does not fail a build.
    const impossible = matrix().find(
      (pair) =>
        pair.foreground === 'ui.text.onAccent' &&
        pair.background === 'ui.surface.page',
    );
    expect(impossible?.light.normalText).toBe('fail');
    expect(impossible?.usedBy).toEqual([]);
    expect(
      analyse(BUTTON_PAGE).some(
        (result) =>
          result.kind === 'resolved' &&
          result.background.token === 'ui.surface.page',
      ),
    ).toBe(false);
  });
});

/* ------------------------------------------------------------------------ *
 * Sheets registered for this file only
 * ------------------------------------------------------------------------ */

beforeAll(() => {
  const gradientVars = cssVars('dsGradient', {
    ink: kind.color(ui.text.onAccent),
  });
  craftStyles('dsGradient', {
    // A photographic hero. There is no single colour behind the text, so
    // there is no ratio — and inventing one (compositing over the page, say)
    // would be the only way to produce a `pass` here, on text that may be
    // white on white for half the image.
    root: [backgroundImage(url('/hero.jpg'))],
    title: [font(text.lg), fontWeight(num(700)), color(gradientVars.ink)],
  });

  // 22px bold — the other side of the 18.5px boundary the card title sits on.
  craftStyles('dsDisplay', {
    root: [font(text.xl), fontWeight(num(700)), color(ui.text.strong)],
  });

  const badVars = cssVars('dsBadButton', {
    bg: kind.color(ui.accent.neutral),
    ink: kind.color(ui.text.onAccent),
  });
  craftStyles(
    'dsBadButton',
    {
      root: [
        font(text.sm),
        fontWeight(num(600)),
        bg(badVars.bg),
        color(badVars.ink),
        when(tone.warning, [
          set(badVars.bg, ui.accent.warning),
          // The mistake, written the way it is normally written: the hovered
          // fill reaches for the *dark* side of the token, which is lighter,
          // and white text on it is 1.81:1.
          when(interaction.hover, [set(badVars.bg, darkOf(ui.accent.warning))]),
        ]),
      ],
    },
    { axes: [tone, interaction] },
  );
});
