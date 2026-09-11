/**
 * Every sentence the review surface says, in each language it says it in.
 *
 * One object per locale rather than keys scattered through the template, and
 * `fr` is typed as `typeof en`: a message added in English and forgotten in
 * French is a compile error, which is the only version of this that stays true
 * after the third change. Counts and names are functions for the same reason —
 * a translator needs the sentence, not its pieces, because plural and word
 * order are not the same in both.
 *
 * The frozen page is never translated. It is a render that was captured, not
 * an interface, and rewording anything inside it would make it something other
 * than what was measured.
 */
import type { Locale } from './preferences.js';

const en = {
  brand: 'CRAFTTS / ATTEST',
  appTitle: 'Visual review',
  attestationTitle: 'Attestations',
  viewAssets: 'Visual assets',
  viewVisual: 'Visual tests',
  viewTemplate: 'Template obligations',
  viewReview: 'Review queue',
  viewNavigation: 'Attestation views',
  viewNavigationDescription:
    'Browse evidence, checks, contracts, and decisions.',
  viewAssetsDescription: 'Captured evidence and screenshots',
  viewVisualDescription: 'Scenarios checked for visual changes',
  visualDetail: 'Visual evidence',
  openVisualReview: 'Open in review queue',
  viewTemplateDescription: 'Contracts emitted by templates',
  viewReviewDescription: 'Decisions waiting for review',
  noInventory: 'Nothing to show in this view.',
  extractionDiagnostics: 'Extraction diagnostics',
  currentPromise: 'Current promise',
  templateWhen: (conditions: string) => `When ${conditions}, `,
  templateConditionJoiner: ' and ',
  templateCondition: (
    name: string,
    expectation: 'true' | 'false' | 'non-empty' | 'empty',
  ) =>
    expectation === 'true'
      ? `${name} is true`
      : expectation === 'false'
        ? `${name} is false`
        : expectation === 'non-empty'
          ? `${name} is non-empty`
          : `${name} is empty`,
  templateStatementRender: (component: string, target: string) =>
    `${component}'s template renders ${target}.`,
  templateStatementCommand: (
    element: string | undefined,
    elementName: string | undefined,
    component: string,
    target: string,
  ) =>
    `${element ?? 'interactive element'}${elementName ? ` '${elementName}'` : ''} in ${component}'s template invokes ${target}.`,
  directionRender: 'Render',
  directionCommand: 'Command',
  stateCurrent: 'Current',
  stateRenewed: 'Renewed',
  stateMissing: 'Missing',
  stateReview: 'Review',
  stateRemoved: 'Removed',
  templateDiffField: (field: string) =>
    field === 'direction'
      ? 'Direction'
      : field === 'element'
        ? 'Element'
        : field === 'elementName'
          ? 'Element name'
          : field === 'targetKind'
            ? 'Target type'
            : field === 'target'
              ? 'Target'
              : field,
  templateValueMissing: '∅',
  previousVerdict: (verdict: string) =>
    verdict === 'ok'
      ? 'Accepted'
      : verdict === 'ok-with-note'
        ? 'Accepted with note'
        : verdict === 'known-issue'
          ? 'Known issue'
          : verdict === 'rejected'
            ? 'Rejected'
            : verdict === 'blocked'
              ? 'Blocked'
              : verdict,
  reasonNeverAttested: 'This evidence has never been attested.',
  reasonRetiredReappeared: 'A retired template promise reappeared.',
  reasonOutputChanged: 'The output changed since the last accepted evidence.',
  reasonTemplateChanged:
    'The template promise changed since the last accepted evidence.',
  reasonAssumptionsChanged:
    'The reductions behind the decision changed.',
  reasonTemplateRemoved: 'The template no longer produces this promise.',
  reasonLastVerdict: (verdict: string) => `The last verdict was ${verdict}.`,
  rawEnglish: 'English source text',
  diagnosticRaw: 'English diagnostic',
  diagnosticUnresolved: 'A dynamic template expression could not be resolved.',
  previousPromise: 'Previous promise',
  previousUnavailable: 'Previous readable evidence is unavailable.',
  codeChange: 'Code slice change',
  removedPromise: 'This promise is no longer produced by the template.',
  previousDecisionLabel: 'Previous decision',
  retirementReason: 'Retirement reason',
  retire: 'Retire',
  superseded: 'Superseded',
  defect: 'Defect',
  derivation: 'Derivation',
  filters: 'Filters',
  filtersDescription: 'Narrow every view with the same criteria.',
  clearFilters: 'Clear filters',
  activeFilters: (count: number) =>
    `${count} active filter${count === 1 ? '' : 's'}`,
  filterComponent: 'Component',
  filterType: 'Type',
  filterState: 'State',
  filterDirection: 'Direction',
  filterText: 'Text',
  filterAll: 'All',
  filterVisual: 'Visual',
  filterTemplate: 'Template',
  filterRemoved: 'Removed',
  filterCurrent: 'Current',
  filterRenewed: 'Renewed',
  filterMissing: 'Missing',
  filterReview: 'Review',
  filterRender: 'Render',
  filterCommand: 'Command',
  queueSummary: (scenarios: number, decisions: number) =>
    `${scenarios} scenario${scenarios === 1 ? '' : 's'} · ${decisions} decision${decisions === 1 ? '' : 's'}`,
  queue: 'Queue',
  queueSubtitle: 'One card per decision',
  sessionHistoryTitle: 'Accepted this session',
  sessionHistoryDescription: 'Review an accepted decision again if needed.',
  reopenDecision: 'Review again',
  reopeningDecision: 'Reopening…',
  queueLabel: 'Review queue',
  reviewComplete: 'Review complete',
  reviewCompleteBody: 'Every decision in this session has been recorded.',
  queueFailed:
    'The review queue could not be loaded. Reload the page to retry.',
  decisionFailed:
    'The decision was not saved. The scenario remains in the queue.',
  reopenFailed:
    'The accepted decision could not be reopened. The queue was not changed.',
  regenerateEvidence: 'Regenerate all evidence',
  regeneratingEvidence: 'Regenerating evidence…',
  regenerationFailed:
    'Evidence regeneration failed. The existing queue and decisions were preserved.',
  iterationHandoff: 'Prepare Codex iteration',
  iterationHandoffGenerating: 'Preparing Codex handoff…',
  iterationHandoffFailed:
    'The Codex handoff could not be generated. Review comments were not changed.',
  closeReviewFailed:
    'The review application could not be closed. The prompt is still available here.',
  iterationModalEyebrow: 'Next code iteration',
  iterationModalTitle: 'Prepare the Codex iteration?',
  iterationModalDescription: (rejected: number) =>
    `${rejected} rejected card${rejected === 1 ? '' : 's'} will be exported with its comments, source paths, and evidence paths.`,
  iterationModalWritesFiles:
    'A Markdown summary, a JSON file, and a copyable Codex prompt will be written under the project runs directory.',
  iterationModalStaysOpen:
    'The review application stays open while you inspect and copy the prompt.',
  iterationModalStopsServer:
    'Close review will stop this local server. The generated prompt will also be printed in the terminal that started it, so Codex can read it directly.',
  iterationModalPreparing: 'Preparing the handoff…',
  iterationModalReady: 'The prompt is ready for Codex.',
  iterationModalClosing: 'Closing the review application…',
  iterationConfirm: 'Prepare handoff',
  closeReview: 'Close review',
  iterationPromptCopied: 'Prompt copied to clipboard.',
  iterationHandoffReady: 'Codex iteration handoff',
  iterationHandoffFiles: (
    rejected: number,
    feedbackPath: string,
    promptPath: string,
  ) =>
    `${rejected} rejected card${rejected === 1 ? '' : 's'} exported to ${feedbackPath}. Prompt: ${promptPath}`,
  iterationPrompt: 'Codex iteration prompt',
  copyIterationPrompt: 'Copy prompt',
  regenerationEyebrow: 'Expensive operation',
  regenerationTitle: 'Regenerate all evidence?',
  regenerationScope: (visual: number, templates: number) =>
    `The configured command will rerun the producers currently covering ${visual} visual test${visual === 1 ? '' : 's'} and ${templates} template obligation${templates === 1 ? '' : 's'}.`,
  regenerationReplacesArtifacts:
    'Generated reports, screenshots, and frozen documents are replaced.',
  regenerationPreservesHistory: (count: number) =>
    `${count} recorded decision${count === 1 ? '' : 's'} and the attestation ledger are preserved.`,
  regenerationFirstGeneration:
    'This is the first generation: every produced evidence item will require an initial decision.',
  regenerationRebuildsQueue:
    'Unchanged evidence stays current; new or changed evidence returns to the review queue.',
  regenerationDropsDraft:
    'The unsaved reason on the current card is discarded when regeneration starts.',
  cancelRegeneration: 'Cancel',
  confirmRegeneration: 'Regenerate everything',
  previous: '↑ Previous ',
  next: 'Next ↓ ',

  language: 'Language',
  theme: 'Theme',
  themeSystem: 'System',
  themeLight: 'Light',
  themeDark: 'Dark',

  scenario: 'SCENARIO',
  clusterNotice: (count: number) =>
    `${count} scenarios have the same measured delta. This decision covers all of them.`,
  identicalChanges: (count: number) =>
    `${count} identical change${count === 1 ? '' : 's'}`,
  clusterMembers: 'Scenarios covered by this decision',
  viewport: (width: number, height: number) => `Viewport ${width}×${height}`,
  viewportUnknown: 'Viewport unknown',
  capture: (width: number, height: number) => `Capture ${width}×${height}`,
  captureUnknown: 'Capture size unknown',
  schemeUnknown: 'scheme unknown',
  browserUnknown: 'browser unknown',
  coverage: (attested: number, seen: number, covered: number) =>
    `${attested} attested · ${seen} on screen · ${covered} covered`,
  coverageUnknown: 'coverage unknown',

  evidence: 'EVIDENCE',
  viewPage: 'Page',
  viewImage: 'Screenshot',
  viewPageHint:
    'The page itself, frozen at the moment it was measured. Click any part of the component to write a remark about that node.',
  viewImageHint:
    'The screenshot. It shows what the measurements cannot — a wrong icon, a missing background — and marks where the viewport ended.',
  liftHint: (what: string) =>
    `${what} is painted over this component. Only the frozen page can lift it; in a screenshot those pixels have already been replaced.`,
  liftHintMany: (count: number) =>
    `${count} elements of the application are painted over this component. Only the frozen page can lift them; in a screenshot those pixels have already been replaced.`,
  lift: 'Lift what covers this',
  drop: 'Put it back',
  zoom: 'Zoom',
  zoomLabel: 'Evidence zoom',
  zoomFit: 'Fit to window',
  zoomActual: 'Actual size',
  helpReplay:
    'The render itself, frozen. Everything outside the subject is dimmed. Click a part of it to aim at that node, ctrl-click to add another, drag a box to take everything it touches — then right-click to drop a reference into the reason.',
  helpImage:
    'A picture of the same render. The dashed box marks what was on screen when it was captured; the rest is attested but was never visible.',

  tierSubject: 'The component this evidence is about',
  tierChanged: 'Measured differently from the last accepted render',
  tierOccludedUnknown:
    'Hidden behind something else when the capture was taken',
  tierOccludedOne: (what: string) =>
    `Hidden behind ${what} when the capture was taken`,
  tierOccludedMany: (count: number) =>
    `Hidden behind ${count} other elements when the capture was taken`,
  tierPicked: 'Selected — a remark you add will name this node',

  frameTitle: 'Frozen page, as captured',
  noImage: 'No screenshot was captured.',
  captionWithTarget: (target: string) =>
    `Current evidence · captured element ${target}`,
  caption: 'Current evidence',
  imageAlt: (scenario: string) => `Current rendering for ${scenario}`,

  measuredChange: 'Measured change',
  neverApproved: 'Never attested',
  previousRejection: 'Previous rejection reason',

  degraded: 'This decision will be recorded as made without a faithful replay.',
  fidelityFrameUnopened: 'The frozen page could not be opened.',
  fidelityNoDigest:
    'There is no attested digest to check this frozen page against, so it cannot be vouched for.',
  fidelityEmpty:
    'The frozen page is empty — nothing was loaded into it, so there is nothing here to compare with the evidence.',
  fidelityNoRoot: (root: string) =>
    `The frozen page has no '${root}' in it, so what it shows is not this component. That happens when the stored snapshot is older than the report it is paired with, or when the component's root selector changed after it was captured.`,
  fidelityMoved: (count: number) =>
    `${count} node${count === 1 ? '' : 's'} in this frozen page measure differently from the evidence, so it is not the render that was attested.`,
  fidelityAbsent: (count: number) =>
    `${count} attested node${count === 1 ? '' : 's'} are absent from this frozen page — a stylesheet or a script-built element did not survive.`,
  fidelityFaithful: 'The frozen page measures exactly like the evidence.',
  fellBack: (summary: string) => `Showing the screenshot: ${summary}`,
  fidelityDetail: 'Which nodes',

  reason: 'Decision reason',
  reasonAria: 'Decision note',
  reasonPlaceholder:
    'Explain what is wrong or why this decision is appropriate…',
  selected: (count: number) =>
    `${count} element${count === 1 ? '' : 's'} selected`,
  insertNothing: 'Select part of the page to reference it here',
  insert: (count: number) =>
    `Insert a reference to ${count} selected node${count === 1 ? '' : 's'}`,
  menuAdd: (count: number) =>
    `Add ${count} node${count === 1 ? '' : 's'} to the reason`,
  reasonHelp:
    'A reason is required for Reject so the code can be corrected. Right-click a selection in the frozen page to drop a reference where you are typing.',
  reasonMissing: 'Explain why this rendering should be rejected.',

  reject: 'Reject ',
  block: 'Block',
  knownIssue: 'Known issue',
  acceptWithNote: 'Accept with note ',
  accept: 'Accept ',

  // What each verdict *does*, not what it is called. Three of the five are
  // accepted by the ledger and two are not, and nothing in the words says
  // which — a reviewer choosing between "Known issue" and "Block" is choosing
  // between "stops asking" and "asks every run", which is the only difference
  // that matters and the one they cannot see.
  hintAccept:
    'This render is right. It becomes the reference, and the scenario stays quiet until the render itself changes.',
  hintAcceptWithNote:
    'Same effect as Accept — the scenario stays quiet — but your reason is recorded alongside the verdict.',
  hintKnownIssue:
    'Accepted, so it stops asking, but recorded as a known defect rather than as correct. Same effect on the queue as Accept; a different claim in the ledger.',
  hintReject:
    'This render is wrong. The scenario comes back on every run, with your reason, until it is fixed and attested again. A reason is required.',
  hintBlock:
    'You cannot judge this one yet. Like Reject it keeps coming back, but it claims nothing about whether the render is right.',
};

/** Typed against `en`, so a forgotten key does not compile. */
export type Messages = {
  [Key in keyof typeof en]: (typeof en)[Key] extends (
    ...args: infer Arguments
  ) => unknown
    ? (...args: Arguments) => string
    : string;
};

const fr: Messages = {
  brand: 'CRAFTTS / ATTEST',
  appTitle: 'Revue visuelle',
  attestationTitle: 'Attestations',
  viewAssets: 'Assets visuels',
  viewVisual: 'Tests visuels',
  viewTemplate: 'Obligations de template',
  viewReview: 'File de revue',
  viewNavigation: "Vues d'attestation",
  viewNavigationDescription:
    'Parcourez preuves, contrôles, contrats et décisions.',
  viewAssetsDescription: 'Captures et preuves collectées',
  viewVisualDescription: 'Scénarios contrôlés visuellement',
  visualDetail: 'Preuve visuelle',
  openVisualReview: 'Ouvrir dans la file de revue',
  viewTemplateDescription: 'Contrats produits par les templates',
  viewReviewDescription: 'Décisions qui attendent une revue',
  noInventory: 'Aucun élément dans cette vue.',
  extractionDiagnostics: "Diagnostics d'extraction",
  currentPromise: 'Promesse courante',
  templateWhen: (conditions) => `Lorsque ${conditions}, `,
  templateConditionJoiner: ' et ',
  templateCondition: (name, expectation) =>
    expectation === 'true'
      ? `${name} est vraie`
      : expectation === 'false'
        ? `${name} est fausse`
        : expectation === 'non-empty'
          ? `${name} n'est pas vide`
          : `${name} est vide`,
  templateStatementRender: (component, target) =>
    `Le template de ${component} affiche ${target}.`,
  templateStatementCommand: (element, elementName, component, target) =>
    `${element ?? 'élément interactif'}${elementName ? ` « ${elementName} »` : ''} dans le template de ${component} appelle ${target}.`,
  directionRender: 'Rendu',
  directionCommand: 'Commande',
  stateCurrent: 'Courant',
  stateRenewed: 'Reporté',
  stateMissing: 'Manquant',
  stateReview: 'À revoir',
  stateRemoved: 'Retiré',
  templateDiffField: (field) =>
    field === 'direction'
      ? 'Direction'
      : field === 'element'
        ? 'Élément'
        : field === 'elementName'
          ? "Nom de l'élément"
          : field === 'targetKind'
            ? 'Type de cible'
            : field === 'target'
              ? 'Cible'
              : field,
  templateValueMissing: '∅',
  previousVerdict: (verdict) =>
    verdict === 'ok'
      ? 'Acceptée'
      : verdict === 'ok-with-note'
        ? 'Acceptée avec motif'
        : verdict === 'known-issue'
          ? 'Problème connu'
          : verdict === 'rejected'
            ? 'Refusée'
            : verdict === 'blocked'
              ? 'Bloquée'
              : verdict,
  reasonNeverAttested: 'Cette preuve n’a jamais été attestée.',
  reasonRetiredReappeared: 'Une promesse de template retirée a réapparu.',
  reasonOutputChanged:
    'La preuve a changé depuis la dernière attestation acceptée.',
  reasonTemplateChanged:
    'La promesse du template a changé depuis la dernière attestation acceptée.',
  reasonAssumptionsChanged:
    'Les réductions sur lesquelles reposait la décision ont changé.',
  reasonTemplateRemoved:
    'Le template ne produit plus cette promesse.',
  reasonLastVerdict: (verdict) => `Le dernier verdict était ${verdict}.`,
  rawEnglish: 'Texte anglais de référence',
  diagnosticRaw: 'Diagnostic anglais',
  diagnosticUnresolved:
    "Une expression dynamique du template n'a pas pu être résolue.",
  previousPromise: 'Promesse précédente',
  previousUnavailable: 'La preuve lisible précédente est indisponible.',
  codeChange: 'Changement de tranche de code',
  removedPromise: "Cette promesse n'est plus produite par le template.",
  previousDecisionLabel: 'Décision précédente',
  retirementReason: 'Motif du retrait',
  retire: 'Retirer',
  superseded: 'Remplacée',
  defect: 'Défaut',
  derivation: 'Dérivation',
  filters: 'Filtres',
  filtersDescription: 'Rétrécissez chaque vue avec les mêmes critères.',
  clearFilters: 'Réinitialiser',
  activeFilters: (count) =>
    `${count} filtre${count === 1 ? '' : 's'} actif${count === 1 ? '' : 's'}`,
  filterComponent: 'Composant',
  filterType: 'Type',
  filterState: 'État',
  filterDirection: 'Direction',
  filterText: 'Texte',
  filterAll: 'Tous',
  filterVisual: 'Visuel',
  filterTemplate: 'Template',
  filterRemoved: 'Retiré',
  filterCurrent: 'Courant',
  filterRenewed: 'Reporté',
  filterMissing: 'Manquant',
  filterReview: 'À revoir',
  filterRender: 'Rendu',
  filterCommand: 'Commande',
  queueSummary: (scenarios, decisions) =>
    `${scenarios} scénario${scenarios === 1 ? '' : 's'} · ${decisions} décision${decisions === 1 ? '' : 's'}`,
  queue: "File d'attente",
  queueSubtitle: 'Une carte par décision',
  sessionHistoryTitle: 'Acceptées pendant cette session',
  sessionHistoryDescription:
    'Rouvrez une décision acceptée si vous souhaitez la vérifier.',
  reopenDecision: 'Revoir',
  reopeningDecision: 'Réouverture…',
  queueLabel: "File d'attente de revue",
  reviewComplete: 'Revue terminée',
  reviewCompleteBody:
    'Toutes les décisions de cette session ont été enregistrées.',
  queueFailed:
    "La file d'attente n'a pas pu être chargée. Rechargez la page pour réessayer.",
  decisionFailed:
    "La décision n'a pas été enregistrée. Le scénario reste dans la file.",
  reopenFailed:
    "La décision acceptée n'a pas pu être rouverte. La file n'a pas changé.",
  regenerateEvidence: 'Tout régénérer',
  regeneratingEvidence: 'Régénération en cours…',
  regenerationFailed:
    'La régénération des preuves a échoué. La file existante et les décisions ont été conservées.',
  iterationHandoff: "Préparer l'itération Codex",
  iterationHandoffGenerating: 'Préparation du handoff Codex…',
  iterationHandoffFailed:
    "Le handoff Codex n'a pas pu être généré. Les commentaires de review n'ont pas été modifiés.",
  closeReviewFailed:
    "L'application de review n'a pas pu être fermée. Le prompt reste disponible ici.",
  iterationModalEyebrow: 'Prochaine itération du code',
  iterationModalTitle: "Préparer l'itération Codex ?",
  iterationModalDescription: (rejected) =>
    `${rejected} carte${rejected === 1 ? '' : 's'} refusée${rejected === 1 ? '' : 's'} sera${rejected === 1 ? '' : 'ont'} exportée${rejected === 1 ? '' : 's'} avec ses commentaires, chemins sources et chemins de preuves.`,
  iterationModalWritesFiles:
    'Un résumé Markdown, un fichier JSON et un prompt Codex copiable seront écrits dans le dossier des rapports du projet.',
  iterationModalStaysOpen:
    "L'application de review reste ouverte pendant que vous inspectez et copiez le prompt.",
  iterationModalStopsServer:
    "Fermer la review arrêtera ce serveur local. Le prompt généré sera aussi écrit dans le terminal qui a lancé l'application, afin que Codex puisse le lire directement.",
  iterationModalPreparing: 'Préparation du handoff…',
  iterationModalReady: 'Le prompt est prêt pour Codex.',
  iterationModalClosing: "Fermeture de l'application de review…",
  iterationConfirm: 'Préparer le handoff',
  closeReview: 'Fermer la review',
  iterationPromptCopied: 'Prompt copié dans le presse-papiers.',
  iterationHandoffReady: 'Handoff pour l’itération Codex',
  iterationHandoffFiles: (rejected, feedbackPath, promptPath) =>
    `${rejected} carte${rejected === 1 ? '' : 's'} refusée${rejected === 1 ? '' : 's'} exportée${rejected === 1 ? '' : 's'} vers ${feedbackPath}. Prompt : ${promptPath}`,
  iterationPrompt: "Prompt d'itération Codex",
  copyIterationPrompt: 'Copier le prompt',
  regenerationEyebrow: 'Opération coûteuse',
  regenerationTitle: 'Régénérer toutes les preuves ?',
  regenerationScope: (visual, templates) =>
    `La commande configurée relancera les producteurs qui couvrent actuellement ${visual} test${visual === 1 ? '' : 's'} visuel${visual === 1 ? '' : 's'} et ${templates} obligation${templates === 1 ? '' : 's'} de template.`,
  regenerationReplacesArtifacts:
    'Les rapports, captures et documents figés générés seront remplacés.',
  regenerationPreservesHistory: (count) =>
    `${count} décision${count === 1 ? '' : 's'} enregistrée${count === 1 ? '' : 's'} et le registre d'attestation seront conservés.`,
  regenerationFirstGeneration:
    "Il s'agit de la première génération : chaque preuve produite demandera une décision initiale.",
  regenerationRebuildsQueue:
    'Les preuves inchangées restent courantes ; les preuves nouvelles ou modifiées reviennent dans la file.',
  regenerationDropsDraft:
    'Le motif non enregistré de la carte courante sera abandonné au démarrage.',
  cancelRegeneration: 'Annuler',
  confirmRegeneration: 'Tout régénérer',
  previous: '↑ Précédent ',
  next: 'Suivant ↓ ',

  language: 'Langue',
  theme: 'Thème',
  themeSystem: 'Système',
  themeLight: 'Clair',
  themeDark: 'Sombre',

  scenario: 'SCÉNARIO',
  clusterNotice: (count) =>
    `${count} scénarios présentent le même écart mesuré. Cette décision les couvre tous.`,
  identicalChanges: (count) =>
    `${count} changement${count === 1 ? '' : 's'} identique${count === 1 ? '' : 's'}`,
  clusterMembers: 'Scénarios couverts par cette décision',
  viewport: (width, height) => `Fenêtre ${width}×${height}`,
  viewportUnknown: 'Fenêtre inconnue',
  capture: (width, height) => `Capture ${width}×${height}`,
  captureUnknown: 'Taille de capture inconnue',
  schemeUnknown: 'thème inconnu',
  browserUnknown: 'navigateur inconnu',
  coverage: (attested, seen, covered) =>
    `${attested} attestés · ${seen} à l'écran · ${covered} recouvert${covered === 1 ? '' : 's'}`,
  coverageUnknown: 'couverture inconnue',

  evidence: 'PREUVE',
  viewPage: 'Page',
  viewImage: 'Photo',
  viewPageHint:
    'La page elle-même, gelée au moment où elle a été mesurée. Cliquez sur une partie du composant pour écrire une remarque sur ce nœud.',
  viewImageHint:
    "La photo. Elle montre ce que les mesures ne peuvent pas dire — une icône erronée, un fond manquant — et marque où s'arrêtait la fenêtre.",
  liftHint: (what) =>
    `${what} est peint par-dessus ce composant. Seule la page gelée peut le soulever ; sur une photo, ces pixels ont déjà été remplacés.`,
  liftHintMany: (count) =>
    `${count} éléments de l'application sont peints par-dessus ce composant. Seule la page gelée peut les soulever ; sur une photo, ces pixels ont déjà été remplacés.`,
  lift: 'Soulever ce qui recouvre',
  drop: 'Le remettre',
  zoom: 'Zoom',
  zoomLabel: 'Zoom de la preuve',
  zoomFit: 'Ajuster à la fenêtre',
  zoomActual: 'Taille réelle',
  helpReplay:
    "Le rendu lui-même, gelé. Tout ce qui est hors du sujet est atténué. Cliquez sur une partie pour viser ce nœud, ctrl-clic pour en ajouter un autre, glissez un cadre pour prendre tout ce qu'il touche — puis clic droit pour déposer une référence dans la raison.",
  helpImage:
    "Une photo du même rendu. Le cadre en pointillés marque ce qui était à l'écran lors de la capture ; le reste est attesté mais n'a jamais été visible.",

  tierSubject: 'Le composant sur lequel porte cette preuve',
  tierChanged: 'Mesuré différemment du dernier rendu accepté',
  tierOccludedUnknown: 'Masqué par autre chose au moment de la capture',
  tierOccludedOne: (what) => `Masqué par ${what} au moment de la capture`,
  tierOccludedMany: (count) =>
    `Masqué par ${count} autres éléments au moment de la capture`,
  tierPicked: 'Sélectionné — une remarque ajoutée nommera ce nœud',

  frameTitle: 'Page gelée, telle que capturée',
  noImage: "Aucune photo n'a été capturée.",
  captionWithTarget: (target) => `Preuve actuelle · élément capturé ${target}`,
  caption: 'Preuve actuelle',
  imageAlt: (scenario) => `Rendu actuel pour ${scenario}`,

  measuredChange: 'Changement mesuré',
  neverApproved: 'Jamais attesté',
  previousRejection: 'Motif du refus précédent',

  degraded: 'Cette décision sera enregistrée comme prise sans rejeu fidèle.',
  fidelityFrameUnopened: "La page gelée n'a pas pu être ouverte.",
  fidelityNoDigest:
    'Aucun digest attesté ne permet de vérifier cette page gelée : elle ne peut pas être garantie.',
  fidelityEmpty:
    "La page gelée est vide — rien n'y a été chargé, il n'y a donc rien à comparer avec la preuve.",
  fidelityNoRoot: (root) =>
    `La page gelée ne contient aucun '${root}' : ce qu'elle affiche n'est pas ce composant. Cela arrive quand la capture stockée est plus ancienne que le rapport auquel elle est associée, ou quand le sélecteur racine du composant a changé depuis.`,
  fidelityMoved: (count) =>
    `${count} nœud${count === 1 ? '' : 's'} de cette page gelée se mesurent différemment de la preuve : ce n'est pas le rendu qui a été attesté.`,
  fidelityAbsent: (count) =>
    `${count} nœud${count === 1 ? '' : 's'} attesté${count === 1 ? '' : 's'} sont absents de cette page gelée — une feuille de style ou un élément construit par script n'a pas survécu.`,
  fidelityFaithful: 'La page gelée se mesure exactement comme la preuve.',
  fellBack: (summary) => `Photo affichée : ${summary}`,
  fidelityDetail: 'Quels nœuds',

  reason: 'Motif de la décision',
  reasonAria: 'Motif de la décision',
  reasonPlaceholder:
    'Expliquez ce qui ne va pas, ou pourquoi cette décision convient…',
  selected: (count) =>
    `${count} élément${count === 1 ? '' : 's'} sélectionné${count === 1 ? '' : 's'}`,
  insertNothing: 'Sélectionnez une partie de la page pour la référencer ici',
  insert: (count) =>
    `Insérer une référence à ${count} nœud${count === 1 ? '' : 's'} sélectionné${count === 1 ? '' : 's'}`,
  menuAdd: (count) => `Ajouter ${count} nœud${count === 1 ? '' : 's'} au motif`,
  reasonHelp:
    'Un motif est exigé pour Refuser, afin que le code puisse être corrigé. Clic droit sur une sélection dans la page gelée pour déposer une référence là où vous écrivez.',
  reasonMissing: 'Expliquez pourquoi ce rendu doit être refusé.',

  reject: 'Refuser ',
  block: 'Bloquer',
  knownIssue: 'Problème connu',
  acceptWithNote: 'Accepter avec motif ',
  accept: 'Accepter ',

  hintAccept:
    "Ce rendu est juste. Il devient la référence, et le scénario se tait jusqu'à ce que le rendu change.",
  hintAcceptWithNote:
    "Même effet qu'Accepter — le scénario se tait — mais votre motif est enregistré avec le verdict.",
  hintKnownIssue:
    "Accepté, donc il cesse de demander, mais consigné comme défaut connu plutôt que comme correct. Même effet sur la file qu'Accepter ; une affirmation différente dans le registre.",
  hintReject:
    "Ce rendu est faux. Le scénario revient à chaque exécution, avec votre motif, jusqu'à correction et nouvelle attestation. Un motif est exigé.",
  hintBlock:
    "Vous ne pouvez pas juger celui-ci pour l'instant. Comme Refuser, il continue de revenir, mais il n'affirme rien sur la justesse du rendu.",
};

export const MESSAGES: Record<Locale, Messages> = { en, fr };
