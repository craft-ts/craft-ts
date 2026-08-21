import { craftComponent, li, span, ul } from '@craft-ts/component';

export const Pipeline = craftComponent(
  'SsrPipeline',
  {},
  () => ({}),
  () =>
    ul({ class: 'pipeline', 'aria-label': 'Pipeline SSR' }, [
      li({ class: 'is-active' }, [span('1'), 'Requête']),
      li({ class: 'is-active' }, [span('2'), 'Rendu serveur']),
      li({ class: 'is-active' }, [span('3'), 'Hydratation']),
    ]),
);
