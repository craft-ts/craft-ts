import {
  button,
  craftComponent,
  div,
  heading,
  input,
  option,
  p,
  select,
  type CraftNodeChild,
} from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import { buttonUi } from '@craft-ts/ui/style';
import { ui } from './dashboard.style';
import { recordingCaption, viewportCaption } from './replay-labels';
import { exportTarget, scheduleReplayPreparation } from './replay-session';
import {
  environmentWarning,
  session,
  startMode,
  status,
  targetUrl,
} from './replay-state';
import { eventValue } from './view-helpers';

/** The details of the open session, and where its replay starts from. */
export const ReplayDetails = craftComponent('ReplayDetails', {}, function* () {
  const environmentWarningHidden = yield* craftComputed(
    'environmentWarningHidden',
    () => !environmentWarning(),
  );
  const sessionStartUrl = yield* craftComputed(
    'sessionStartUrl',
    () => session()?.startUrl ?? 'Aucune session chargée.',
  );
  const recordingLabel = yield* craftComputed(
    'recordingLabel',
    recordingCaption,
  );
  const viewportLabel = yield* craftComputed('viewportLabel', viewportCaption);

  const fact = (name: string, value: CraftNodeChild, hook?: string) =>
    div({ class: ui.fact }, [
      p({ class: ui.factLabel }, name),
      p({ class: ui.factValue, 'data-lab': hook }, value),
    ]);

  const target = div([
    p({ class: ui.fieldLabel }, 'URL locale instrumentée'),
    input('targetUrl', {
      class: ui.fieldInput,
      type: 'url',
      value: targetUrl,
      input: (event: Event) => targetUrl.set(eventValue(event)),
      change: () => scheduleReplayPreparation(),
      'aria-label': 'URL de l’application cible',
    }),
  ]);

  const start = div([
    p({ class: ui.fieldLabel }, 'Point de départ'),
    select(
      'startMode',
      {
        class: ui.tabSelect,
        value: startMode,
        change: (event: Event) => {
          startMode.set(eventValue(event) === 'snapshot' ? 'snapshot' : 'url');
          scheduleReplayPreparation();
        },
        'aria-label': 'Mode de démarrage',
      },
      [
        option({ value: 'url' }, 'Recharger l’URL enregistrée'),
        option({ value: 'snapshot' }, 'Restaurer le dernier snapshot'),
      ],
    ),
  ]);

  const exportButton = button(
    'export',
    {
      type: 'button',
      class: buttonUi.root,
      'data-variant': 'secondary',
      'aria-description':
        'Exporte la session de diagnostic capturée par l’application cible, l’ajoute au dashboard et télécharge un fichier JSON.',
      'data-tooltip':
        'Récupère la session de diagnostic de l’application cible, l’ajoute au dashboard et télécharge le JSON.',
      click: exportTarget,
    },
    'Exporter la cible',
  );

  const environment = p(
    {
      class: ui.dialogNote,
      'data-lab': 'environment-warning',
      hidden: environmentWarningHidden,
      role: 'status',
    },
    environmentWarning,
  );

  return div({ class: ui.sideBody }, [
    div({ class: ui.scroll }, [
      div({ class: ui.sideStack, 'data-lab': 'left' }, [
        div({ class: ui.sideSection }, [
          heading({ class: ui.sideSectionTitle }, 'L’enregistrement'),
          fact('Page de départ', sessionStartUrl),
          fact('Contenu', recordingLabel),
          fact('Fenêtre', viewportLabel, 'viewport-caption'),
          environment,
        ]),
        div({ class: ui.sideSection }, [
          heading({ class: ui.sideSectionTitle }, 'Le replay'),
          fact('État', status, 'status'),
          target,
          start,
          p(
            { class: ui.lede },
            'L’export récupère la session de l’application rejouée, l’ajoute à l’archive et télécharge son JSON.',
          ),
          div([exportButton]),
        ]),
      ]),
    ]),
  ]);
});
