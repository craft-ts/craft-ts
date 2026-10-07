import {
  craftComponent,
  div,
  p,
  renderContent,
  type ContentSlot,
  type Input,
} from '@craft-ts/component';
import { DocIcon, type IconName } from '../icon/icon.ts';
import { calloutUi } from './callout.style.ts';

/**
 * The five tones. VitePress `info`/`tip`/`warning`/`danger` and GitHub's
 * `NOTE`/`TIP`/`IMPORTANT`/`WARNING`/`CAUTION` all land on one of them.
 */
export type CalloutTone = 'info' | 'tip' | 'important' | 'warning' | 'danger';

const DEFAULT_CAPTION: Readonly<Record<CalloutTone, string>> = {
  info: 'INFO',
  tip: 'TIP',
  important: 'IMPORTANT',
  warning: 'WARNING',
  danger: 'DANGER',
};

/** The glyph of each tone: a different shape, not only a different colour. */
const TONE_ICON: Readonly<Record<CalloutTone, IconName>> = {
  info: 'info',
  tip: 'leaf',
  important: 'sprout',
  warning: 'warning',
  danger: 'error',
};

/**
 * What a callout is called when the page does not name it. The Markdown
 * pipeline passes `calloutCaption(tone, custom)` as the `caption` input, so the
 * component itself never has to guess.
 */
export const calloutCaption = (tone: CalloutTone, custom?: string): string =>
  custom?.trim() ? custom.trim() : DEFAULT_CAPTION[tone];

export interface CalloutInput {
  readonly tone: Input<CalloutTone>;
  readonly caption: Input<string>;
  readonly body: ContentSlot;
}

export const DocCallout = craftComponent(
  'DocCallout',
  {},
  (input: CalloutInput) =>
    div(
      {
        class: calloutUi.root,
        role: 'note',
        'data-tone': function* () {
          return yield* input.tone();
        },
      },
      [
        div({ class: calloutUi.icon }, [
          DocIcon({
            name: function* () {
              return TONE_ICON[yield* input.tone()];
            },
            size: function* () {
              return 'lg' as const;
            },
          }),
        ]),
        p({ class: calloutUi.title }, function* () {
          return yield* input.caption();
        }),
        div({ class: calloutUi.body }, renderContent('body', input.body)),
      ],
    ),
);
