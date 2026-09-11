/**
 * Putting a page into a scenario.
 *
 * The page is described structurally rather than imported from Playwright: the
 * package stays usable from a plain browser harness, and a consumer that does
 * use Playwright passes its `Page` unchanged because the shape matches.
 *
 * Order matters and is fixed here. Emulation and viewport first, because they
 * relayout; then container width; then DOM state; then scrolling, which depends
 * on everything above it. Applying them in registration order instead would
 * make a capture depend on which axis someone declared first.
 */
import type { AnyAxisPoint } from '@craft-ts/style';
import type { ScenarioDriver, VisualScenario } from './matrix.ts';

export interface ScenarioPage {
  setViewportSize(size: { width: number; height: number }): Promise<unknown>;
  emulateMedia(options: Readonly<Record<string, string>>): Promise<unknown>;
  evaluate<Argument>(
    body: (argument: Argument) => unknown,
    argument: Argument,
  ): Promise<unknown>;
  /**
   * Optional because `:hover` is the one state a page script cannot fake.
   *
   * `element.dispatchEvent(new MouseEvent('mouseover'))` fires listeners and
   * leaves the pseudo-class untouched: the capture then looks exactly like the
   * base state and passes forever. So the driver asks the harness to move a
   * real pointer, and a harness that has no pointer is told plainly instead of
   * being handed a screenshot of the wrong state.
   */
  hover?(selector: string): Promise<unknown>;
}

export interface ApplyOptions {
  /** Selector of the element the scenario applies to. Defaults to the root. */
  readonly target?: string;
  /** Viewport height to keep while the width follows the breakpoints. */
  readonly height?: number;
}

const REM = 16;

/** `40rem` → 640. The drivers speak CSS; a viewport is a number of pixels. */
export function toPixels(length: string): number {
  const match = /^(-?[\d.]+)(px|rem|em)$/.exec(length.trim());
  if (!match) {
    throw new Error(
      `applyScenario: '${length}' is not a length this driver can turn into a viewport width. Breakpoints must be built from px, rem or em.`,
    );
  }
  const amount = Number(match[1]);
  return Math.ceil(match[2] === 'px' ? amount : amount * REM);
}

const RANK: Readonly<Record<ScenarioDriver['driver']['kind'], number>> = {
  emulateMedia: 0,
  resize: 1,
  resizeContainer: 2,
  setAttribute: 3,
  descendantState: 4,
  // Hovering last of the DOM-state drivers, and before scrolling: moving the
  // pointer onto an element whose box is about to move by an attribute or a
  // resize would hover whatever happens to be under the cursor afterwards.
  selfState: 5,
  scroll: 6,
};

/**
 * The one place application order is decided.
 *
 * `visualMatrix` stores the drivers sorted by axis, which is stable and reads
 * well; it is deliberately not the order they must be applied in. Anything that
 * applies a scenario by hand goes through this, so there is a single answer to
 * "in what order" rather than one per caller.
 */
export const orderedDrivers = (
  drivers: readonly ScenarioDriver[],
): readonly ScenarioDriver[] =>
  [...drivers].sort(
    (left, right) =>
      RANK[left.driver.kind] - RANK[right.driver.kind] ||
      left.axis.localeCompare(right.axis),
  );

/**
 * Applies every driver of a scenario, in a deterministic order.
 *
 * A driver that cannot be honoured throws rather than being skipped: a skipped
 * driver produces a capture that looks like the base state and passes forever.
 */
export async function applyScenario(
  page: ScenarioPage,
  scenario: VisualScenario,
  options: ApplyOptions = {},
): Promise<void> {
  const target = options.target ?? ':root';
  for (const entry of orderedDrivers(scenario.drivers)) {
    const driver = entry.driver;
    switch (driver.kind) {
      case 'emulateMedia':
        await page.emulateMedia({
          [mediaOption(driver.feature)]: driver.value,
        });
        break;
      case 'resize':
        await page.setViewportSize({
          width: toPixels(driver.minInlineSize),
          height: options.height ?? 900,
        });
        break;
      case 'resizeContainer':
        await page.evaluate(applyContainerWidth, {
          container: driver.container,
          width: toPixels(driver.minInlineSize),
        });
        break;
      case 'setAttribute':
        await page.evaluate(applyAttribute, {
          target,
          name: driver.name,
          value: driver.value,
        });
        break;
      case 'descendantState':
        await page.evaluate(applyDescendantState, {
          target,
          state: driver.state,
        });
        break;
      case 'selfState':
        if (!page.hover) {
          throw new Error(
            `applyScenario: the scenario needs ':${driver.state}' on '${target}', and this page cannot move a pointer. Dispatching a mouse event would not set the pseudo-class — the capture would silently be the base state. Pass a harness with a hover(selector) method, such as a Playwright Page.`,
          );
        }
        await page.hover(target);
        break;
      case 'scroll':
        await page.evaluate(applyScroll, { target, to: driver.to });
        break;
    }
  }
}

const mediaOption = (
  feature: Extract<AnyAxisPoint['driver'], { kind: 'emulateMedia' }>['feature'],
): string =>
  ({
    'prefers-color-scheme': 'colorScheme',
    'prefers-reduced-motion': 'reducedMotion',
    'forced-colors': 'forcedColors',
    'prefers-contrast': 'contrast',
  })[feature];

// The bodies below run in the page, so they take a single serialisable
// argument and reach for nothing from this module's scope.

function applyContainerWidth(input: {
  container: string;
  width: number;
}): void {
  const element = document.querySelector<HTMLElement>(
    `[data-container='${input.container}']`,
  );
  if (!element) {
    throw new Error(
      `applyScenario: no element carries data-container='${input.container}'. A container axis needs the container it queries to exist on the page.`,
    );
  }
  element.style.inlineSize = `${input.width}px`;
}

function applyAttribute(input: {
  target: string;
  name: string;
  value: string;
}): void {
  const element = document.querySelector(input.target);
  if (!element) {
    throw new Error(`applyScenario: no element matches '${input.target}'.`);
  }
  element.setAttribute(input.name, input.value);
}

function applyDescendantState(input: {
  target: string;
  state: 'user-invalid' | 'focus-visible' | 'checked';
}): void {
  const root = document.querySelector(input.target);
  if (!root) {
    throw new Error(`applyScenario: no element matches '${input.target}'.`);
  }
  if (input.state === 'checked') {
    const box = root.querySelector<HTMLInputElement>(
      'input[type=checkbox], input[type=radio]',
    );
    if (!box) throw new Error('applyScenario: no checkable descendant.');
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  if (input.state === 'focus-visible') {
    const focusable = root.querySelector<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex]',
    );
    if (!focusable) throw new Error('applyScenario: no focusable descendant.');
    focusable.focus();
    return;
  }
  const field = root.querySelector<HTMLInputElement>('input, select, textarea');
  if (!field) throw new Error('applyScenario: no field descendant.');
  // `:user-invalid` needs the user to have interacted, not just an invalid
  // value — blurring after a change is the shortest honest way there.
  field.value = field.getAttribute('data-invalid-value') ?? '@';
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
  field.blur();
}

function applyScroll(input: {
  target: string;
  to: 'start' | 'end' | 'snap';
}): void {
  const element = document.querySelector(input.target);
  const scroller =
    element && element.scrollHeight > element.clientHeight
      ? element
      : document.scrollingElement;
  if (!scroller) throw new Error('applyScenario: nothing to scroll.');
  scroller.scrollTop = input.to === 'start' ? 0 : scroller.scrollHeight;
}
