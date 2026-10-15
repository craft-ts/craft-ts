import type { Provider } from './host-runtime';
import {
  provideLoopGuard,
  type LoopGuardOptions,
  type LoopSuspicion,
} from '@craft-ts/core';

const BANNER_ATTRIBUTE = 'data-craft-loop-guard';
const MAX_LISTED = 5;

const KIND_TITLE: Readonly<Record<LoopSuspicion['kind'], string>> = {
  instantiation: 'rebuilt in a loop',
  'loader-restart': 'loader restarting in a burst',
  'http-burst': 'requested in a burst',
  'leaked-instance': 'instances not destroyed',
};

const listed: LoopSuspicion[] = [];
let host: HTMLElement | null = null;

function render(): void {
  if (!host) {
    host = document.createElement('div');
    host.setAttribute(BANNER_ATTRIBUTE, 'true');
    host.setAttribute('role', 'alert');
    host.style.cssText =
      'position:fixed;left:12px;bottom:12px;z-index:100000;max-width:min(560px,calc(100vw - 24px));' +
      'font:13px/1.45 system-ui,sans-serif;color:#2b0b0b;background:#fde8e8;border:1px solid #c0392b;' +
      'border-radius:8px;padding:10px 12px;box-shadow:0 4px 18px rgba(0,0,0,.25)';
    document.body.appendChild(host);
  }
  host.replaceChildren();

  const header = document.createElement('div');
  header.style.cssText =
    'display:flex;justify-content:space-between;gap:12px;font-weight:600';
  header.append(`Loop suspected (${listed.length})`);
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.textContent = 'Dismiss';
  dismiss.style.cssText = 'font:inherit;cursor:pointer';
  dismiss.addEventListener('click', () => dismissLoopGuardBanner());
  header.append(dismiss);
  host.append(header);

  for (const suspicion of listed.slice(-MAX_LISTED).reverse()) {
    const row = document.createElement('div');
    row.style.cssText = 'margin-top:6px';
    const title = document.createElement('strong');
    title.textContent = `${suspicion.name} — ${KIND_TITLE[suspicion.kind]}`;
    const detail = document.createElement('div');
    detail.textContent = `${suspicion.count} in ${suspicion.windowMs / 1000}s (≈${suspicion.perSecond.toFixed(1)}/s, threshold ${suspicion.threshold}) · ${suspicion.key}`;
    row.append(title, detail);
    host.append(row);
  }
}

/** Removes the alert and forgets what it listed. */
export function dismissLoopGuardBanner(): void {
  listed.length = 0;
  host?.remove();
  host = null;
}

/**
 * Shows a suspicion as an alert in the page, so a manual test sees it without
 * opening the console. Plain DOM on purpose: it is built outside the render
 * tree, so it can never be part of the loop it reports.
 */
export function showLoopGuardBanner(suspicion: LoopSuspicion): void {
  if (typeof document === 'undefined') return;
  listed.push(suspicion);
  render();
}

/**
 * The loop guard with its page alert, for development:
 *
 * ```ts
 * providers: [...(isDevMode() ? provideCraftLoopGuard({ tripBreaker: true }) : [])]
 * ```
 */
export function provideCraftLoopGuard(options: LoopGuardOptions = {}): Provider[] {
  return provideLoopGuard({
    ...options,
    onSuspected: (suspicion) => {
      options.onSuspected?.(suspicion);
      showLoopGuardBanner(suspicion);
    },
  }) as Provider[];
}
