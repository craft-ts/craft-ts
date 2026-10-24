import { afterEach, describe, expect, it } from 'vitest';
import { createSendContextSession } from '@craft-ts/core';
import { connectDebugSessionHoverCapture } from './debug-session-hover';
import { CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT } from './debug-session-replay-signals';

describe('debug session hover capture', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('captures semantic hover entry and exit, without child-to-child noise', () => {
    document.body.innerHTML =
      '<button id="target"><span id="child">hover</span></button><div id="outside"></div>';
    const session = createSendContextSession();
    session.startRecord();
    const stopCapture = connectDebugSessionHoverCapture(session);
    const button = document.querySelector('#target')!;
    const child = document.querySelector('#child')!;
    const outside = document.querySelector('#outside')!;

    child.dispatchEvent(
      new MouseEvent('pointerover', {
        bubbles: true,
        relatedTarget: document.body,
        clientX: 40,
        clientY: 25,
      }),
    );
    button.dispatchEvent(
      new MouseEvent('pointerout', {
        bubbles: true,
        relatedTarget: child,
        clientX: 45,
        clientY: 26,
      }),
    );
    button.dispatchEvent(
      new MouseEvent('pointerout', {
        bubbles: true,
        relatedTarget: outside,
        clientX: 50,
        clientY: 30,
      }),
    );

    expect(session.events).toMatchObject([
      {
        kind: 'hover',
        phase: 'emitted',
        name: 'hover:enter',
        payload: { action: 'enter', selector: '#target', clientX: 40, clientY: 25 },
      },
      {
        kind: 'hover',
        phase: 'emitted',
        name: 'hover:leave',
        payload: { action: 'leave', selector: '#target', clientX: 50, clientY: 30 },
      },
    ]);

    stopCapture();
  });

  it('does not record hover transitions while a replay is active', () => {
    document.body.innerHTML = '<button id="target">hover</button>';
    const session = createSendContextSession();
    session.startRecord();
    const stopCapture = connectDebugSessionHoverCapture(session);
    window.dispatchEvent(
      new CustomEvent(CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT, {
        detail: { paused: true },
      }),
    );
    document.querySelector('#target')!.dispatchEvent(
      new MouseEvent('pointerover', { bubbles: true, relatedTarget: document.body }),
    );

    expect(session.events).toEqual([]);
    stopCapture();
  });
});
