/// <reference types="vite/client" />

/* eslint-disable craft-ts/prefer-browser-boundaries, craft-ts/no-direct-temporal-globals, craft-ts/prefer-craft-http-transport, craft-ts/no-async-await -- Dev-server bootstrap adapter, intentionally outside the Craft component tree. */
/*
 * This is a small dev-server bridge, deliberately kept outside the Craft
 * component tree so it can appear as soon as the page is loaded.
 */
export function startDemoTypecheckIndicator(): void {
  if (!import.meta.env.DEV) return;

  const indicator = document.createElement('div');
  const message = document.createElement('span');
  const dismiss = document.createElement('button');

  indicator.className = 'demo-typecheck-indicator';
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-live', 'polite');
  message.textContent = 'Type checking in progress…';
  dismiss.type = 'button';
  dismiss.className = 'demo-typecheck-indicator__dismiss';
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
      const response = await fetch('/__demo/typecheck', {
        cache: 'no-store',
      });
      const payload = (await response.json()) as {
        status?: 'running' | 'passed' | 'failed';
      };

      if (dismissed) return;
      if (payload.status === 'passed') {
        indicator.remove();
        return;
      }
      if (payload.status === 'failed') {
        indicator.dataset['status'] = 'failed';
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
