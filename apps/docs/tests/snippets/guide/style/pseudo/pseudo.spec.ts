import { describe, expect, it } from 'vitest';
import { registeredAtoms, registeredKeyframes } from '@craft-ts/style';
import { renderCss } from '@craft-ts/style/vite';

// #region pseudo
import {
  bg,
  blockSize,
  craftStyles,
  cssString,
  defineStateAxis,
  display,
  inlineSize,
  palette,
  pseudo,
  radii,
  radius,
  unit,
  when,
} from '@craft-ts/style';

export const status = defineStateAxis('status', ['failed']);

export const indicator = craftStyles('indicator', {
  root: [
    display.inlineFlex,
    pseudo.before([
      // Without `content`, ::before is never generated — a type error here.
      pseudo.content.empty,
      display.block,
      inlineSize(unit.rem(0.5)),
      blockSize(unit.rem(0.5)),
      radius(radii.full),
      bg(palette.accent.info),
      when(status.failed, [
        pseudo.content.text(cssString('⚠')),
        bg(palette.accent.danger),
      ]),
    ]),
  ],
});
// #endregion pseudo

// #region keyframes
import { animate, easing, keyframes, rotate } from '@craft-ts/style';

export const spin = keyframes('spin', {
  from: [rotate(unit.deg(0))],
  to: [rotate(unit.deg(360))],
});

export const spinner = craftStyles('spinner', {
  root: [
    ...animate(spin, {
      duration: unit.ms(800),
      easing: easing.linear,
      iterations: 'infinite',
    }),
  ],
});
// #endregion keyframes

// #region transitions
import { prop, transitions } from '@craft-ts/style';

export const button = craftStyles('button', {
  root: [
    ...transitions([prop.backgroundColor, prop.color], {
      duration: unit.ms(150),
      easing: easing.easeOut,
    }),
  ],
});
// #endregion transitions

describe('guide/style/pseudo-elements.md', () => {
  const css = () =>
    renderCss(registeredAtoms(), [], { keyframes: registeredKeyframes() });

  it('ends the selector with the pseudo-element, after the state', () => {
    expect(css()).toMatch(/\[data-status='failed'\]::before\{content:"⚠"\}/);
  });

  it('emits the keyframes and plays them by token', () => {
    expect(css()).toContain('@keyframes spin{');
    expect(css()).toContain('{animation-name:spin}');
  });

  it('names the transitioned properties', () => {
    expect(css()).toContain('{transition-property:background-color, color}');
  });
});
