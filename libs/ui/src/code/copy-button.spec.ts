import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderCraftComponent } from '@craft-ts/component';
import { DocCopyButton } from './copy-button.ts';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('DocCopyButton', () => {
  const render = (text: string) =>
    renderCraftComponent(DocCopyButton as never, {
      props: {
        text: function* () {
          return text;
        },
      } as never,
    });

  it('puts the text on the clipboard and says it did, then goes back to Copy', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const rendered = await render('const a = 1;');
    const button = rendered.element.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toContain('Copy');

    button.click();
    await vi.advanceTimersByTimeAsync(0);
    await rendered.flush();
    expect(writeText).toHaveBeenCalledWith('const a = 1;');
    expect(button.textContent).toContain('Copied');

    await vi.advanceTimersByTimeAsync(2100);
    await rendered.flush();
    expect(button.textContent).toContain('Copy');
    expect(button.textContent).not.toContain('Copied');
    rendered.destroy();
  });

  it('does nothing, quietly, when the clipboard is not available', async () => {
    vi.stubGlobal('navigator', {});
    const rendered = await render('x');
    const button = rendered.element.querySelector('button') as HTMLButtonElement;

    button.click();
    await rendered.flush();
    expect(button.textContent).toContain('Copy');
    expect(button.textContent).not.toContain('Copied');
    rendered.destroy();
  });
});
