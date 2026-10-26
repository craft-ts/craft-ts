// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { aiTheme } from './ai-overlay.style';
import { applySendContextTheme } from './send-context-theme';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('follows light/dark changes and releases the listener when the overlay closes', () => {
  const media = new EventTarget() as EventTarget & { matches: boolean };
  media.matches = false;
  const removeListener = vi.spyOn(media, 'removeEventListener');
  vi.stubGlobal('matchMedia', () => media);
  const host = document.createElement('div');
  const root = document.createElement('div');
  root.className = aiTheme.root;
  host.append(root);
  const cleanup = applySendContextTheme(host, {
    light: { bg: '#ffffff', accent: 'var(--brand)' },
    dark: { bg: '#111111' },
  });
  expect(root.style.getPropertyValue('--craft-ai-bg')).toBe('#ffffff');
  media.matches = true;
  media.dispatchEvent(new Event('change'));
  expect(root.style.getPropertyValue('--craft-ai-bg')).toBe('#111111');
  expect(root.style.getPropertyValue('--craft-ai-accent')).toBe('var(--brand)');
  media.matches = false;
  media.dispatchEvent(new Event('change'));
  expect(root.style.getPropertyValue('--craft-ai-bg')).toBe('#ffffff');
  cleanup();
  expect(removeListener).toHaveBeenCalledWith('change', expect.any(Function));
});
