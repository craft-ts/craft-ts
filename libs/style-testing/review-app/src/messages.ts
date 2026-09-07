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
  noInventory: 'Nothing to show in this view.',
  extractionDiagnostics: 'Extraction diagnostics',
  currentPromise: 'Current promise',
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
  queueLabel: 'Review queue',
  reviewComplete: 'Review complete',
  reviewCompleteBody: 'Every decision in this session has been recorded.',
  queueFailed:
    'The review queue could not be loaded. Reload the page to retry.',
  decisionFailed:
    'The decision was not saved. The scenario remains in the queue.',
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
  liftHint:
    'Something in the application is painted over this component. Only the frozen page can lift it; in a screenshot those pixels have already been replaced.',
  liftOne: (what: string) => `Hide ${what}`,
  showOne: (what: string) => `Show ${what}`,
  liftMany: (count: number) => `Hide the ${count} elements covering this`,
  showMany: (count: number) => `Show the ${count} elements covering this`,
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
  noApprovedYet: 'New subject: nothing has been approved yet.',
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
  fidelityOnPage:
    'You asked for the page anyway. It is on screen, but it is not what was measured — the decision will be recorded as made without a faithful replay.',
  fidelityOnImage:
    'Judge the picture. Switch to Page to look at the frozen copy anyway; either way the decision is recorded as made without a faithful replay.',

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
} as const;

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
  noInventory: 'Aucun élément dans cette vue.',
  extractionDiagnostics: "Diagnostics d'extraction",
  currentPromise: 'Promesse courante',
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
  queueLabel: "File d'attente de revue",
  reviewComplete: 'Revue terminée',
  reviewCompleteBody:
    'Toutes les décisions de cette session ont été enregistrées.',
  queueFailed:
    "La file d'attente n'a pas pu être chargée. Rechargez la page pour réessayer.",
  decisionFailed:
    "La décision n'a pas été enregistrée. Le scénario reste dans la file.",
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
  liftHint:
    "Un élément de l'application est peint par-dessus ce composant. Seule la page gelée peut le soulever ; sur une photo, ces pixels ont déjà été remplacés.",
  liftOne: (what) => `Masquer ${what}`,
  showOne: (what) => `Afficher ${what}`,
  liftMany: (count) => `Masquer les ${count} éléments qui recouvrent`,
  showMany: (count) => `Afficher les ${count} éléments qui recouvrent`,
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
  noApprovedYet: "Nouveau sujet : rien n'a encore été approuvé.",
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
  fidelityOnPage:
    "Vous avez demandé la page malgré tout. Elle est à l'écran, mais ce n'est pas ce qui a été mesuré — la décision sera enregistrée comme prise sans rejeu fidèle.",
  fidelityOnImage:
    'Jugez la photo. Passez sur Page pour regarder la copie gelée quand même ; dans les deux cas la décision est enregistrée comme prise sans rejeu fidèle.',

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
