/**
 * Self-contained tokens for the AI overlays.
 *
 * The overlays can be mounted in any application, so they must not consume
 * the host application's design-system variables. The dark values follow the
 * user's preferred color scheme instead.
 */
export const AI_OVERLAY_THEME = `
  :scope {
    color-scheme: light dark;
    --craft-ai-bg: #ffffff;
    --craft-ai-surface: #f9fafb;
    --craft-ai-surface-muted: #f3f4f6;
    --craft-ai-surface-accent: #eff6ff;
    --craft-ai-control-bg: #ffffff;
    --craft-ai-text: #111827;
    --craft-ai-text-muted: #6b7280;
    --craft-ai-accent: #2563eb;
    --craft-ai-accent-hover: #1d4ed8;
    --craft-ai-accent-text: #1d4ed8;
    --craft-ai-border: #d1d5db;
    --craft-ai-border-subtle: #e5e7eb;
    --craft-ai-focus: #3b82f6;
    --craft-ai-danger: #b91c1c;
    --craft-ai-success: #047857;
    --craft-ai-success-bg: #ecfdf5;
    --craft-ai-success-border: #a7f3d0;
    --craft-ai-success-text: #065f46;
    --craft-ai-warning: #b45309;
    --craft-ai-warning-bg: #fffbeb;
    --craft-ai-warning-border: #fde68a;
    --craft-ai-shadow: rgba(15, 23, 42, 0.25);
    --craft-ai-overlay-backdrop: rgba(15, 23, 42, 0.5);
    --craft-ai-accent-soft: rgba(29, 78, 216, 0.15);
    --craft-ai-phase-failed: #b91c1c;
    --craft-ai-phase-succeeded: #047857;
    --craft-ai-phase-started: #b45309;
    --craft-ai-phase-emitted: #4338ca;
  }

  @media (prefers-color-scheme: dark) {
    :scope {
      --craft-ai-bg: #1f2937;
      --craft-ai-surface: #111827;
      --craft-ai-surface-muted: #374151;
      --craft-ai-surface-accent: #1e3a8a;
      --craft-ai-control-bg: #111827;
      --craft-ai-text: #f9fafb;
      --craft-ai-text-muted: #d1d5db;
      --craft-ai-accent-text: #bfdbfe;
      --craft-ai-border: #6b7280;
      --craft-ai-border-subtle: #4b5563;
      --craft-ai-focus: #93c5fd;
      --craft-ai-danger: #fca5a5;
      --craft-ai-success: #6ee7b7;
      --craft-ai-success-bg: #064e3b;
      --craft-ai-success-border: #047857;
      --craft-ai-success-text: #a7f3d0;
      --craft-ai-warning: #fbbf24;
      --craft-ai-warning-bg: #78350f;
      --craft-ai-warning-border: #b45309;
      --craft-ai-shadow: rgba(0, 0, 0, 0.45);
      --craft-ai-overlay-backdrop: rgba(2, 6, 23, 0.7);
      --craft-ai-accent-soft: rgba(191, 219, 254, 0.2);
      --craft-ai-phase-failed: #fca5a5;
      --craft-ai-phase-succeeded: #6ee7b7;
      --craft-ai-phase-started: #fbbf24;
      --craft-ai-phase-emitted: #a5b4fc;
    }
  }
`;
