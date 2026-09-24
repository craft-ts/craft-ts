import { craftComponent, div, heading, p, type Input } from '@craft-ts/component';
import { CssVarsPageNav } from './css-vars-demo.shared';
import { TokenCard } from './css-vars-required-demo';
import { cssVarsDemo, forwarding } from './css-vars.style';

/**
 * Forwards its own variables to the card's: its sheet does
 * `set(tokenCardVars.ink, forwardingVars.ink)`. The card knows nothing of the
 * parent, and the parent's variables are its optional API.
 */
const ForwardingExample = craftComponent(
  'ForwardingExample',
  {},
  (label: Input<string>) => ({ label }),
  ({ label }) =>
    div({ class: forwarding.root }, [
      TokenCard({
        label,
        tone: function* () {
          return null;
        },
      }),
      p(
        { class: forwarding.note },
        "The parent's variables forward to the card's: they are the parent's optional API.",
      ),
    ]),
);

export const CssVarsForwardingDemo = craftComponent(
  'CssVarsForwardingDemo',
  {},
  () => ({}),
  () =>
    div({ class: cssVarsDemo.page }, [
      CssVarsPageNav(),
      div({ class: cssVarsDemo.intro }, [
        heading('Forwarding and overrides'),
        p(
          { class: cssVarsDemo.muted },
          "On the left, the parent forwards its default values. On the right, a caller sets the parent's variables in its own sheet, and the card follows.",
        ),
      ]),
      div({ class: cssVarsDemo.grid }, [
        ForwardingExample({
          label: function* () {
            return 'Default forwarded values';
          },
        }),
        div(
          { class: forwarding.caller },
          ForwardingExample({
            label: function* () {
              return 'Overridden by the caller';
            },
          }),
        ),
      ]),
    ]),
);

export default CssVarsForwardingDemo;
