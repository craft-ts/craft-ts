import { craftComponent, li, span, ul } from '@craft-ts/component';
import { pipeline } from '../ssr-lab.style';

export const Pipeline = craftComponent(
  'SsrPipeline',
  {},
  () => ({}),
  () =>
    ul({ class: pipeline.root, 'aria-label': 'Pipeline SSR' }, [
      li({ class: pipeline.step }, [
        span({ class: pipeline.dot }, '1'),
        'Requête',
      ]),
      li({ class: pipeline.step }, [
        span({ class: pipeline.dot }, '2'),
        'Rendu serveur',
      ]),
      li({ class: pipeline.step }, [
        span({ class: pipeline.dot }, '3'),
        'Hydratation',
      ]),
    ]),
);
