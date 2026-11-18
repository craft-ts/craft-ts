import { a, craftComponent, div, p, span, strong, type Input } from '@craft-ts/component';
import { craftExpose, craftService, state } from '@craft-ts/core';
import { DocIconButton } from '@craft-ts/ui';
import { CLOUD_BANNER_STORAGE_KEY } from '../cloud.ts';
import { cloudBannerUi } from './cloud.style.ts';

const storedDismissal = (): boolean => {
  try {
    return globalThis.localStorage?.getItem(CLOUD_BANNER_STORAGE_KEY) === 'dismissed';
  } catch {
    return false;
  }
};

/**
 * Whether the reader hid the banner. It is remembered across visits; storage is a
 * browser boundary and may be refused, and then the banner stays hidden until the
 * page is left.
 */
const { CloudBannerView, provideCloudBannerView } = craftService(
  { name: 'cloudBannerView', providedIn: 'toProvide' },
  function* () {
    const banner = yield* state(
      'banner',
      { dismissed: storedDismissal() },
      ({ update }) => ({
        dismiss: () => {
          try {
            globalThis.localStorage?.setItem(CLOUD_BANNER_STORAGE_KEY, 'dismissed');
          } catch {
            // Refused storage: hidden for this page only.
          }
          update(() => ({ dismissed: true }));
        },
      }),
    );
    yield* craftExpose('dismiss', banner.dismiss);
  },
);

export interface CloudBannerInput {
  /** The cloud page, base included. */
  readonly href: Input<string>;
}

/** A line above every page that announces CraftTS Cloud and leads to its waitlist. */
export const CloudBanner = craftComponent(
  'CloudBanner',
  { providers: [provideCloudBannerView()] },
  function* (input: CloudBannerInput) {
    const view = yield* CloudBannerView();
    return div(
      {
        class: cloudBannerUi.root,
        role: 'region',
        'aria-label': 'CraftTS Cloud announcement',
        'data-dismissed': function* () {
          return (yield* view.banner()).dismissed ? 'true' : 'false';
        },
      },
      [
        p({ class: cloudBannerUi.text }, [
          strong({ class: cloudBannerUi.tag }, 'Early access'),
          span('CraftTS Cloud: session replay, E2E tests and product analytics, hosted for you.'),
          a('cloudBannerLink', { class: cloudBannerUi.link, href: input.href }, 'Join the waitlist →'),
        ]),
        DocIconButton({
          label: function* () {
            return 'Hide this announcement';
          },
          icon: function* () {
            return 'close' as const;
          },
          disabled: function* () {
            return false;
          },
          press: view.dismiss as never,
        }),
      ],
    );
  },
);
