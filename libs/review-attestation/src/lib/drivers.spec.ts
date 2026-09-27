/**
 * The self-state drivers: `:hover`, `:focus`, `:active`, `:disabled`.
 *
 * What matters is that each state is reached by the gesture that really
 * produces the pseudo-class — and that a harness unable to perform it is told
 * so, instead of producing a capture of the base state.
 */
import { interaction } from '@craft-ts/style';
import { describe, expect, it } from 'vitest';
import { applyScenario, type ScenarioPage } from './drivers.ts';
import type { VisualScenario } from './matrix.ts';

const scenarioOf = (
  point: (typeof interaction)[keyof typeof interaction],
): VisualScenario => ({
  id: `${point.axis}=${point.point}`,
  axes: { [point.axis]: point.point },
  drivers: [{ axis: point.axis, point: point.point, driver: point.driver }],
});

const harness = (
  calls: string[],
  capabilities: { hover?: boolean; holdPointer?: boolean } = {},
): ScenarioPage => ({
  setViewportSize: async () => undefined,
  emulateMedia: async () => undefined,
  evaluate: async (body, argument) => {
    calls.push(`evaluate:${body.name}:${JSON.stringify(argument)}`);
  },
  ...(capabilities.hover
    ? {
        hover: async (selector: string) => void calls.push(`hover:${selector}`),
      }
    : {}),
  ...(capabilities.holdPointer
    ? {
        holdPointer: async (selector: string) =>
          void calls.push(`hold:${selector}`),
      }
    : {}),
});

describe('self-state drivers', () => {
  it('focuses the element in the page for :focus', async () => {
    const calls: string[] = [];
    await applyScenario(harness(calls), scenarioOf(interaction.focus), {
      target: '.skip',
    });
    expect(calls).toEqual(['evaluate:applyFocus:{"target":".skip"}']);
  });

  it('holds a real pointer for :active, and refuses a harness without one', async () => {
    const calls: string[] = [];
    await applyScenario(
      harness(calls, { holdPointer: true }),
      scenarioOf(interaction.active),
      { target: '.launcher' },
    );
    expect(calls).toEqual(['hold:.launcher']);
    await expect(
      applyScenario(harness([]), scenarioOf(interaction.active), {
        target: '.launcher',
      }),
    ).rejects.toThrow(/cannot hold a pointer down/);
  });

  it('sets the attribute for :disabled', async () => {
    const calls: string[] = [];
    await applyScenario(harness(calls), scenarioOf(interaction.disabled), {
      target: 'button',
    });
    expect(calls).toEqual([
      'evaluate:applyAttribute:{"target":"button","name":"disabled","value":""}',
    ]);
  });

  it('still moves a pointer for :hover', async () => {
    const calls: string[] = [];
    await applyScenario(
      harness(calls, { hover: true }),
      scenarioOf(interaction.hover),
      { target: 'a' },
    );
    expect(calls).toEqual(['hover:a']);
  });
});
