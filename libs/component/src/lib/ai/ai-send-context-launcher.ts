import { drag, type CraftPointerGesture } from '@craft-ts/core';
import { assign, unit } from '@craft-ts/style';
import { craftComponent } from '../component';
import { button, div, span } from '../hyperscript';
import type { CraftComponent, Input, Output } from '../types';
import {
  aiLauncher,
  aiTheme,
  craftAiLauncherPosition,
} from './ai-overlay.style';

/** Viewport distances, in CSS pixels, after the user moves the launcher. */
export interface AiLauncherPosition {
  readonly right: number;
  readonly bottom: number;
}

/** Default launcher; its separate handle keeps moving distinct from opening. */
export const AiSendContextLauncher: CraftComponent<{
  onOpen: Output<() => void>;
  onMove?: Output<(position: AiLauncherPosition | undefined) => void>;
  label?: string;
}> = craftComponent(
  'AiSendContextLauncher',
  {},
  function* (inputs: {
    readonly onOpen: Output<() => void>;
    readonly onMove: Output<(position: AiLauncherPosition | undefined) => void>;
    readonly label: Input<string | undefined>;
  }) {
    const readLabel = function* () {
      return typeof inputs.label === 'function'
        ? ((yield* inputs.label()) ?? 'Report')
        : 'Report';
    };
    let origin: DOMRect | undefined;
    const launcherOf = (handle: Element) =>
      handle.closest<HTMLElement>('[data-ai-launcher]');

    const move = (launcher: HTMLElement, left: number, top: number): void => {
      const rect = launcher.getBoundingClientRect();
      const margin = 8;
      const position = {
        right:
          window.innerWidth -
          rect.width -
          Math.max(
            margin,
            Math.min(left, window.innerWidth - rect.width - margin),
          ),
        bottom:
          window.innerHeight -
          rect.height -
          Math.max(
            margin,
            Math.min(top, window.innerHeight - rect.height - margin),
          ),
      };
      const styles = {
        ...assign(craftAiLauncherPosition.right, unit.px(position.right)),
        ...assign(craftAiLauncherPosition.bottom, unit.px(position.bottom)),
      };
      for (const [name, value] of Object.entries(styles))
        launcher.style.setProperty(name, value);
      inputs.onMove?.(position);
    };

    const reset = (handle: Element): void => {
      const launcher = launcherOf(handle);
      if (!launcher) return;
      launcher.style.removeProperty(
        craftAiLauncherPosition.right.declaration.name,
      );
      launcher.style.removeProperty(
        craftAiLauncherPosition.bottom.declaration.name,
      );
      inputs.onMove?.(undefined);
    };

    return div(
      {
        class: [aiTheme.root, aiLauncher.root],
        'data-ai-launcher': '',
        role: 'group',
        'aria-label': 'AI report controls',
      },
      [
        button(
          'aiContextLauncher',
          {
            type: 'button',
            class: aiLauncher.open,
            title: 'Send context to AI',
            'aria-label': function* () {
              return `Open the AI ${yield* readLabel()} chat`;
            },
            click: () => inputs.onOpen(),
          },
          [span({ 'aria-hidden': 'true' }, '✦'), span(readLabel)],
        ),
        button(
          'aiMoveLauncher',
          {
            type: 'button',
            class: aiLauncher.handle,
            title: 'Drag to move · arrow keys to move · double-click to reset',
            'aria-label': 'Move AI report launcher',
            dblclick: (event: MouseEvent) =>
              reset(event.currentTarget as Element),
            keydown: (event: KeyboardEvent) => {
              const movement: Record<string, readonly [number, number]> = {
                ArrowLeft: [-16, 0],
                ArrowRight: [16, 0],
                ArrowUp: [0, -16],
                ArrowDown: [0, 16],
              };
              const delta = movement[event.key];
              const launcher = launcherOf(event.currentTarget as Element);
              if (!delta || !launcher) return;
              event.preventDefault();
              const rect = launcher.getBoundingClientRect();
              move(launcher, rect.left + delta[0], rect.top + delta[1]);
            },
          },
          span({ 'aria-hidden': 'true' }, '⠿'),
        ).pipe(
          drag({
            dragIgnoreSelector: '[data-craft-no-drag]',
            onDragStart: (_gesture: CraftPointerGesture, handle: Element) => {
              origin = launcherOf(handle)?.getBoundingClientRect();
            },
            onDragPreview: (gesture: CraftPointerGesture, handle: Element) => {
              const launcher = launcherOf(handle);
              if (launcher && origin)
                move(
                  launcher,
                  origin.left + gesture.deltaX,
                  origin.top + gesture.deltaY,
                );
            },
            onDrop: () => {
              origin = undefined;
            },
            onDragCancel: () => {
              origin = undefined;
            },
          }),
        ),
      ],
    );
  },
);
