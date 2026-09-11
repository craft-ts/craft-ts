/**
 * The page, frozen at the moment it was measured.
 *
 * A screenshot is a picture of a render; this is the render. It replays as a
 * real document — real elements, real boxes, real `:hover` — which is what lets
 * a reviewer point at a node and name it, instead of pointing at pixels and
 * hoping the coordinates map back.
 *
 * Three properties are load-bearing, and each is a deliberate constraint:
 *
 * - **It is an artefact.** Bytes, content-addressable, replayable identically
 *   in a year. A live iframe is whatever the server serves today, so a verdict
 *   recorded against it would be a judgement about something nobody can
 *   reproduce — and possibly about a different render than the one attested.
 * - **It carries no script.** Inertness is a property of the document, not a
 *   guard that has to be maintained. Nothing to block, nothing to leak: no
 *   timers, no observers, no `craftMethod` firing on a stray click. The review
 *   application does its interactive work from the parent frame, reaching into
 *   a same-origin, `allow-scripts`-less iframe.
 * - **The moment is frozen, styles included.** That is the part that is easy to
 *   get wrong: keeping the stylesheets verbatim leaves every `@media` to be
 *   re-evaluated against the *reviewer's* window and colour scheme. On the demo
 *   route the two conditions in play are `(min-width: 48rem)` and
 *   `(prefers-color-scheme: dark)` — exactly the two axes of the matrix. So
 *   `viewport=md+scheme=dark` would render according to the reviewer's laptop,
 *   silently, and four scenarios would collapse into one or two.
 */

export interface PageSnapshot {
  readonly format: 'craft-ts-page-snapshot';
  readonly version: 1;
  /** A complete, standalone document. */
  readonly html: string;
  /** Everything known to reduce fidelity, stated rather than hidden. */
  readonly risks: readonly SnapshotRisk[];
  readonly capturedAt: {
    readonly url: string;
    readonly viewport: { readonly width: number; readonly height: number };
    readonly colorScheme: string;
  };
}

export interface SnapshotRisk {
  readonly kind:
    | 'unreadable-stylesheet'
    | 'remote-font'
    | 'scroll-position'
    | 'shadow-root'
    | 'canvas';
  readonly detail: string;
}

export interface SnapshotPage {
  evaluate<Argument, Result>(
    body: (argument: Argument) => Result | Promise<Result>,
    argument: Argument,
  ): Promise<Result>;
}

export interface SnapshotOptions {
  /**
   * Marks the attested subtree, so the review can dim everything else.
   *
   * Written as an attribute rather than left to the reviewer to work out: the
   * page shows the whole shell on purpose, and a reviewer who cannot tell the
   * subject from the decor will file a rejection against a component this
   * verdict does not cover.
   */
  readonly root?: string;
}

/**
 * Everything that has to run inside the page, in one self-contained function.
 *
 * Self-contained because a driver serialises it with `toString()`: anything it
 * closed over arrives undefined, as a crash if you are lucky and as a silently
 * empty snapshot if you are not.
 */
export async function snapshotInPage(options: {
  root?: string;
}): Promise<Omit<PageSnapshot, 'format' | 'version'>> {
  const risks: { kind: string; detail: string }[] = [];

  /* -- styles ---------------------------------------------------------- */

  // Media and supports are evaluated **now** and their winning branch inlined;
  // container queries are left alone. The difference is not cosmetic: a
  // container query asks about the page's own layout, which the replay
  // reproduces, while a media query asks about the machine looking at it,
  // which it does not.
  const serialiseRules = (rules: CSSRuleList): string => {
    let css = '';
    for (const rule of rules) {
      if (typeof CSSMediaRule !== 'undefined' && rule instanceof CSSMediaRule) {
        if (matchMedia(rule.conditionText).matches) {
          css += serialiseRules(rule.cssRules);
        }
        continue;
      }
      if (
        typeof CSSSupportsRule !== 'undefined' &&
        rule instanceof CSSSupportsRule
      ) {
        if (CSS.supports(rule.conditionText)) css += serialiseRules(rule.cssRules);
        continue;
      }
      const nested = (rule as unknown as { cssRules?: CSSRuleList }).cssRules;
      const isGrouping =
        nested &&
        typeof CSSStyleRule !== 'undefined' &&
        !(rule instanceof CSSStyleRule);
      if (isGrouping) {
        // `@layer`, `@container`, `@scope`: the wrapper decides the cascade or
        // asks about the page itself, so it survives with its contents.
        const text = rule.cssText;
        const open = text.indexOf('{');
        css += `${text.slice(0, open + 1)}\n${serialiseRules(nested)}\n}\n`;
        continue;
      }
      css += `${rule.cssText}\n`;
      if (
        typeof CSSFontFaceRule !== 'undefined' &&
        rule instanceof CSSFontFaceRule &&
        /url\(\s*['"]?https?:/i.test(rule.cssText)
      ) {
        risks.push({
          kind: 'remote-font',
          detail: 'A @font-face points at a remote URL; the replay needs it to measure the same.',
        });
      }
    }
    return css;
  };

  const sheets: string[] = [];
  for (const sheet of [
    ...document.adoptedStyleSheets,
    ...document.styleSheets,
  ]) {
    try {
      sheets.push(serialiseRules(sheet.cssRules));
    } catch {
      // Same-origin sheets read fine; the rest have to be fetched. A sheet we
      // can neither read nor fetch is a hole, and the replay says so.
      const href = (sheet as CSSStyleSheet).href;
      if (!href) {
        risks.push({ kind: 'unreadable-stylesheet', detail: 'inline sheet' });
        continue;
      }
      try {
        const response = await fetch(href);
        sheets.push(await response.text());
      } catch {
        risks.push({ kind: 'unreadable-stylesheet', detail: href });
      }
    }
  }

  /* -- fix-ups the serialiser cannot see -------------------------------- */

  // `value`, `checked` and `selected` are properties. `outerHTML` reads
  // attributes, so a filled field serialises empty and a ticked box unticked.
  const restore: (() => void)[] = [];
  for (const input of document.querySelectorAll('input, textarea, select')) {
    if (input instanceof HTMLInputElement) {
      const had = input.getAttribute('value');
      input.setAttribute('value', input.value);
      if (input.checked) input.setAttribute('checked', '');
      else input.removeAttribute('checked');
      restore.push(() => {
        if (had === null) input.removeAttribute('value');
        else input.setAttribute('value', had);
      });
    } else if (input instanceof HTMLTextAreaElement) {
      const had = input.textContent;
      input.textContent = input.value;
      restore.push(() => {
        input.textContent = had;
      });
    } else if (input instanceof HTMLSelectElement) {
      for (const option of input.options) {
        if (option.selected) option.setAttribute('selected', '');
        else option.removeAttribute('selected');
      }
    }
  }

  for (const element of document.querySelectorAll('*')) {
    if (element.scrollTop > 0 || element.scrollLeft > 0) {
      // Not reproducible without script, and the snapshot carries none. Said
      // out loud so the replay can be trusted about what it does show.
      risks.push({
        kind: 'scroll-position',
        detail: `${element.tagName.toLowerCase()} was scrolled to ${Math.round(element.scrollTop)}px`,
      });
    }
    if ((element as { shadowRoot?: ShadowRoot }).shadowRoot) {
      risks.push({
        kind: 'shadow-root',
        detail: `${element.tagName.toLowerCase()} has a shadow root, which does not serialise`,
      });
    }
    if (element instanceof HTMLCanvasElement) {
      risks.push({
        kind: 'canvas',
        detail: 'canvas contents are not serialised',
      });
    }
  }

  if (options.root) {
    document.querySelector(options.root)?.setAttribute('data-craft-attested', '');
  }

  const clone = document.documentElement.cloneNode(true) as HTMLElement;
  for (const restoreOne of restore) restoreOne();
  if (options.root) {
    document.querySelector(options.root)?.removeAttribute('data-craft-attested');
  }

  // No script survives. That is what makes the artefact inert by construction
  // rather than by a wrapper that has to hold.
  for (const script of clone.querySelectorAll('script')) script.remove();
  for (const link of clone.querySelectorAll('link[rel=stylesheet]')) link.remove();
  for (const style of clone.querySelectorAll('style')) style.remove();
  for (const element of clone.querySelectorAll('[onclick], [onchange]')) {
    for (const attribute of [...element.attributes]) {
      if (attribute.name.startsWith('on')) element.removeAttribute(attribute.name);
    }
  }

  const head = clone.querySelector('head') ?? clone.insertBefore(
    document.createElement('head'),
    clone.firstChild,
  );
  const base = document.createElement('base');
  base.setAttribute('href', location.href);
  head.insertBefore(base, head.firstChild);
  const frozen = document.createElement('style');
  frozen.textContent = sheets.join('\n');
  head.appendChild(frozen);

  return {
    html: `<!doctype html>\n${clone.outerHTML}`,
    risks: risks.filter(
      (risk, index) =>
        risks.findIndex(
          (other) => other.kind === risk.kind && other.detail === risk.detail,
        ) === index,
    ) as PageSnapshot['risks'],
    capturedAt: {
      url: location.href,
      viewport: { width: innerWidth, height: innerHeight },
      colorScheme: matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light',
    },
  };
}

export async function snapshotPage(
  page: SnapshotPage,
  options: SnapshotOptions = {},
): Promise<PageSnapshot> {
  const captured = await page.evaluate(snapshotInPage, {
    ...(options.root ? { root: options.root } : {}),
  });
  return { format: 'craft-ts-page-snapshot', version: 1, ...captured };
}

export const isPageSnapshot = (value: unknown): value is PageSnapshot =>
  typeof value === 'object' &&
  value !== null &&
  (value as PageSnapshot).format === 'craft-ts-page-snapshot' &&
  (value as PageSnapshot).version === 1 &&
  typeof (value as PageSnapshot).html === 'string';
