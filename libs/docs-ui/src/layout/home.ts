import {
  a,
  craftComponent,
  div,
  figcaption,
  figure,
  heading,
  p,
  section,
  span,
  type CraftNodeChild,
  type Input,
} from '@craft-ts/component';
import { DocLinkButton, type ButtonVariant } from '../button/button.ts';
import { DocContours, DocForest, DocPlate } from '../decor/decor.ts';
import { withBase } from '../site/site.ts';
import { homeUi } from './home.style.ts';

export interface HomeAction {
  /** `brand` is the filled one; anything else is the quiet one. */
  readonly theme: 'brand' | 'alt';
  readonly text: string;
  readonly link: string;
}

export interface HomeFeature {
  readonly title: string;
  readonly details: string;
  /** Without a link the card is a statement, not a door. */
  readonly link: string;
}

export interface HomeHero {
  /** The small label above the title: the name of the project. */
  readonly name: string;
  readonly text: string;
  readonly tagline: string;
  readonly actions: readonly HomeAction[];
  /** The caption under the plate, the way a figure of a book has one. */
  readonly plateCaption: string;
}

export interface HomeInput {
  readonly hero: Input<HomeHero>;
  readonly features: Input<readonly HomeFeature[]>;
  readonly base: Input<string>;
}

/**
 * The front page: a plate with the promise on the left and a botanical figure on
 * the right, the forest along its foot, then the features in cards. Only the
 * first call to action is filled; the rest are quiet, so one thing is asked.
 */
export const DocHome = craftComponent('DocHome', {}, function* (props: HomeInput) {
  const hero = yield* props.hero();
  const features = yield* props.features();
  const base = yield* props.base();

  const actions = hero.actions.map(
    (action): CraftNodeChild =>
      DocLinkButton({
        label: function* () {
          return action.text;
        },
        href: function* () {
          return withBase(base, action.link);
        },
        variant: function* () {
          return (action.theme === 'brand' ? 'primary' : 'secondary') as ButtonVariant;
        },
      }),
  );

  const cards = features.map((feature): CraftNodeChild => {
    const body: CraftNodeChild[] = [
      span({ class: homeUi.cardTitle }, feature.title),
      p({ class: homeUi.cardText }, feature.details),
    ];
    return feature.link
      ? a('docHomeFeature', { class: homeUi.card, href: withBase(base, feature.link) }, body)
      : div({ class: homeUi.card }, body);
  });

  return div([
    section({ class: homeUi.hero }, [
      DocContours({}),
      div({ class: homeUi.heroGrid }, [
        div([
          p({ class: homeUi.eyebrow }, hero.name),
          heading({ class: homeUi.title }, hero.text),
          p({ class: homeUi.tagline }, hero.tagline),
          div({ class: homeUi.actions }, actions),
        ]),
        figure({ class: homeUi.figure }, [
          DocPlate({}),
          figcaption({ class: homeUi.caption }, hero.plateCaption),
        ]),
      ]),
      div({ class: homeUi.forest }, [DocForest({})]),
    ]),
    div({ class: homeUi.features }, cards),
  ]);
});

export interface NotFoundInput {
  readonly eyebrow: Input<string>;
  readonly heading: Input<string>;
  readonly message: Input<string>;
  readonly homeLabel: Input<string>;
  readonly homeHref: Input<string>;
}

/**
 * The page for a path that leads nowhere. It says so plainly, gives one way
 * back, and keeps the forest: a dead end should still feel like the same site.
 */
export const DocNotFound = craftComponent('DocNotFound', {}, function* (
  props: NotFoundInput,
) {
  const eyebrow = yield* props.eyebrow();
  const headingText = yield* props.heading();
  const message = yield* props.message();
  return section({ class: homeUi.lost }, [
    DocContours({}),
    div({ class: homeUi.lostBody }, [
      p({ class: homeUi.eyebrow }, eyebrow),
      heading({ class: homeUi.lostTitle }, headingText),
      p({ class: homeUi.tagline }, message),
      div({ class: homeUi.actions }, [
        DocLinkButton({
          label: props.homeLabel,
          href: props.homeHref,
          variant: function* () {
            return 'primary' as const;
          },
        }),
      ]),
    ]),
    div({ class: homeUi.forest }, [DocForest({})]),
  ]);
});
