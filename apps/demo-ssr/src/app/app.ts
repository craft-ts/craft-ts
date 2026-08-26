import {
  a,
  craftComponent,
  div,
  footer,
  header,
  main,
  nav,
  small,
  span,
  strong,
  CraftRouterOutlet,
} from '@craft-ts/component';
import { CraftRouterLink } from '@craft-ts/core';

const SCENARIOS = [
  ['Overview', { to: '' }],
  ['01 · statique', { to: 'static' }],
  ['02 · requête', { to: 'request' }],
  ['03 · query bloquante', { to: 'data' }],
  ['04 · fallback SSR', { to: 'fallback' }],
  ['05 · client-only', { to: 'client-only' }],
] as const;

export const App = craftComponent(
  'SsrLabApp',
  {
    styles: `
      :scope { display: block; min-height: 100vh; background: #f5f7fb; color: #172033; }
      .shell { min-height: 100vh; }
      .masthead { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1.25rem clamp(1rem, 4vw, 4rem); color: #fff; background: #172033; }
      .brand { display: inline-flex; align-items: center; gap: .7rem; color: inherit; text-decoration: none; }
      .brand__mark { display: grid; width: 2.2rem; height: 2.2rem; place-items: center; border-radius: .65rem; color: #172033; background: #ffcf66; font-weight: 850; }
      .brand strong, .brand small { display: block; }
      .brand small { margin-top: .15rem; color: #b8c5d8; font-size: .75rem; }
      .server-indicator { display: grid; gap: .25rem; justify-items: end; color: #c9d5e5; font-size: .78rem; text-align: right; }
      .server-indicator strong { color: #9ee6bd; }
      .nav { display: flex; flex-wrap: wrap; gap: .45rem; padding: .85rem clamp(1rem, 4vw, 4rem); border-bottom: 1px solid #dce4ef; background: #fff; }
      .nav a { padding: .42rem .7rem; border-radius: 999px; color: #536176; font-size: .8rem; font-weight: 700; text-decoration: none; }
      .nav a:hover, .nav a[aria-current='page'] { color: #172033; background: #e7efff; }
      .content { max-width: 76rem; margin: 0 auto; padding: clamp(2rem, 5vw, 4.5rem) clamp(1rem, 4vw, 4rem); }
      .route-page { display: grid; gap: 1.5rem; }
      .hero { display: grid; gap: .6rem; max-width: 52rem; }
      .eyebrow { margin: 0; color: #5373b8; font-size: .75rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
      h1, h2, p { margin: 0; }
      h1 { font-size: clamp(2rem, 5vw, 4rem); line-height: 1.02; letter-spacing: -.055em; }
      h2 { font-size: 1.05rem; }
      .intro { color: #607089; font-size: 1.05rem; line-height: 1.6; }
      .pipeline { display: flex; flex-wrap: wrap; gap: .6rem; margin: 1rem 0 0; padding: 0; list-style: none; }
      .pipeline li { display: inline-flex; align-items: center; gap: .45rem; padding: .35rem .6rem; border: 1px solid #d9e2ef; border-radius: 999px; color: #708098; background: #fff; font-size: .75rem; }
      .pipeline li span { display: grid; width: 1.3rem; height: 1.3rem; place-items: center; border-radius: 50%; color: #fff; background: #91a1b9; font-weight: 800; }
      .pipeline li.is-active { border-color: #8fb0ed; color: #234b9b; background: #edf3ff; }
      .pipeline li.is-active span { background: #3567c5; }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
      .card { display: grid; align-content: start; gap: .9rem; padding: clamp(1rem, 3vw, 1.5rem); border: 1px solid #dce4ef; border-radius: 1rem; background: #fff; box-shadow: 0 .7rem 2rem #1720330a; }
      .card--accent { border-color: #b7caf4; background: linear-gradient(135deg, #f7faff, #fff); }
      .card p, .card li, .card dd { color: #607089; line-height: 1.55; }
      .card ul { display: grid; gap: .4rem; margin: 0; padding-left: 1.2rem; }
      .scenario-list { display: grid; gap: .35rem; }
      .scenario-row { display: grid; grid-template-columns: 2rem 1fr auto; gap: .7rem; align-items: center; padding: .75rem; border-radius: .7rem; color: inherit; text-decoration: none; }
      .scenario-row:hover { background: #f1f5fb; }
      .scenario-row__number { color: #5373b8; font-size: .8rem; font-weight: 850; }
      .scenario-row strong, .scenario-row small { display: block; }
      .scenario-row small { margin-top: .2rem; color: #7c8aa0; line-height: 1.4; }
      .scenario-row__arrow { color: #5373b8; font-size: 1.3rem; }
      .badge { display: inline-flex; width: fit-content; padding: .2rem .48rem; border-radius: 999px; color: #176b45; background: #d9f0e1; font-size: .68rem; font-weight: 850; letter-spacing: .05em; text-transform: uppercase; }
      .badge--client { color: #874e00; background: #fff0c7; }
      .badge--fallback { color: #6346a6; background: #eee5ff; }
      .metric { display: grid; gap: .2rem; }
      .metric strong { font-size: 3.3rem; letter-spacing: -.06em; }
      .metric span, .muted { color: #7c8aa0; font-size: .88rem; }
      .data-list { display: grid; gap: .7rem; }
      .data-list p { padding-bottom: .6rem; border-bottom: 1px solid #edf1f7; }
      .quote { padding: .8rem 1rem; border-left: 3px solid #ffcf66; color: #536176; background: #fff9e9; font-style: italic; }
      .button { width: fit-content; padding: .55rem .85rem; border: 0; border-radius: .55rem; color: #fff; background: #3567c5; font: inherit; font-weight: 750; cursor: pointer; }
      .button:hover { background: #234b9b; }
      .inline-form { display: grid; grid-template-columns: 1fr auto; gap: .6rem; align-items: end; }
      .inline-form label { grid-column: 1 / -1; color: #607089; font-size: .82rem; }
      .inline-form input { min-width: 0; padding: .58rem .7rem; border: 1px solid #cbd7e8; border-radius: .5rem; color: inherit; font: inherit; }
      .pending-box { display: grid; gap: .65rem; min-height: 5rem; padding: 1rem; border: 1px dashed #b5c5dd; border-radius: .7rem; background: #f8faff; }
      .skeleton { width: 70%; height: .75rem; border-radius: 999px; background: linear-gradient(90deg, #e4ebf7, #cddcf4, #e4ebf7); background-size: 200% 100%; animation: SsrLabApp-shimmer 1.2s infinite; }
      .not-found { display: grid; gap: 1rem; justify-items: start; }
      .footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .75rem; padding: 0 clamp(1rem, 4vw, 4rem) 1.5rem; color: #8794a8; font-size: .75rem; }
      @keyframes SsrLabApp-shimmer { to { background-position: -200% 0; } }
      @media (max-width: 720px) { .masthead { align-items: flex-start; flex-direction: column; } .server-indicator { justify-items: start; text-align: left; } .grid { grid-template-columns: 1fr; } .inline-form { grid-template-columns: 1fr; } }
    `,
  },
  () => ({}),
  () =>
    div({ class: 'shell' }, [
      header({ class: 'masthead' }, [
        a('brand', {}, [
          span({ class: 'brand__mark' }, 'S'),
          span([
            strong('SSR lab · CraftTS'),
            small('SSR initial · navigation SPA après hydratation'),
          ]),
        ]).pipe(CraftRouterLink({ to: '' })),
        div({ class: 'server-indicator' }, [
          strong('HTML rendu par renderCraft'),
          span('Puis hydraté par hydrateCraft'),
        ]),
      ]),
      nav(
        { class: 'nav', 'aria-label': 'Scénarios SSR' },
        SCENARIOS.map(([label, link]) =>
          a('scenarioLink', {}, label).pipe(CraftRouterLink(link)),
        ),
      ),
      main({ id: 'main', class: 'content', tabIndex: -1 }, CraftRouterOutlet()),
      footer({ class: 'footer' }, [
        span('SSR lab'),
        span('Chaque route documente sa stratégie de rendu.'),
      ]),
    ]),
);
