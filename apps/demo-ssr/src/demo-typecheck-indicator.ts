/// <reference types="vite/client" />

/**
 * Shows typecheck progress in the hydrated SSR client. A failed check stays
 * visible so the running server remains usable while the error is corrected.
 */
export function startDemoSsrTypecheckIndicator(): void {
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
      const response = await fetch('/__demo-ssr/typecheck', {
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
