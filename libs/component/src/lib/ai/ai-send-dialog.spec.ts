// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  provideCraftTemporalRuntime,
  VirtualCraftTemporalRuntime,
  type SendContextPayload,
} from '@craft-ts/core';
import { renderCraftComponent } from '../testing';
import { AiSendDialog } from './ai-send-dialog';

const payload: SendContextPayload = {
  hostName: 'DemoComponent',
  tagList: ['component:DemoComponent#1'],
  coords: { x: 120, y: 80 },
  clickedElement: {
    tagName: 'button',
    textContent: 'Demo',
    outerHTML: '<button>Demo</button>',
  },
  outerHTML: '<button>Demo</button>',
  snapshot: [],
};

describe('AiSendDialog', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(() => Promise.resolve()) },
    });
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('keeps the prompt editable and enables copy after typing', async () => {
    const rendered = await renderCraftComponent(AiSendDialog, {
      providers: [
        provideCraftTemporalRuntime(new VirtualCraftTemporalRuntime()),
      ] as never,
      props: {
        payload: function* () {
          return payload;
        },
        onClose: vi.fn(),
      } as never,
    });

    const textarea = rendered.nativeElement.querySelector(
      'textarea',
    ) as HTMLTextAreaElement;
    const copy = rendered.nativeElement.querySelector(
      '[data-craft-name="aiDialogCopy"]',
    ) as HTMLButtonElement;

    expect(copy.disabled).toBe(true);

    textarea.value = 'Explain this component';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await rendered.flush();

    expect(copy.disabled).toBe(false);
    expect(copy.textContent).toContain('Copier');

    copy.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
    await rendered.flush();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        '# Clicked element\n- tagName: button\n- textContent: "Demo"',
      ),
    );

    rendered.destroy();
  });

  it('copies only the selected context sections, including DOM and CSS when enabled', async () => {
    const captureElement = document.createElement('section');
    captureElement.innerHTML =
      '<button data-craft-name="target">Target</button>';
    document.body.append(captureElement);

    const rendered = await renderCraftComponent(AiSendDialog, {
      providers: [
        provideCraftTemporalRuntime(new VirtualCraftTemporalRuntime()),
      ] as never,
      props: {
        payload: function* () {
          return { ...payload, captureElement };
        },
        onClose: vi.fn(),
      } as never,
    });

    const textarea = rendered.nativeElement.querySelector(
      'textarea',
    ) as HTMLTextAreaElement;
    const copy = rendered.nativeElement.querySelector(
      '[data-craft-name="aiDialogCopy"]',
    ) as HTMLButtonElement;
    const componentOption = rendered.nativeElement.querySelector(
      '[data-craft-name="aiIncludeComponent"]',
    ) as HTMLInputElement;
    const snapshotOption = rendered.nativeElement.querySelector(
      '[data-craft-name="aiIncludeAppSnapshot"]',
    ) as HTMLInputElement;
    const domOption = rendered.nativeElement.querySelector(
      '[data-craft-name="aiIncludeDomStyles"]',
    ) as HTMLInputElement;
    const pageDomOption = rendered.nativeElement.querySelector(
      '[data-craft-name="aiIncludePageDomStyles"]',
    ) as HTMLInputElement;

    componentOption.click();
    snapshotOption.click();
    domOption.click();
    pageDomOption.click();
    textarea.value = 'Reproduce this layout';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await rendered.flush();

    copy.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
    await rendered.flush();

    const copiedPrompt = vi.mocked(navigator.clipboard.writeText).mock
      .calls[0]?.[0];
    expect(copiedPrompt).toContain('# Clicked element');
    expect(copiedPrompt).toContain('# Component DOM + computed CSS styles');
    expect(copiedPrompt).toContain('# Full page DOM + computed CSS styles');
    expect(copiedPrompt).toContain('"tag": "section"');
    expect(copiedPrompt).toContain('"text": "Target"');
    expect(copiedPrompt).not.toContain('# Component information');
    expect(copiedPrompt).not.toContain('# App snapshot');

    rendered.destroy();
  });
});
