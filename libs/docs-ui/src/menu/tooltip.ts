import {
  craftComponent,
  renderContent,
  span,
  type ContentSlot,
  type Input,
} from '@craft-ts/component';
import { tooltipUi } from './menu.style.ts';

export interface TooltipInput {
  /** The words in the bubble. Keep them short: they are a name, not a manual. */
  readonly tip: Input<string>;
  /**
   * The bubble's id. The control inside the wrapper must carry it as
   * `aria-describedby`: that is what makes a screen reader read the tip, and the
   * wrapper cannot set it on a control it does not own.
   */
  readonly tipId: Input<string>;
  /** The control the tip describes. */
  readonly body: ContentSlot;
}

/**
 * A short hint over a control, shown on hover and on keyboard focus. The bubble
 * is never the only carrier of information: it names a control that has an
 * accessible name of its own.
 */
export const DocTooltip = craftComponent('DocTooltip', {}, (props: TooltipInput) =>
  span({ class: tooltipUi.root }, [
    renderContent('body', props.body),
    span({ class: tooltipUi.bubble, role: 'tooltip', id: props.tipId }, props.tip),
  ]),
);
