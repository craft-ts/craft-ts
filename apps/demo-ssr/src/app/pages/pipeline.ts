import { craftService } from '@craft-ts/core';
import { craftComponent, li, span, ul } from '@craft-ts/component';

export const { SsrPipelineView, provideSsrPipelineView } = craftService(
  { name: 'ssrPipelineView', providedIn: 'toProvide' },
  () => ({}),
);

export const Pipeline = craftComponent(
  'SsrPipeline',
  { providers: [provideSsrPipelineView()] },
  function* () {
    yield* SsrPipelineView();
    return ul({ class: 'pipeline', 'aria-label': 'Pipeline SSR' }, [
      li({ class: 'is-active' }, [span('1'), 'Requête']),
      li({ class: 'is-active' }, [span('2'), 'Rendu serveur']),
      li({ class: 'is-active' }, [span('3'), 'Hydratation']),
    ]);
  },
);
