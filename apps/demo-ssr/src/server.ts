export type RequestHeaders = Readonly<Record<string, string | undefined>>;

export type RenderResult = {
  readonly status: number;
  readonly html: string;
};

type Scenario = {
  readonly path: string;
  readonly label: string;
  readonly title: string;
  readonly summary: string;
};

const SCENARIOS: readonly Scenario[] = [
  {
    path: '/static',
    label: '01 · statique',
    title: 'HTML statique rendu par le serveur',
    summary: 'Le serveur produit tout le contenu utile avant l’arrivée du JavaScript.',
  },
  {
    path: '/request',
    label: '02 · requête',
    title: 'Personnalisation par requête',
    summary: 'Le serveur lit la query string, les cookies et les headers pour composer la page.',
  },
  {
    path: '/data',
    label: '03 · données',
    title: 'Données chargées côté serveur',
    summary: 'Le HTML arrive déjà rempli : le navigateur n’a pas besoin de refaire le premier fetch.',
  },
  {
    path: '/deferred',
    label: '04 · différé',
    title: 'Shell SSR, bloc différé côté client',
    summary: 'Le serveur rend la structure et un placeholder ; le bloc lent arrive après hydratation.',
  },
  {
    path: '/client-only',
    label: '05 · client-only',
    title: 'Contenu réservé au navigateur',
    summary: 'Certaines informations n’existent qu’après hydratation : viewport et localStorage.',
  },
];

const HTML_ESCAPE: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (character) => HTML_ESCAPE[character]);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function nowLabel(): string {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Europe/Paris',
  }).format(new Date());
}

function cookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  return cookieHeader
    ?.split(';')
    .map((part) => part.trim().split('='))
    .find(([key]) => key === name)?.[1];
}

function scenarioByPath(path: string): Scenario | undefined {
  return SCENARIOS.find((scenario) => scenario.path === path);
}

function nav(currentPath: string): string {
  const links = [
    { path: '/', label: 'Vue d’ensemble' },
    ...SCENARIOS.map(({ path, label }) => ({ path, label })),
  ];

  return `<nav class="nav" aria-label="Scénarios SSR">${links
    .map(
      ({ path, label }) =>
        `<a class="nav__link${currentPath === path ? ' is-active' : ''}" href="${path}">${label}</a>`,
    )
    .join('')}</nav>`;
}

function pipeline(activeStep: 'request' | 'server' | 'browser' | 'error' = 'server'): string {
  const steps = [
    ['request', '1', 'Requête HTTP'],
    ['server', '2', 'Rendu serveur'],
    ['browser', '3', 'Hydratation'],
  ] as const;

  return `<ol class="pipeline">${steps
    .map(
      ([key, number, label]) =>
        `<li class="pipeline__step${activeStep === key ? ' is-active' : ''}"><span>${number}</span>${label}</li>`,
    )
    .join('')}</ol>`;
}

function card(title: string, content: string, className = ''): string {
  return `<article class="card ${className}"><h2>${title}</h2>${content}</article>`;
}

function badge(text: string, tone: 'server' | 'client' | 'mixed' = 'server'): string {
  return `<span class="badge badge--${tone}">${text}</span>`;
}

function pageFrame(options: {
  readonly currentPath: string;
  readonly title: string;
  readonly intro: string;
  readonly content: string;
  readonly status?: number;
}): string {
  const { currentPath, title, intro, content } = options;
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(title)} · SSR lab</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="Démonstration pédagogique du rendu SSR." />
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    <div class="shell">
      <header class="masthead">
        <a class="brand" href="/"><span class="brand__mark">S</span><span><strong>SSR lab</strong><small>Craft host experiment</small></span></a>
        <div class="server-indicator">${badge('HTML généré côté serveur')}<span data-hydration-state>en attente d’hydratation</span></div>
      </header>
      ${nav(currentPath)}
      <main class="main" id="main">
        <div class="hero"><p class="eyebrow">Rendu côté serveur · démonstration</p><h1>${title}</h1><p class="hero__intro">${intro}</p>${pipeline()}</div>
        ${content}
        <footer class="footer"><span>SSR lab</span><span>Inspecte le code source : le premier HTML est déjà là.</span><span data-clock>${nowLabel()}</span></footer>
      </main>
    </div>
    <script type="module" src="/src/client.ts"></script>
  </body>
</html>`;
}

function overviewPage(): string {
  const rows = SCENARIOS.map(
    ({ path, label, title, summary }) => `<a class="scenario-row" href="${path}"><span class="scenario-row__number">${label.split(' ')[0]}</span><span><strong>${title}</strong><small>${summary}</small></span><span class="scenario-row__arrow">→</span></a>`,
  ).join('');

  return pageFrame({
    currentPath: '/',
    title: 'Comprendre SSR par l’expérience',
    intro: 'Une petite app où chaque route expose un scénario différent : ce qui naît sur le serveur, ce qui attend le navigateur, et ce que l’hydratation change.',
    content: `<section class="overview-grid">${card('Les scénarios', `<div class="scenario-list">${rows}</div>`)}${card('Le modèle mental', `<p>SSR ne remplace pas le navigateur : il lui donne une première version utile de la page.</p><div class="equation"><span>requête</span><b>→</b><span>HTML utile</span><b>→</b><span>page interactive</span></div><p class="muted">Ouvre une page puis désactive JavaScript pour voir ce que le serveur a vraiment livré.</p>`)}</section>`,
  });
}

function staticPage(): string {
  return pageFrame({
    currentPath: '/static',
    title: 'HTML statique rendu par le serveur',
    intro: 'Tout le contenu principal est présent dans la réponse HTTP initiale. Le JavaScript améliore ensuite l’expérience, mais n’est pas requis pour lire la page.',
    content: `<section class="two-columns">${card(`${badge('SSR', 'server')} Le contenu est déjà là`, `<p>Ce titre, ce texte et ce bouton ont été écrits dans le HTML par le serveur.</p><div class="quote">« La première peinture ne dépend pas du JavaScript. »</div><button class="button" data-counter-button>Tester l’hydratation <span data-counter>0</span></button>`, 'accent-card')}${card('À observer', `<ul class="check-list"><li>Afficher la source de la page</li><li>Repérer le contenu de cet article</li><li>Cliquer sur le bouton après hydratation</li></ul>`)}</section>`,
  });
}

function requestPage(url: URL, headers: RequestHeaders): string {
  const name = url.searchParams.get('name') || cookieValue(headers.cookie, 'demo-name') || 'visiteur';
  const language = headers['accept-language']?.split(',')[0] || 'inconnue';
  const userAgent = headers['user-agent']?.split(' ').slice(0, 2).join(' ') || 'inconnu';

  return pageFrame({
    currentPath: '/request',
    title: 'Personnalisation par requête',
    intro: 'Le serveur reçoit la même route, mais fabrique un HTML différent selon les paramètres et les headers de chaque requête.',
    content: `<section class="two-columns">${card(`${badge('SSR', 'server')} Bonjour ${escapeHtml(name)} !`, `<p>Cette salutation a été résolue avant l’envoi du HTML.</p><form class="inline-form" action="/request" method="get"><label for="name">Changer le nom</label><input id="name" name="name" value="${escapeHtml(name)}" /><button class="button" type="submit">Rendre à nouveau</button></form>`, 'accent-card')}${card('Contexte de la requête', `<dl class="data-list"><div><dt>Accept-Language</dt><dd>${escapeHtml(language)}</dd></div><div><dt>User-Agent</dt><dd>${escapeHtml(userAgent)}</dd></div><div><dt>Source</dt><dd><code>URLSearchParams + headers</code></dd></div></dl>`)}</section>`,
  });
}

async function serverData(): Promise<{ readonly visitors: number; readonly region: string; readonly generatedAt: string }> {
  await delay(160);
  return { visitors: 1284, region: 'Europe / Paris', generatedAt: nowLabel() };
}

async function dataPage(): Promise<string> {
  const data = await serverData();
  return pageFrame({
    currentPath: '/data',
    title: 'Données chargées côté serveur',
    intro: 'Le serveur a attendu une source de données avant de produire la page. Le navigateur reçoit directement un état initial complet.',
    content: `<section class="two-columns">${card(`${badge('SSR fetch', 'server')} Données prêtes`, `<div class="metric"><strong>${data.visitors.toLocaleString('fr-FR')}</strong><span>visiteurs servis aujourd’hui</span></div><div class="data-status"><i></i> Réponse intégrée au HTML initial</div>`, 'accent-card')}${card('Payload rendu', `<dl class="data-list"><div><dt>Région</dt><dd>${data.region}</dd></div><div><dt>Généré à</dt><dd>${data.generatedAt}</dd></div><div><dt>Stratégie</dt><dd><code>await serverData()</code></dd></div></dl><p class="muted">Rafraîchis la page : le rendu serveur est recalculé à chaque requête dans cette demo.</p>`)}</section>`,
  });
}

function deferredPage(): string {
  return pageFrame({
    currentPath: '/deferred',
    title: 'Shell SSR, bloc différé côté client',
    intro: 'Le serveur livre instantanément la structure et un état de chargement. Une partie plus lente est demandée après l’hydratation.',
    content: `<section class="two-columns">${card(`${badge('SSR', 'server')} Le shell est immédiat`, `<p>Le titre et cette carte sont dans la réponse serveur.</p><div class="deferred-box" data-deferred><div class="skeleton"></div><p data-deferred-status>En attente de l’hydratation…</p></div>`, 'accent-card')}${card('Pourquoi différer ?', `<p>Utile pour un widget secondaire, une recommandation ou une donnée qui ne doit pas bloquer le premier rendu.</p><div class="legend"><span>${badge('dans le HTML', 'server')}</span><span>${badge('après JS', 'client')}</span></div>`)}</section>`,
  });
}

function clientOnlyPage(): string {
  return pageFrame({
    currentPath: '/client-only',
    title: 'Contenu réservé au navigateur',
    intro: 'Le serveur ne connaît ni la largeur de ta fenêtre ni ton localStorage. Il rend donc un emplacement neutre, rempli uniquement après hydratation.',
    content: `<section class="two-columns">${card(`${badge('client-only', 'client')} Empreinte du navigateur`, `<div class="client-result" data-client-only><span class="spinner"></span><p>Le navigateur complète cette zone…</p></div>`, 'accent-card')}${card('Frontière serveur / client', `<div class="boundary"><div><strong>Serveur</strong><span>HTML stable<br />SEO / premier rendu</span></div><b>│</b><div><strong>Navigateur</strong><span>viewport<br />stockage local</span></div></div><p class="muted">Le placeholder est rendu côté serveur ; la valeur finale ne peut apparaître qu’après hydratation.</p>`)}</section>`,
  });
}

function notFoundPage(path: string): string {
  return pageFrame({
    currentPath: '',
    title: 'Page non trouvée',
    intro: 'Le serveur a reconnu la requête, mais aucune page ne correspond à cette URL.',
    content: `<section class="not-found">${badge('404 · SSR', 'server')}<p><code>${escapeHtml(path)}</code></p><a class="button" href="/">Revenir à l’accueil</a></section>`,
  });
}

export async function renderPage(url: URL, headers: RequestHeaders = {}): Promise<RenderResult> {
  const path = url.pathname.replace(/\/$/, '') || '/';
  if (path === '/') return { status: 200, html: overviewPage() };
  if (path === '/request') return { status: 200, html: requestPage(url, headers) };
  if (path === '/data') return { status: 200, html: await dataPage() };
  if (path === '/deferred') return { status: 200, html: deferredPage() };
  if (path === '/client-only') return { status: 200, html: clientOnlyPage() };
  if (path === '/static') return { status: 200, html: staticPage() };
  return { status: 404, html: notFoundPage(url.pathname) };
}

export async function renderDeferredApi(): Promise<{ readonly message: string; readonly generatedAt: string }> {
  await delay(650);
  return { message: 'Le bloc différé est arrivé après le premier rendu.', generatedAt: nowLabel() };
}

export { SCENARIOS };
