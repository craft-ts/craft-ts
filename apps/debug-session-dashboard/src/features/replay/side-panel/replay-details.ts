import { i18n } from '../../../shared/util/catalog';
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
import { ui } from '../../../shared/ui/dashboard.style';
import { recordingCaption, viewportCaption } from '../../../shared/util/replay-labels';
import { ReplaySession } from '../../../shared/state/replay-session';
import {
  environmentWarning,
  ReplayState,
  session,
  status,
} from '../../../shared/state/replay-state';
import { eventValue } from '../../../shared/util/view-helpers';

/** The details of the open session, and where its replay starts from. */
export const ReplayDetails = craftComponent('ReplayDetails', {}, function* () {
  const replaySession = yield* ReplaySession();
  const { setStates, startMode, targetUrl } =
    (yield* ReplayState()).imperative;
  const environmentWarningHidden = yield* craftComputed(
    'environmentWarningHidden',
    () => !environmentWarning(),
  );
  const sessionStartUrl = yield* craftComputed(
    'sessionStartUrl',
    () => session()?.startUrl ?? i18n.t("copy.copy045"),
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
    p({ class: ui.fieldLabel }, i18n.t("copy.copy046")),
    input('targetUrl', {
      class: ui.fieldInput,
      type: 'url',
      value: targetUrl,
      input: (event: Event) => setStates({ targetUrl: eventValue(event) }),
      change: () => replaySession.scheduleReplayPreparation(),
      'aria-label': i18n.t("copy.copy047"),
    }),
  ]);

  const start = div([
    p({ class: ui.fieldLabel }, i18n.t("copy.copy048")),
    select(
      'startMode',
      {
        class: ui.tabSelect,
        value: startMode,
        change: (event: Event) => {
          setStates({
            startMode: eventValue(event) === 'snapshot' ? 'snapshot' : 'url',
          });
          replaySession.scheduleReplayPreparation();
        },
        'aria-label': i18n.t("copy.copy049"),
      },
      [
        option({ value: 'url' }, i18n.t("copy.copy050")),
        option({ value: 'snapshot' }, i18n.t("copy.copy051")),
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
      click: replaySession.exportTarget,
    },
    i18n.t("copy.copy052"),
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
          heading({ class: ui.sideSectionTitle }, i18n.t("copy.copy053")),
          fact('Page de départ', sessionStartUrl),
          fact('Contenu', recordingLabel),
          fact('Fenêtre', viewportLabel, 'viewport-caption'),
          environment,
        ]),
        div({ class: ui.sideSection }, [
          heading({ class: ui.sideSectionTitle }, i18n.t("copy.copy054")),
          fact('État', status, 'status'),
          target,
          start,
          p(
            { class: ui.lede },
            i18n.t("copy.copy055"),
          ),
          div([exportButton]),
        ]),
      ]),
    ]),
  ]);
});
