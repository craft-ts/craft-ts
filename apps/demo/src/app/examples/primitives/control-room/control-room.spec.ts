// @vitest-environment jsdom
import { CraftTestBed, ɵInjector as Injector } from '@craft-ts/core';
import { mountCraftComponent } from '@craft-ts/component';
import { beforeEach, describe, expect, it } from 'vitest';
import { ControlRoom } from './control-room';

function mount() {
  const element = document.createElement('div');
  document.body.append(element);
  const mounted = mountCraftComponent(
    ControlRoom,
    element,
    CraftTestBed.inject(Injector),
  );
  CraftTestBed.tick();
  return { element, mounted };
}

const buttonByText = (root: HTMLElement, text: string) =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent?.trim() === text,
  )!;
const activity = (root: HTMLElement) =>
  root.querySelector('[data-testid="control-room-activity"]')?.textContent;

describe('ControlRoom', () => {
  beforeEach(() => {
    CraftTestBed.resetTestingModule();
    document.body.replaceChildren();
    CraftTestBed.configureTestingModule({});
  });

  it('mounts one bay of every instrument', () => {
    const { element, mounted } = mount();
    expect(element.querySelectorAll('[role="switch"]')).toHaveLength(10);
    expect(element.querySelectorAll('input[type="range"]')).toHaveLength(6);
    expect(element.querySelectorAll('input[type="text"]')).toHaveLength(6);
    expect(element.querySelectorAll('[role="tablist"]')).toHaveLength(2);
    expect(element.querySelectorAll('[role="checkbox"]')).toHaveLength(12);
    expect(
      element.querySelectorAll('[data-testid="control-room-disclosure"]'),
    ).toHaveLength(6);
    expect(element.textContent).toContain('Boiler A');
    expect(element.textContent).toContain('64 °C');
    expect(activity(element)).toBe('No interaction yet');
    mounted.destroy();
  });

  it('counts interactions from any instrument on the page', () => {
    const { element, mounted } = mount();
    buttonByText(element, '+').click();
    element.querySelector<HTMLButtonElement>('[role="switch"]')!.click();
    CraftTestBed.tick();
    expect(element.textContent).toContain('65 °C');
    expect(
      element.querySelector('[role="switch"]')?.getAttribute('aria-checked'),
    ).toBe('true');
    expect(activity(element)).toBe('2 interactions');
    mounted.destroy();
  });

  it('moves a gauge with its buttons and a slider with its range', () => {
    const { element, mounted } = mount();
    buttonByText(element, '+').click();
    buttonByText(element, '+').click();
    CraftTestBed.tick();
    expect(element.textContent).toContain('66 °C');
    buttonByText(element, 'Reset').click();
    CraftTestBed.tick();
    expect(element.textContent).toContain('64 °C');
    const range = element.querySelector<HTMLInputElement>(
      'input[type="range"]',
    )!;
    range.value = '91';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    CraftTestBed.tick();
    expect(element.textContent).toContain('Valve 1 · 91');
    expect(element.textContent).toContain('Above the 80 limit');
    mounted.destroy();
  });

  it('switches every gauge to imperial units', () => {
    const { element, mounted } = mount();
    buttonByText(element, 'Imperial').click();
    CraftTestBed.tick();
    expect(element.textContent).toContain('64 °F');
    expect(element.textContent).toContain('6 psi');
    expect(element.textContent).not.toContain('°C');
    mounted.destroy();
  });

  it('mounts the instruments of the selected tab and removes them when it is left', () => {
    const { element, mounted } = mount();
    const tabs = element
      .querySelector('[role="tablist"]')!
      .querySelectorAll<HTMLButtonElement>('button');
    tabs[1].click();
    CraftTestBed.tick();
    expect(element.textContent).toContain('Boiler outlet');
    tabs[2].click();
    CraftTestBed.tick();
    expect(element.textContent).not.toContain('Boiler outlet');
    expect(element.textContent).toContain('Pump 1: off');
    mounted.destroy();
  });

  it('keeps a stepper within its four steps', () => {
    const { element, mounted } = mount();
    const next = buttonByText(element, 'Next');
    const back = buttonByText(element, 'Back');
    expect(back.disabled).toBe(true);
    for (let i = 0; i < 5; i++) next.click();
    CraftTestBed.tick();
    expect(element.textContent).toContain('Step 4 of 4');
    expect(next.disabled).toBe(true);
    mounted.destroy();
  });

  it('proves every remaining instrument action through the page', () => {
    const { element, mounted } = mount();

    buttonByText(element, '−').click();
    CraftTestBed.tick();
    expect(element.textContent).toContain('63 °C');

    element.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click();
    CraftTestBed.tick();
    expect(
      element.querySelector('[role="checkbox"]')?.getAttribute('aria-checked'),
    ).toBe('true');

    element.querySelector<HTMLButtonElement>('[aria-label="Choose #ef4444"]')!.click();
    CraftTestBed.tick();
    expect(element.textContent).toContain('Signal colour #ef4444');

    element
      .querySelector<HTMLButtonElement>('[data-testid="control-room-disclosure"]')!
      .click();
    CraftTestBed.tick();
    expect(element.textContent).toContain(
      'Open the feed, purge, then light the pilot.',
    );

    buttonByText(element, 'Next').click();
    CraftTestBed.tick();
    buttonByText(element, 'Back').click();
    CraftTestBed.tick();
    expect(element.textContent).toContain('Step 1 of 4');

    const field = element.querySelector<HTMLInputElement>('input[type="text"]')!;
    field.value = 'Shift A';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    CraftTestBed.tick();
    expect(element.textContent).toContain('17 characters left');

    element.querySelector<HTMLButtonElement>('[aria-label="Rate 5"]')!.click();
    CraftTestBed.tick();
    expect(element.textContent).toContain('5 / 5');
    mounted.destroy();
  });
});
