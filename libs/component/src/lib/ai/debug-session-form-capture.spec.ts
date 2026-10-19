import { afterEach, describe, expect, it } from 'vitest';
import {
  createSendContextSession,
  ɵmarkReplayDomEventCaptured,
} from '@craft-ts/core';
import { connectDebugSessionFormCapture } from './debug-session-form-capture';

describe('debug session form capture', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('captures native control values while respecting sensitive-field rules', () => {
    document.body.innerHTML =
      '<input id="title"><input id="access-token" name="access-token">';
    const session = createSendContextSession();
    session.startRecord();
    const stopCapture = connectDebugSessionFormCapture(session, {
      captureInputValues: true,
    });
    const title = document.querySelector<HTMLInputElement>('#title')!;
    const token = document.querySelector<HTMLInputElement>('#access-token')!;
    title.value = 'Replay todo';
    token.value = 'do-not-record';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    token.dispatchEvent(new Event('input', { bubbles: true }));

    expect(session.events).toMatchObject([
      {
        kind: 'dom',
        phase: 'emitted',
        name: 'native:input',
        payload: {
          action: 'input',
          valueOnly: true,
          selector: '#title',
          value: 'Replay todo',
        },
      },
      {
        kind: 'dom',
        phase: 'emitted',
        name: 'native:input',
        payload: {
          action: 'input',
          valueOnly: true,
          selector: '#access-token',
        },
      },
    ]);
    expect(JSON.stringify(session.events)).not.toContain('do-not-record');

    const alreadyCaptured = new Event('input', { bubbles: true });
    ɵmarkReplayDomEventCaptured(alreadyCaptured);
    title.dispatchEvent(alreadyCaptured);
    expect(session.events).toHaveLength(2);
    stopCapture();
  });
});
