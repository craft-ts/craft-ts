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
 * **The visual half is not.** The emitted CSS is right — `overflow-block: auto`
 * and `container-type: scroll-state` compute on the real elements, and the
 * `@container scroll-state(stuck: block-end)` rule is in the stylesheet — but
 * the button was never observed toggling in the browser. Two things were found
 * on the way and are worth keeping whatever the cause turns out to be:
 *
 * - `scroll-state(stuck: …)` asks about the **container**, so the element that
 *   sticks has to be the one declaring it. Making the scroll port the container
 *   parses, applies, and never matches.
 * - Gating on `display` cannot work: a zero-size sticky box has nothing to
 *   stick, so the state that would reveal it can never happen. `visibility`
 *   keeps the anchor's size.
 *
 * What is proven here is the compile-time guarantee. Treat the runtime as
 * unverified until someone confirms it.
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
 * Twenty rows, so the box actually scrolls.
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
          div({ class: shell.main }, [div(filler(20)), BackToTop({})]),
        ]),
        span(
          { class: card.body },
          'The emitted CSS is a scroll-state container query; whether it lights up here has not been confirmed in a browser — see the note at the top of this file.',
        ),
      ]),
    ]),
);

export default ScrollDemo;
