import { renderPage } from './server';

function setText(selector: string, value: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) element.textContent = value;
}

function hydrateCurrentPage(): void {
  setText('[data-hydration-state]', 'SSR initial · SPA active');
  hydrateStaticCounter();
  void hydrateDeferredBlock();
  hydrateClientOnlyBlock();
  startClock();
}

function hydrateStaticCounter(): void {
  const button = document.querySelector<HTMLButtonElement>('[data-counter-button]');
  const counter = document.querySelector<HTMLElement>('[data-counter]');
  if (!button || !counter) return;

  let count = 0;
  button.addEventListener('click', () => {
    count += 1;
    counter.textContent = String(count);
  });
}

async function hydrateDeferredBlock(): Promise<void> {
  const block = document.querySelector<HTMLElement>('[data-deferred]');
  const status = document.querySelector<HTMLElement>('[data-deferred-status]');
  if (!block || !status) return;

  try {
    const response = await fetch('/api/deferred');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as { message: string; generatedAt: string };
    block.classList.add('is-ready');
    block.querySelector('.skeleton')?.remove();
    status.textContent = `${payload.message} (${payload.generatedAt})`;
  } catch {
    block.classList.add('is-error');
    status.textContent = 'Le bloc différé n’a pas pu être chargé.';
  }
}

function hydrateClientOnlyBlock(): void {
  const block = document.querySelector<HTMLElement>('[data-client-only]');
  if (!block) return;

  let visits = 0;
  try {
    visits = Number(localStorage.getItem('ssr-lab-visits') ?? '0') + 1;
    localStorage.setItem('ssr-lab-visits', String(visits));
  } catch {
    // Private browsing can deny localStorage; viewport information still works.
  }

  block.innerHTML = `<strong>${window.innerWidth}px</strong><span>largeur du viewport</span><small>${visits || '—'} visite(s) mémorisée(s) dans le navigateur</small>`;
}

let clockTimer: number | undefined;

function startClock(): void {
  const clock = document.querySelector<HTMLElement>('[data-clock]');
  if (!clock) return;
  if (clockTimer !== undefined) window.clearInterval(clockTimer);
  const update = () => (clock.textContent = new Intl.DateTimeFormat('fr-FR', { timeStyle: 'medium' }).format(new Date()));
  clockTimer = window.setInterval(update, 1000);
}

async function navigate(url: URL, replace = false): Promise<void> {
  const main = document.querySelector<HTMLElement>('#main');
  const currentNav = document.querySelector<HTMLElement>('.nav');
  if (!main || !currentNav) return;

  document.documentElement.dataset.navigation = 'pending';
  setText('[data-hydration-state]', 'navigation SPA · chargement…');

  try {
    // Direct requests are rendered by the server. Once hydrated, the same
    // universal route renderer runs in the browser: no document request and
    // no full reload are needed for a SPA navigation.
    const result = await renderPage(url, {
      'accept-language': navigator.language,
      'user-agent': 'browser',
      cookie: document.cookie,
    });
    const nextDocument = new DOMParser().parseFromString(result.html, 'text/html');
    const nextMain = nextDocument.querySelector<HTMLElement>('#main');
    const nextNav = nextDocument.querySelector<HTMLElement>('.nav');
    if (!nextMain || !nextNav) throw new Error('SSR route response is incomplete');

    main.replaceWith(nextMain);
    currentNav.replaceWith(nextNav);
    document.title = nextDocument.title;
    if (replace) history.replaceState({}, '', url.href);
    else history.pushState({}, '', url.href);
    document.documentElement.dataset.navigation = result.status < 400 ? 'ready' : 'error';
    hydrateCurrentPage();
  } catch {
    document.documentElement.dataset.navigation = 'error';
    setText('[data-hydration-state]', 'navigation impossible · recharge la page');
  }
}

function shouldHandleLink(event: MouseEvent, anchor: HTMLAnchorElement): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !anchor.target &&
    anchor.origin === window.location.origin &&
    anchor.pathname.startsWith('/')
  );
}

document.addEventListener('click', (event) => {
  const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
  if (!anchor || !shouldHandleLink(event, anchor)) return;
  event.preventDefault();
  void navigate(new URL(anchor.href), false);
});

document.addEventListener('submit', (event) => {
  const form = event.target as HTMLFormElement;
  if (form.method.toLowerCase() !== 'get' || form.target) return;
  event.preventDefault();
  const url = new URL(form.action || window.location.href, window.location.href);
  new FormData(form).forEach((value, key) => {
    url.searchParams.set(key, String(value));
  });
  void navigate(url, false);
});

window.addEventListener('popstate', () => {
  void navigate(new URL(window.location.href), true);
});

document.documentElement.dataset.hydrated = 'true';
hydrateCurrentPage();
