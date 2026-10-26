import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  handoffConditionHolds,
  handOff,
  parseHandoffRequest,
} from './guided-resume-handoff';

describe('guided resume handoff', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('reads the condition in the live state, whatever the ordinal', () => {
    const registry = (role: string | null) => ({
      capture: () => ({ 'service:session#7 / query:currentUser#2': role ? { user: { role } } : null }),
    });
    const until = {
      address: 'service:session / query:currentUser',
      path: 'user.role',
      equals: 'product-manager',
    };

    expect(handoffConditionHolds(until, registry('admin'), '/')).toBe(false);
    expect(handoffConditionHolds(until, registry('product-manager'), '/')).toBe(true);
    expect(
      handoffConditionHolds({ address: 'service:session / query:currentUser', exists: false }, registry(null), '/'),
    ).toBe(true);
    expect(handoffConditionHolds({ route: '/admin' }, registry(null), '/admin/products')).toBe(true);
  });

  it('shows the banner, highlights the field and returns once the person is signed in', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<input type="password" data-craft-name="sign-in-password">';
    let role = 'client';
    const registry = { capture: () => ({ 'service:session / query:currentUser': { role } }) };

    const outcome = handOff(
      parseHandoffRequest({
        message: 'Connecte-toi avec le compte product-manager.',
        field: 'sign-in-password',
        until: { address: 'service:session / query:currentUser', path: 'role', equals: 'product-manager' },
        timeoutMs: 60_000,
      }),
      registry,
    );

    const banner = document.querySelector('[data-craft-guided-resume-handoff]');
    expect(banner?.textContent).toContain('Connecte-toi avec le compte product-manager.');
    expect(banner?.hasAttribute('data-craft-ai-overlay')).toBe(true);
    expect(document.querySelector<HTMLElement>('[data-craft-name=sign-in-password]')!.style.outline).not.toBe('');

    role = 'product-manager';
    await vi.advanceTimersByTimeAsync(300);

    await expect(outcome).resolves.toMatchObject({ outcome: 'condition' });
    expect(document.querySelector('[data-craft-guided-resume-handoff]')).toBeNull();
    expect(document.querySelector<HTMLElement>('[data-craft-name=sign-in-password]')!.style.outline).toBe('');
  });

  it('lets the person confirm, decline, or the time run out', async () => {
    vi.useFakeTimers();
    const registry = { capture: () => ({}) };

    const confirmed = handOff(parseHandoffRequest({ message: 'Choisis le compte.' }), registry);
    document.querySelector<HTMLButtonElement>('[data-craft-guided-resume-handoff] button')!.click();
    await expect(confirmed).resolves.toMatchObject({ outcome: 'confirmed' });

    const declined = handOff(parseHandoffRequest({ message: 'Saisis le code reçu.' }), registry);
    document.querySelectorAll<HTMLButtonElement>('[data-craft-guided-resume-handoff] button')[1]!.click();
    await expect(declined).resolves.toMatchObject({ outcome: 'declined' });

    const timedOut = handOff(parseHandoffRequest({ message: 'Saisis le code.', timeoutMs: 10_000 }), registry);
    await vi.advanceTimersByTimeAsync(9_100);
    await expect(timedOut).resolves.toMatchObject({ outcome: 'timeout' });
  });
});
