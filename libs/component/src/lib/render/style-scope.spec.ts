import { describe, expect, it } from 'vitest';
import {
  scopeCss,
  scopeIdFor,
  splitUnscopableAtRules,
  validateStyleScope,
} from './style-scope';

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

  it('requires private global names to use the component scope', () => {
    expect(() =>
      validateStyleScope('Spinner', '@keyframes spin { to { rotate: 1turn } }'),
    ).toThrow(/Rename it "Spinner-spin"/);
    expect(() =>
      validateStyleScope(
        'Spinner',
        '@keyframes Spinner-spin { to { rotate: 1turn } }',
      ),
    ).not.toThrow();
  });

  it('rejects global selectors and imports', () => {
    expect(() => validateStyleScope('Card', ':root { --x: red }')).toThrow(
      /not allowed/,
    );
    expect(() => validateStyleScope('Card', '@import "theme.css";')).toThrow(
      /@import is global/,
    );
  });

  it('keeps owned property names public but rejects foreign registrations', () => {
    const owned = `
      @property --meter-value {
        syntax: '<number>';
        inherits: true;
        initial-value: 0;
      }
      .bar { width: calc(var(--meter-value) * 1%); }
    `;
    expect(() => validateStyleScope('Meter', owned)).not.toThrow();
    expect(scopeCss('Meter', owned)).toContain('@property --meter-value');
    expect(() =>
      validateStyleScope(
        'Meter',
        '@property --shared-value { syntax: "*"; inherits: true; initial-value: 0; }',
      ),
    ).toThrow(/not owned/);
  });

  it('rejects non-inheriting properties used by the component contract', () => {
    expect(() =>
      validateStyleScope(
        'Meter',
        '@property --meter-value { syntax: "*"; inherits: false; initial-value: 0; } .x { width: var(--meter-value) }',
      ),
    ).toThrow(/cannot be supplied or forwarded/);
  });
});
