import {
  button,
  craftComponent,
  details,
  div,
  forNode,
  heading,
  li,
  option,
  p,
  select,
  textarea,
  span,
  summary,
  ul,
  isDebugSessionResumeOverrideList,
  validateDebugSessionResumeOverrides,
  RESUME_FIDELITY_LABELS,
  type ResumeStepStatus,
} from '@craft-ts/component';
import {
  craftComputed,
  isCraftException,
  rawReactiveValue,
} from '@craft-ts/core';
import { DocSwitch } from '@craft-ts/ui';
import { buttonUi } from '@craft-ts/ui/style';
import { ui } from './dashboard.style';
import { goToHash, requestFrameFullscreen } from './replay-browser';
import {
  exportResumeManifest,
  approveResumeAssistantProposal,
  launchDebugAppAtReplay,
  launchResumeAtReplay,
  decideHeldResumeCall,
  planResumeAtReplay,
  preflightResumeAtReplay,
  rejectResumeAssistantProposal,
} from './replay-debug';
import { isLoopbackResumeAssistantOrigin } from './resume-assistant-policy';
import { sessionDate } from './replay-labels';

const resumeStepIcons: Readonly<Record<ResumeStepStatus, string>> = {
  conformant: '✓',
  drifted: '≈',
  skipped: '↷',
  overridden: '✎',
  recorded: '⚠',
  blocked: '✗',
};
import { AiChatBridge } from './replay-ai-bridge.service';
import {
  isRecord,
  isResumeProfile,
  participantOptionLabel,
} from './replay-model';
import { selectParticipant } from './replay-session';
import {
  connected,
  differenceHistoryOpen,
  errorCount,
  isReplayErrorNote,
  pendingWarnings,
  replayWarnings,
  warningHistoryOpen,
  replayableParticipants,
  replayParticipantIds,
  replayDifferences,
  resumePreflight,
  resumeExecution,
  resumeHeldCall,
  resumeAssistantProposals,
  resumeAssistantAutoApprove,
  rememberResumeAssistantAutoApprove,
  resumeClockPolicy,
  resumeProfile,
  resumePlan,
  routeSessionId,
  selectedParticipantId,
  session,
  sidePanelOpen,
  status,
} from './replay-state';
import type { ResumeProfile } from './replay-model';
import { SessionArchive } from './session-archive.service';
import { eventValue, lit } from './view-helpers';

function setResumeAssistantAutoApprove(value: boolean | Event): void {
  if (typeof value === 'boolean')
    rememberResumeAssistantAutoApprove(value);
}

/** The head of the replay page: the way back, which session, and the tools. */
export const ReplayHead = craftComponent('ReplayHead', {}, function* () {
  const aiChat = yield* AiChatBridge();
  const archive = yield* SessionArchive();
  const savedSessions = rawReactiveValue(archive.savedSessions);
  const sessionTitle = () => {
    const selected = savedSessions().find(
      (item) => item.id === routeSessionId(),
    );
    const date = selected
      ? sessionDate.format(new Date(selected.createdAt))
      : 'Session importée';
    const recorded = session();
    const recordedTitle = recorded?.participants?.find(
      (participant) =>
        participant.title && !/^Onglet\s/i.test(participant.title),
    )?.title;
    const appShell = recorded?.events.find(
      (event) =>
        event.kind === 'component-lifecycle' &&
        isRecord(event.payload) &&
        typeof event.payload['componentName'] === 'string' &&
        event.payload['componentName'].endsWith('AppShell'),
    );
    const appShellName = isRecord(appShell?.payload)
      ? appShell.payload['componentName']
      : undefined;
    const appName =
      recordedTitle ??
      (typeof appShellName === 'string'
        ? appShellName.replace(/AppShell$/, '')
        : undefined);
    return appName ? `${appName} · ${date}` : date;
  };
  const sessionTitleText = yield* craftComputed(
    'sessionTitleText',
    sessionTitle,
  );
  const startUrl = yield* craftComputed(
    'startUrl',
    () => session()?.startUrl ?? '',
  );
  const resumeOverridesJson = yield* craftComputed('resumeOverridesJson', () =>
    JSON.stringify(resumeProfile()?.acceptedOverrides ?? [], null, 2),
  );
  const participantFilterHidden = yield* craftComputed(
    'participantFilterHidden',
    () => replayableParticipants().length <= 1,
  );
  const fullscreenDisabled = yield* craftComputed(
    'fullscreenDisabled',
    () => !connected(),
  );
  const debugDisabled = yield* craftComputed('debugDisabled', () => !session());
  const resumeDisabled = yield* craftComputed(
    'resumeDisabled',
    () => !session() || !connected(),
  );
  const launchResumeDisabled = yield* craftComputed(
    'launchResumeDisabled',
    () =>
      resumePlan()?.status !== 'ready' ||
      resumePreflight()?.status !== 'passed' ||
      !connected(),
  );
  const saveResumeProfileDisabled = yield* craftComputed(
    'saveResumeProfileDisabled',
    () => !routeSessionId(),
  );
  const differenceCount = yield* craftComputed('differenceCount', () =>
    String(replayDifferences().length),
  );
  const notesHidden = yield* craftComputed(
    'notesHidden',
    () => replayWarnings().length === 0,
  );
  const hasReplayErrorNote = yield* craftComputed('hasReplayErrorNote', () =>
    replayWarnings().some(isReplayErrorNote),
  );
  const warningCount = yield* craftComputed('warningCount', () =>
    String(replayWarnings().length),
  );
  const resumeSteps = yield* craftComputed(
    'resumeSteps',
    () => resumePlan()?.steps ?? [],
  );
  const resumeProblems = yield* craftComputed(
    'resumeProblems',
    () => resumePlan()?.problems ?? [],
  );
  const resumeCalls = yield* craftComputed(
    'resumeCalls',
    () => resumePlan()?.expectedCalls ?? [],
  );
  const resumeExpectedOutcomes = yield* craftComputed(
    'resumeExpectedOutcomes',
    () => resumePlan()?.expectedOutcomes ?? [],
  );
  const resumePreflightSummary = yield* craftComputed(
    'resumePreflightSummary',
    () => {
      const result = resumePreflight();
      if (!result) return 'Pré-vol backend non exécuté.';
      return result.error
        ? `Pré-vol refusé · ${result.error}`
        : result.status === 'passed'
          ? `Pré-vol réussi · ${result.checked.length} fait(s) vérifié(s).`
          : `Pré-vol refusé · ${result.missing.length} fait(s) requis manquant(s).`;
    },
  );
  const resumePreflightMissing = yield* craftComputed(
    'resumePreflightMissing',
    () => resumePreflight()?.missing ?? [],
  );
  const resumeExecutionSummary = yield* craftComputed(
    'resumeExecutionSummary',
    () => {
      const report = resumeExecution();
      if (!report) return 'Aucune reprise guidée exécutée.';
      if (report.status === 'running')
        return `Reprise en cours · ${report.steps.length} étape(s) terminée(s).`;
      if (report.status === 'failed') return 'Échec du lancement de reprise.';
      const aiOverrides =
        report.overrides?.filter((override) => override.assistedBy === 'ai')
          .length ?? 0;
      return `Fidélité ${RESUME_FIDELITY_LABELS[report.classification ?? 'refused']} · ${report.steps.length} étape(s) · ${report.blocked.length} blocage(s) · ${report.warnings?.length ?? 0} avertissement(s) · ${aiOverrides} surcharge(s) assistée(s) par IA.`;
    },
  );
  const resumePlanSummary = yield* craftComputed('resumePlanSummary', () => {
    const plan = resumePlan();
    return plan
      ? `Plan de reprise ${plan.status === 'ready' ? 'prêt' : 'refusé'} · ${plan.participantIds?.length ?? 1} onglet(s) · ${plan.steps.length} étape(s) · ${plan.problems.filter((problem) => problem.blocking).length} blocage(s)`
      : 'Plan de reprise';
  });

  const back = button(
    'backToSessions',
    {
      type: 'button',
      class: buttonUi.root,
      'data-variant': 'link',
      click: () => {
        goToHash('#/');
      },
    },
    '← Sessions',
  );

  const title = div({ class: ui.headTitle }, [
    heading({ class: ui.headName }, sessionTitleText),
    p({ class: ui.headUrl }, startUrl),
  ]);

  const tabs = select(
    'participantFilter',
    {
      class: ui.tabSelect,
      value: selectedParticipantId,
      hidden: participantFilterHidden,
      change: (event: Event) => selectParticipant(eventValue(event)),
      'aria-label': 'Onglets à visionner',
    },
    [
      option({ value: 'all' }, 'Tous les onglets'),
      forNode(
        replayableParticipants,
        { track: (participant) => participant.id },
        (participant) =>
          option(
            {
              value: function* () {
                const item = yield* participant();
                return item.id;
              },
            },
            function* () {
              return participantOptionLabel(yield* participant());
            },
          ),
      ),
    ],
  );

  const fullscreen = button(
    'fullscreen',
    {
      type: 'button',
      class: buttonUi.root,
      'data-variant': 'secondary',
      'aria-description': 'Affiche l’application cible en plein écran.',
      'data-tooltip':
        'Agrandit l’application cible en plein écran pour inspecter le replay.',
      click: () => {
        const participantId = replayParticipantIds()[0];
        if (participantId) requestFrameFullscreen(participantId);
      },
      disabled: fullscreenDisabled,
    },
    'Plein écran',
  );

  const debug = button(
    'debugApp',
    {
      type: 'button',
      class: buttonUi.root,
      'data-variant': 'secondary',
      'data-lab': 'debug-app',
      'aria-description':
        'Ouvre l’application en mode debug, à l’état où le replay est arrivé.',
      'data-tooltip':
        'Ouvre l’application dans un nouvel onglet, vivante, à l’état du replay en cours, pour investiguer.',
      click: launchDebugAppAtReplay,
      disabled: debugDisabled,
    },
    'Déboguer ici',
  );

  const resume = button(
    'prepareResume',
    {
      type: 'button',
      class: buttonUi.root,
      'data-variant': 'secondary',
      'data-lab': 'prepare-resume',
      'aria-description':
        'Analyse les ressources et les appels nécessaires pour reprendre l’application à ce point.',
      click: () => planResumeAtReplay(),
      disabled: resumeDisabled,
    },
    'Préparer la reprise',
  );

  const journal = button(
    'toggleJournal',
    {
      type: 'button',
      class: buttonUi.root,
      'data-variant': function* () {
        return errorCount() > 0 ? 'tonal' : 'secondary';
      },
      'aria-expanded': function* () {
        return sidePanelOpen() ? 'true' : 'false';
      },
      click: () => sidePanelOpen.set(!sidePanelOpen()),
    },
    'Journal',
  );

  const differences = button(
    'toggleDifferences',
    {
      type: 'button',
      class: buttonUi.root,
      'data-variant': function* () {
        return replayDifferences().length > 0 ? 'tonal' : 'secondary';
      },
      'aria-label': function* () {
        return `${replayDifferences().length} décalage(s) détecté(s)`;
      },
      'aria-expanded': function* () {
        return differenceHistoryOpen() ? 'true' : 'false';
      },
      'data-lab': 'toggle-differences',
      click: () => differenceHistoryOpen.set(!differenceHistoryOpen()),
    },
    [span({ 'aria-hidden': 'true' }, '⚠'), span(differenceCount)],
  );

  const notes = div(
    {
      class: ui.noteAnchor,
      hidden: notesHidden,
    },
    [
      button(
        'toggleNotes',
        {
          type: 'button',
          class: buttonUi.root,
          'data-variant': function* () {
            return pendingWarnings().length > 0 ? 'tonal' : 'secondary';
          },
          'aria-label': function* () {
            return `${replayWarnings().length} note(s) du replay`;
          },
          'aria-expanded': function* () {
            return warningHistoryOpen() ? 'true' : 'false';
          },
          'data-lab': 'toggle-notes',
          click: () => warningHistoryOpen.set(!warningHistoryOpen()),
        },
        span({ class: ui.noteIcon, 'aria-hidden': 'true' }, '🗒'),
      ),
      span(
        {
          class: ui.noteBadge,
          'data-note-badge': function* () {
            return (yield* hasReplayErrorNote()) ? 'error' : undefined;
          },
          'data-lab': 'notes-count',
          'aria-hidden': 'true',
        },
        warningCount,
      ),
    ],
  );

  return div({ class: ui.head }, [
    back,
    title,
    div({ class: ui.headTools }, [
      tabs,
      debug,
      resume,
      fullscreen,
      notes,
      differences,
      journal,
    ]),
    details(
      {
        'data-lab': 'resume-plan',
        hidden: yield* craftComputed('resumePlanHidden', () => !resumePlan()),
      },
      [
        summary(resumePlanSummary),
        p({ class: ui.fieldLabel }, 'Politique d’horloge'),
        select(
          'resumeClockPolicy',
          {
            class: ui.tabSelect,
            value: resumeClockPolicy,
            change: (event: Event) => {
              resumeClockPolicy.set(
                eventValue(event) === 'recorded' ? 'recorded' : 'real',
              );
              planResumeAtReplay();
            },
            'aria-label': 'Politique d’horloge de la reprise',
          },
          [
            option({ value: 'real' }, 'Temps réel, échéances recalées'),
            option({ value: 'recorded' }, 'Temps civil enregistré'),
          ],
        ),
        div(
          {
            'data-lab': 'resume-held-call',
            hidden: yield* craftComputed(
              'resumeHeldCallHidden',
              () => !resumeHeldCall(),
            ),
          },
          [
            p(function* () {
              const held = resumeHeldCall();
              return held
                ? `Mutation retenue : ${held.call}. Autoriser son envoi ?`
                : '';
            }),
            button(
              'resumeHeldCallApprove',
              {
                type: 'button',
                class: buttonUi.root,
                'data-variant': 'primary',
                click: () => decideHeldResumeCall('live'),
              },
              'Autoriser une fois',
            ),
            button(
              'resumeHeldCallReject',
              {
                type: 'button',
                class: buttonUi.root,
                'data-variant': 'secondary',
                click: () => decideHeldResumeCall('abort'),
              },
              'Refuser',
            ),
          ],
        ),
        p(
          { class: ui.fieldLabel },
          'Surcharges JSON (réponses, patchs et statut HTTP facultatif)',
        ),
        textarea('resumeOverridesJson', {
          class: ui.importText,
          rows: 6,
          value: resumeOverridesJson,
          change: (event: Event) => {
            try {
              const acceptedOverrides: unknown = JSON.parse(eventValue(event));
              const recording = session();
              if (
                recording &&
                Array.isArray(acceptedOverrides) &&
                isDebugSessionResumeOverrideList(acceptedOverrides)
              ) {
                const issues = validateDebugSessionResumeOverrides(
                  recording,
                  acceptedOverrides,
                );
                if (issues.length) {
                  const issue = issues[0]!;
                  throw new Error(
                    issue.reason === 'missing-recorded-response'
                      ? `Aucun schéma de réponse JSON exploitable dans l’archive pour ${issue.call}.`
                      : `La réponse de ${issue.call} ne respecte pas la forme JSON enregistrée.`,
                  );
                }
              }
              const nextProfile = {
                format: 'craft-debug-session-resume-profile' as const,
                version: 1 as const,
                clockPolicy: resumeClockPolicy(),
                acceptedOverrides,
              };
              if (!isResumeProfile(nextProfile)) throw new Error('format');
              resumeProfile.set(nextProfile);
              status.set(
                'Surcharges valides en mémoire ; enregistre le profil pour les figer.',
              );
            } catch (error) {
              status.set(
                error instanceof Error
                  ? error.message
                  : 'Surcharge invalide : vérifie le JSON, la réponse enregistrée cible et sa forme.',
              );
            }
          },
          'aria-label': 'Surcharges de reprise au format JSON',
        }),
        button(
          'openResumeAssistant',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'secondary',
            click: aiChat.open,
          },
          'Ouvrir le chat IA',
        ),
        div(
          {
            hidden: !isLoopbackResumeAssistantOrigin(window.location.origin),
            'data-lab': 'resume-assistant-auto-local',
          },
          DocSwitch({
            label: lit('Approuver automatiquement les propositions IA'),
            controlId: lit('resume-assistant-auto-approve'),
            on: function* () {
              return resumeAssistantAutoApprove();
            },
            disabled: lit(false),
            toggle: setResumeAssistantAutoApprove,
          }),
        ),
        details(
          {
            'data-lab': 'resume-assistant-proposals',
            hidden: yield* craftComputed(
              'resumeAssistantProposalsHidden',
              () => resumeAssistantProposals().length === 0,
            ),
          },
          [
            summary('Propositions IA / MCP · validation requise'),
            ul(
              { class: ui.events },
              forNode(
                resumeAssistantProposals,
                { track: (proposal) => proposal.id },
                (proposal) =>
                  li({ class: ui.event, 'data-entry': 'resume-ai-proposal' }, [
                    span({ class: ui.eventName }, function* () {
                      const item = yield* proposal();
                      const suffix =
                        item.status === 'accepted'
                          ? ' · approuvée'
                          : item.status === 'rejected'
                            ? ' · refusée'
                            : item.status === 'apply-requested'
                              ? ' · approbation demandée'
                              : ' · à examiner';
                      return `${item.rationale}${suffix}`;
                    }),
                    div({ class: ui.headTools }, [
                      button(
                        'approveResumeAiProposal',
                        {
                          type: 'button',
                          class: buttonUi.root,
                          'data-variant': 'primary',
                          hidden: function* () {
                            return ['accepted', 'rejected'].includes(
                              (yield* proposal()).status,
                            );
                          },
                          click: function* () {
                            approveResumeAssistantProposal(
                              (yield* proposal()).id,
                            );
                          },
                        },
                        'Approuver',
                      ),
                      button(
                        'rejectResumeAiProposal',
                        {
                          type: 'button',
                          class: buttonUi.root,
                          'data-variant': 'secondary',
                          hidden: function* () {
                            return ['accepted', 'rejected'].includes(
                              (yield* proposal()).status,
                            );
                          },
                          click: function* () {
                            rejectResumeAssistantProposal(
                              (yield* proposal()).id,
                            );
                          },
                        },
                        'Refuser',
                      ),
                    ]),
                  ]),
              ),
            ),
          ],
        ),
        button(
          'saveResumeProfile',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'secondary',
            'data-lab': 'save-resume-profile',
            click: function* () {
              const id = routeSessionId();
              if (!id) return;
              const profile: ResumeProfile = {
                format: 'craft-debug-session-resume-profile',
                version: 1,
                clockPolicy: resumeClockPolicy(),
                acceptedOverrides: resumeProfile()?.acceptedOverrides ?? [],
              };
              const result = yield* archive.saveResumeProfile(id, profile);
              if (isCraftException(result)) {
                status.set('Impossible d’enregistrer le profil de reprise.');
                return;
              }
              resumeProfile.set(profile);
              status.set(
                'Profil de reprise enregistré avec la session locale.',
              );
            },
            disabled: saveResumeProfileDisabled,
          },
          'Enregistrer le profil',
        ),
        button(
          'runResumePreflight',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'secondary',
            'data-lab': 'run-resume-preflight',
            click: preflightResumeAtReplay,
          },
          'Lancer le pré-vol read-only',
        ),
        button(
          'launchResume',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'primary',
            'data-lab': 'launch-resume',
            'aria-description':
              'Ouvre une nouvelle application et exécute les étapes du plan après un pré-vol réussi.',
            click: launchResumeAtReplay,
            disabled: launchResumeDisabled,
          },
          'Reprendre ici',
        ),
        button(
          'exportResumeManifest',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'secondary',
            'data-lab': 'export-resume-manifest',
            click: exportResumeManifest,
          },
          'Exporter le pré-vol',
        ),
        p({ 'data-lab': 'resume-preflight-result' }, resumePreflightSummary),
        ul(
          {
            class: ui.events,
            'data-lab': 'resume-preflight-missing',
            hidden: yield* craftComputed(
              'resumePreflightMissingHidden',
              () => (resumePreflight()?.missing.length ?? 0) === 0,
            ),
          },
          forNode(
            resumePreflightMissing,
            {
              track: (fact) => `${fact.kind}:${fact.name}:${fact.detail ?? ''}`,
            },
            (fact) =>
              li({ class: ui.event, 'data-entry': 'resume-missing-fact' }, [
                span({ class: ui.eventName }, function* () {
                  const item = yield* fact();
                  return `${item.kind} · ${item.name}${item.detail ? ` · ${item.detail}` : ''}`;
                }),
              ]),
          ),
        ),
        details(
          {
            'data-lab': 'resume-execution-report',
            // Lu par les e2e : la classe ne dépend pas du libellé affiché.
            'data-fidelity': yield* craftComputed('resumeFidelity', () => {
              const report = resumeExecution();
              return report?.status === 'completed'
                ? report.classification
                : undefined;
            }),
            hidden: yield* craftComputed(
              'resumeExecutionHidden',
              () => !resumeExecution(),
            ),
          },
          [
            summary(resumeExecutionSummary),
            ul(
              { class: ui.events },
              forNode(
                () => resumeExecution()?.steps ?? [],
                { track: (step) => step.id },
                (step) =>
                  li({ class: ui.event, 'data-entry': 'resume-result-step' }, [
                    span({ class: ui.eventName }, function* () {
                      const item = yield* step();
                      return `${resumeStepIcons[item.status]} ${item.id}`;
                    }),
                    span({ class: ui.eventMeta }, function* () {
                      return (yield* step()).detail ?? '';
                    }),
                  ]),
              ),
            ),
            ul(
              {
                class: ui.events,
                'data-lab': 'resume-warnings',
                hidden: function* () {
                  return (resumeExecution()?.warnings?.length ?? 0) === 0;
                },
              },
              forNode(
                () => resumeExecution()?.warnings ?? [],
                { track: (warning) => warning },
                (warning) =>
                  li(
                    { class: ui.event, 'data-entry': 'resume-warning' },
                    function* () {
                      return `Avertissement · ${yield* warning()}`;
                    },
                  ),
              ),
            ),
            ul(
              {
                class: ui.events,
                hidden: function* () {
                  return (resumeExecution()?.overrides?.length ?? 0) === 0;
                },
              },
              forNode(
                () => resumeExecution()?.overrides ?? [],
                {
                  track: (override) =>
                    `${override.participantId}:${override.call}`,
                },
                (override) =>
                  li(
                    {
                      class: ui.event,
                      'data-entry': 'resume-result-override',
                    },
                    span({ class: ui.eventName }, function* () {
                      const item = yield* override();
                      return `${item.participantId} · ${item.call} · ${item.assistedBy === 'ai' ? 'assistée par l’IA' : 'surcharge manuelle'}`;
                    }),
                  ),
              ),
            ),
          ],
        ),
        ul(
          { class: ui.events },
          forNode(resumeSteps, { track: (step) => step.id }, (step) =>
            li({ class: ui.event, 'data-entry': 'resume-step' }, [
              span({ class: ui.eventName }, function* () {
                const item = yield* step();
                return `${item.participantId ? `${item.participantId} · ` : ''}${item.kind} · ${item.primitive ?? item.resource ?? item.id}`;
              }),
              span({ class: ui.eventMeta }, function* () {
                const item = yield* step();
                return item.reason ?? (item.blocking ? 'bloquant' : 'prévu');
              }),
            ]),
          ),
        ),
        ul(
          { class: ui.events },
          forNode(
            resumeProblems,
            { track: (problem) => `${problem.code}:${problem.message}` },
            (problem) =>
              li({ class: ui.event, 'data-entry': 'resume-problem' }, [
                span({ class: ui.eventName }, function* () {
                  const item = yield* problem();
                  return item.blocking
                    ? `Blocage · ${item.code}`
                    : `Avertissement · ${item.code}`;
                }),
                span({ class: ui.eventMeta }, function* () {
                  return (yield* problem()).message;
                }),
              ]),
          ),
        ),
        ul(
          { class: ui.events },
          forNode(resumeCalls, { track: (call) => call }, (call) =>
            li({ class: ui.event, 'data-entry': 'resume-call' }, function* () {
              return yield* call();
            }),
          ),
        ),
        ul(
          { class: ui.events },
          forNode(
            resumeExpectedOutcomes,
            { track: (outcome) => outcome.call },
            (outcome) =>
              li(
                { class: ui.event, 'data-entry': 'resume-expected-outcome' },
                function* () {
                  const item = yield* outcome();
                  return item.status === undefined
                    ? `${item.call} · résultat enregistré attendu`
                    : `${item.call} · HTTP ${item.status} enregistré attendu`;
                },
              ),
          ),
        ),
      ],
    ),
  ]);
});
