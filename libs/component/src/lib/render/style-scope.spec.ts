import { describe, expect, it } from 'vitest';
import { scopeCss, scopeIdFor, splitUnscopableAtRules } from './style-scope';

describe('Craft CSS scopes', () => {
  it('wraps selectors without inspecting or rewriting them', () => {
    expect(scopeCss('Card', '.value, :is(.x, .y) { color: red; }')).toBe(
      '@scope ([data-craft-root~="Card"]) to ([data-craft-root] *) {\n' +
        '.value, :is(.x, .y) { color: red; }\n}',
    );
  });

  it('keeps nested media rules scoped', () => {
    const result = splitUnscopableAtRules(
      '.card { color: red } @media (min-width: 1px) { .card { color: blue } }',
    );
    expect(result.hoisted).toBe('');
    expect(result.scoped).toContain('@media');
  });

  it('hoists unscopable blocks and import statements', () => {
    const result = splitUnscopableAtRules(
      '@keyframes pulse { from { opacity: 0 } }\n' +
        '@import url("theme.css");\n' +
        '@font-face { font-family: demo; src: url(font.woff2) }\n' +
        '.card { background: url("image.png"); }',
    );
    expect(result.hoisted).toContain('@keyframes pulse');
    expect(result.hoisted).toContain('@import url("theme.css");');
    expect(result.hoisted).toContain('@font-face');
    expect(result.scoped).toBe('.card { background: url("image.png"); }');
  });

  it('ignores at-rule-looking text in strings and comments', () => {
    const result = splitUnscopableAtRules(
      '.x::before { content: "@keyframes fake"; /* @font-face {} */ }',
    );
    expect(result.hoisted).toBe('');
    expect(result.scoped).toContain('@keyframes fake');
  });

  it('returns the same id for a definition and rejects duplicate names', () => {
    const definition = {};
    expect(scopeIdFor(definition, 'Card')).toBe('Card');
    expect(scopeIdFor(definition, 'Card')).toBe('Card');
    expect(() => scopeIdFor({}, 'Card')).toThrow(/already used/);
  });
});
