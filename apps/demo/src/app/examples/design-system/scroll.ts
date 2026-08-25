/**
 * The level-3 witness: a demand that travels, and the layout that answers it.
 *
 * `BackToTop` requires a scroll port and a scroll-state container. It renders
 * fine on its own — an unmet requirement is not an error while an ancestor can
 * still answer it. `ScrollDemo` **seals**, so from there up nobody will, and
 * the requirement has to be met or the build stops.
 *
 * Try it: delete `provides(scrollPort.block)` from `shell.main` in
 * `scroll.style.ts` and run the typecheck. It fails before the app ever starts,
 * naming the requirement and saying where to declare the answer. That half is
 * verified.
 *
 * **The visual half is verified in the browser.** The emitted CSS is right —
 * `overflow-block: auto` and `container-type: scroll-state` compute on the
 * real elements — and the button stays visible while its anchor sticks at the
 * block start as the scroll port moves. The E2E witness drives the same
 * `scrollState.scrollable` scenario as the style matrix.
 *
 * Two details are worth keeping in the example:
 *
 * - `scroll-state(scrollable: …)` asks about the **container**, so the scroll
 *   port declares it: that is the element whose scrollability the button reads.
 * - `scrollable: block-start` is false at the top and true after the user has
 *   moved down. `visibility` hides the button without removing its sticky
 *   anchor from the layout.
 *
 * What is proven here is both halves of the guarantee: the compiler checks the
 * context demand, and the browser observes the state change it controls.
 */
import {
  button,
  craftComponent,
  div,
  heading,
  p,
  section,
  span,
} from '@craft-ts/component';
import { card, stack } from './components.style.ts';
import { dsTheme } from './foundation.style.ts';
import { backToTop, shell } from './scroll.style.ts';

/** Asks for a scroll port. Cannot provide one. Does not pretend to. */
export const BackToTop = craftComponent(
  'BackToTop',
  {},
  () => ({}),
  () =>
    div({ class: backToTop.anchor }, [
      button(
        'backToTop',
        {
          type: 'button',
          class: backToTop.button,
          *click() {
            document
              .querySelector('[data-scroll-port] > *')
              ?.scrollTo({ top: 0 });
          },
        },
        'Back to top',
      ),
    ]),
);

export type BackToTop = typeof BackToTop;

/**
 * Twenty rows, so the box actually scrolls. The shell adds a typed tail after
 * the content to leave room for the sticky container to finish its scroll
 * range.
 *
 * Kept in a wrapper below rather than spread into the scroll port's children:
 * an `Array.from` result is a homogeneous array, not a tuple, and spreading one
 * next to a component node widens the children enough that the parent's channel
 * derivation gives up — the requirement then stops travelling, silently.
 */
const filler = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    p(
      { class: card.body },
      `Row ${index + 1} — scroll to the end of this box.`,
    ),
  );

/**
 * The layout that owns the region, and seals.
 *
 * `seals` is what turns a travelling requirement into an error. Without it the
 * demand would keep going up and out of the application, unanswered and unsaid.
 */
export const ScrollDemo = craftComponent(
  'ScrollDemo',
  { seals: [true] },
  () => ({}),
  () =>
    div({ class: dsTheme.root }, [
      section({ class: stack.column }, [
        heading('A demand that travels, and where it stops'),
        p(
          { class: card.body },
          'The button below asks its ancestors for a scroll port. This component provides one and seals; remove the provider and the build fails.',
        ),
        div({ class: card.root, 'data-scroll-port': 'true' }, [
          div({ class: shell.main }, [
            BackToTop({}),
            div(filler(20)),
            div({ class: shell.tail }, []),
          ]),
        ]),
        span(
          { class: card.body },
          'The button is hidden at the top, then stays sticky at the top of the scroll port while the rows move underneath it; its fill changes when the scroll-state query detects that the port can scroll back.',
        ),
      ]),
    ]),
);

export default ScrollDemo;
