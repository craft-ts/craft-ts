/// <reference types="vite/client" />
import { typecheckIndicator } from './demo-typecheck-indicator.style';

/* eslint-disable craft-ts/prefer-browser-boundaries, craft-ts/prefer-craft-http-transport, craft-ts/no-async-await -- Dev-server bootstrap adapter, intentionally outside the Craft component tree. */
/**
 * Shows the same non-blocking typecheck status as the main demo while Vite is
 * serving this Effect-specific application.
 */
export function startDemoEffectTypecheckIndicator(): void {
  if (!import.meta.env.DEV) return;

  const indicator = document.createElement('div');
  const message = document.createElement('span');
  const dismiss = document.createElement('button');

  indicator.className = typecheckIndicator.root;
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-live', 'polite');
  message.textContent = 'Type checking in progress…';
  dismiss.type = 'button';
  dismiss.className = typecheckIndicator.dismiss;
  dismiss.setAttribute('aria-label', 'Dismiss type-check warning');
  dismiss.title = 'Dismiss';
  dismiss.textContent = '×';
  dismiss.hidden = true;
  indicator.append(message, dismiss);
  document.body.append(indicator);

  let dismissed = false;
  dismiss.addEventListener('click', () => {
    dismissed = true;
    indicator.remove();
  });

  const poll = async (): Promise<void> => {
    try {
      const response = await fetch('/__demo-effect/typecheck', {
        cache: 'no-store',
      });
      const payload = await response.json();
      const status =
        payload && typeof payload === 'object' && 'status' in payload
          ? payload.status
          : undefined;

      if (dismissed) return;
      if (status === 'passed') {
        indicator.remove();
        return;
      }
      if (status === 'failed') {
        indicator.dataset['typecheck'] = 'failed';
        message.textContent = 'Type checking failed — app is still running';
        dismiss.hidden = false;
        return;
      }
    } catch {
      // Keep the indicator visible while Vite is still starting.
    }

    window.setTimeout(() => void poll(), 250);
  };

  void poll();
}
