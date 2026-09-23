let feedbackToast: HTMLElement | null = null;
let feedbackToastTimer: ReturnType<typeof setTimeout> | null = null;

/** Shows short-lived feedback that survives closing an AI overlay. */
export function showAiFeedbackToast(message: string): void {
  if (typeof document === 'undefined') return;

  if (feedbackToastTimer !== null) {
    clearTimeout(feedbackToastTimer);
    feedbackToastTimer = null;
  }
  if (!feedbackToast || !feedbackToast.isConnected) {
    feedbackToast = document.createElement('div');
    feedbackToast.dataset['craftAiToast'] = 'true';
    feedbackToast.setAttribute('role', 'status');
    feedbackToast.setAttribute('aria-live', 'polite');
    feedbackToast.setAttribute('aria-atomic', 'true');
    Object.assign(feedbackToast.style, {
      position: 'fixed',
      right: '20px',
      bottom: '76px',
      zIndex: '100000',
      maxWidth: 'min(420px, calc(100vw - 40px))',
      padding: '10px 14px',
      borderRadius: '8px',
      background: '#047857',
      color: '#ffffff',
      boxShadow: '0 8px 24px rgba(15, 23, 42, 0.25)',
      font: '13px system-ui, -apple-system, sans-serif',
    });
    document.body.append(feedbackToast);
  }
  feedbackToast.textContent = message;
  feedbackToastTimer = setTimeout(() => {
    feedbackToast?.remove();
    feedbackToast = null;
    feedbackToastTimer = null;
  }, 2500);
}
