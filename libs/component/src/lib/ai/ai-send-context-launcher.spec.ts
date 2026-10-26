// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { renderCraftComponent } from '../testing';
import { AiSendContextLauncher } from './ai-send-context-launcher';

afterEach(() => document.body.replaceChildren());

async function launcherFixture() {
  const onOpen = vi.fn();
  const onMove = vi.fn();
  const rendered = await renderCraftComponent(AiSendContextLauncher, {
    props: { onOpen, onMove } as never,
  });
  const launcher =
    rendered.nativeElement.querySelector<HTMLElement>('[data-ai-launcher]')!;
  const handle = launcher.querySelector<HTMLButtonElement>(
    '[data-craft-name="aiMoveLauncher"]',
  )!;
  launcher.getBoundingClientRect = () =>
    ({ left: 500, top: 300, width: 180, height: 40 }) as DOMRect;
  handle.setPointerCapture = vi.fn();
  handle.releasePointerCapture = vi.fn();
  handle.hasPointerCapture = vi.fn(() => true);
  const pointer = (
    type: string,
    x: number,
    y: number,
    target: Element = handle,
  ) =>
    target.dispatchEvent(
      Object.assign(
        new MouseEvent(type, {
          bubbles: true,
          clientX: x,
          clientY: y,
        }),
        { pointerId: 1 },
      ),
    );
  return { rendered, launcher, handle, pointer, onOpen, onMove };
}

it('moves through the grip icon without opening, and still opens on a normal click', async () => {
  const { rendered, launcher, handle, pointer, onOpen, onMove } =
    await launcherFixture();
  const icon = handle.querySelector('span')!;
  pointer('pointerdown', 600, 320, icon);
  pointer('pointermove', 500, 380);
  pointer('pointerup', 500, 380);
  handle.click();
  expect(onOpen).not.toHaveBeenCalled();
  expect(launcher.style.getPropertyValue('--craft-ai-launcher-right')).toBe(
    `${window.innerWidth - 580}px`,
  );
  expect(launcher.style.getPropertyValue('--craft-ai-launcher-bottom')).toBe(
    `${window.innerHeight - 400}px`,
  );
  expect(onMove).toHaveBeenLastCalledWith({
    right: window.innerWidth - 580,
    bottom: window.innerHeight - 400,
  });
  launcher
    .querySelector<HTMLButtonElement>('[data-craft-name="aiContextLauncher"]')!
    .click();
  expect(onOpen).toHaveBeenCalledOnce();
  rendered.destroy();
});

it('keeps the launcher inside the viewport on a large drag', async () => {
  const { rendered, launcher, pointer } = await launcherFixture();
  pointer('pointerdown', 600, 320);
  pointer('pointermove', -2000, -2000);
  pointer('pointerup', -2000, -2000);
  expect(launcher.style.getPropertyValue('--craft-ai-launcher-right')).toBe(
    `${window.innerWidth - 188}px`,
  );
  expect(launcher.style.getPropertyValue('--craft-ai-launcher-bottom')).toBe(
    `${window.innerHeight - 48}px`,
  );
  pointer('pointerdown', 600, 320);
  pointer('pointermove', 4000, 4000);
  pointer('pointerup', 4000, 4000);
  expect(launcher.style.getPropertyValue('--craft-ai-launcher-right')).toBe(
    '8px',
  );
  expect(launcher.style.getPropertyValue('--craft-ai-launcher-bottom')).toBe(
    '8px',
  );
  rendered.destroy();
});

it('supports arrow keys and restores the application defaults on double-click', async () => {
  const { rendered, launcher, handle, onMove, onOpen } =
    await launcherFixture();
  handle.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
  );
  expect(onMove).toHaveBeenCalledWith({
    right: window.innerWidth - 664,
    bottom: window.innerHeight - 340,
  });
  handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  expect(launcher.style.getPropertyValue('--craft-ai-launcher-right')).toBe('');
  expect(launcher.style.getPropertyValue('--craft-ai-launcher-bottom')).toBe(
    '',
  );
  expect(onMove).toHaveBeenLastCalledWith(undefined);
  expect(onOpen).not.toHaveBeenCalled();
  rendered.destroy();
});
