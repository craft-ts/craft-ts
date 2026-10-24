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

  it('records native select open and close intent without recording option values', () => {
    document.body.innerHTML =
      '<select id="country"><option value="fr">France</option><option value="ca">Canada</option></select>';
    const session = createSendContextSession();
    session.startRecord();
    const stopCapture = connectDebugSessionFormCapture(session);
    const select = document.querySelector<HTMLSelectElement>('#country')!;

    select.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    select.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }),
    );

    expect(session.events).toMatchObject([
      {
        kind: 'dom',
        name: 'native:select-open',
        payload: {
          action: 'select-open',
          selector: '#country',
          valueOnly: true,
        },
      },
      {
        kind: 'dom',
        name: 'native:select-close',
        payload: { action: 'select-close', selector: '#country' },
      },
    ]);
    expect(JSON.stringify(session.events)).not.toContain('Canada');
    stopCapture();
  });

  it('captures checked state for opted-in checkbox and radio controls', () => {
    document.body.innerHTML =
      '<input id="subscribe" type="checkbox"><input id="choice-a" type="radio" name="choice"><input id="choice-b" type="radio" name="choice">';
    const session = createSendContextSession();
    session.startRecord();
    const stopCapture = connectDebugSessionFormCapture(session, {
      captureInputValues: true,
    });
    const checkbox = document.querySelector<HTMLInputElement>('#subscribe')!;
    const radio = document.querySelector<HTMLInputElement>('#choice-b')!;
    checkbox.checked = true;
    radio.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    radio.dispatchEvent(new Event('change', { bubbles: true }));

    expect(session.events).toMatchObject([
      {
        name: 'native:change',
        payload: { selector: '#subscribe', checked: true },
      },
      {
        name: 'native:change',
        payload: { selector: '#choice-b', checked: true },
      },
    ]);
    stopCapture();
  });

  it('captures details, dialog, and popover visibility transitions', () => {
    document.body.innerHTML =
      '<details id="faq"><summary>FAQ</summary></details><dialog id="notice"></dialog><div id="help" popover></div>';
    const session = createSendContextSession();
    session.startRecord();
    const stopCapture = connectDebugSessionFormCapture(session);
    const details = document.querySelector<HTMLDetailsElement>('#faq')!;
    const dialog = document.querySelector<HTMLDialogElement>('#notice')!;
    const popover = document.querySelector<HTMLElement>('#help')!;

    details.open = true;
    details.dispatchEvent(new Event('toggle'));
    dialog.open = true;
    dialog.dispatchEvent(new Event('toggle'));
    const popoverToggle = new Event('toggle');
    Object.defineProperty(popoverToggle, 'newState', { value: 'open' });
    popover.dispatchEvent(popoverToggle);

    expect(session.events).toMatchObject([
      {
        name: 'native:details-open',
        payload: { selector: '#faq', open: true },
      },
      {
        name: 'native:dialog-open',
        payload: { selector: '#notice', open: true },
      },
      {
        name: 'native:popover-open',
        payload: { selector: '#help', open: true },
      },
    ]);
    stopCapture();
  });

  it('records picker intent for date, time, and color inputs without capturing values', () => {
    document.body.innerHTML =
      '<input id="birthday" type="date"><input id="alarm" type="time"><input id="accent" type="color">';
    const session = createSendContextSession();
    session.startRecord();
    const stopCapture = connectDebugSessionFormCapture(session);
    for (const id of ['birthday', 'alarm', 'accent']) {
      document
        .querySelector<HTMLInputElement>(`#${id}`)!
        .dispatchEvent(new Event('pointerdown', { bubbles: true }));
    }

    expect(
      session.events.filter((event) => event.name === 'native:picker-open'),
    ).toMatchObject([
      {
        name: 'native:picker-open',
        payload: { selector: '#birthday', controlType: 'date' },
      },
      {
        name: 'native:picker-open',
        payload: { selector: '#alarm', controlType: 'time' },
      },
      {
        name: 'native:picker-open',
        payload: { selector: '#accent', controlType: 'color' },
      },
    ]);
    expect(
      session.events.every((event) => !('value' in (event.payload as object))),
    ).toBe(true);
    stopCapture();
  });

  it('records file-selection count without storing file names or content', () => {
    document.body.innerHTML = '<input id="attachment" type="file" multiple>';
    const session = createSendContextSession();
    session.startRecord();
    const stopCapture = connectDebugSessionFormCapture(session, {
      captureInputValues: true,
    });
    const input = document.querySelector<HTMLInputElement>('#attachment')!;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: { length: 2 },
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(session.events).toMatchObject([
      {
        name: 'native:file-selection',
        payload: { selector: '#attachment', fileCount: 2, replayable: false },
      },
    ]);
    expect(JSON.stringify(session.events)).not.toContain(
      'private-document.pdf',
    );
    stopCapture();
  });
});
