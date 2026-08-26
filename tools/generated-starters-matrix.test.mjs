import assert from 'node:assert/strict';
import test from 'node:test';

import {
  backends,
  cells,
  cellsForProfile,
  features,
  frontends,
  releaseCells,
} from './generated-starters-matrix.mjs';

test('defines the complete 48-cell starter matrix', () => {
  assert.equal(frontends.length, 2);
  assert.equal(backends.length, 3);
  assert.equal(features.length, 8);
  assert.equal(cells.length, 48);
  assert.equal(new Set(cells.map((cell) => JSON.stringify(cell))).size, 48);
});

test('defines the 13-cell release smoke matrix', () => {
  assert.equal(releaseCells.length, 13);
  assert.equal(
    new Set(releaseCells.map((cell) => JSON.stringify(cell))).size,
    13,
  );

  assert.deepEqual(
    releaseCells
      .slice(0, 6)
      .map(({ frontendRuntime, backendRuntime }) => [
        frontendRuntime,
        backendRuntime,
      ]),
    [
      ['plain', 'none'],
      ['plain', 'promise'],
      ['plain', 'effect'],
      ['effect', 'none'],
      ['effect', 'promise'],
      ['effect', 'effect'],
    ],
  );
  assert.equal(
    new Set(
      releaseCells
        .slice(6)
        .map(({ i18n, designSystem, typedCss }) =>
          JSON.stringify({ i18n, designSystem, typedCss }),
        ),
    ).size,
    7,
  );
});

test('selects a full-matrix cell by its stable one-based index', () => {
  assert.deepEqual(cellsForProfile('full', 1), [cells[0]]);
  assert.deepEqual(cellsForProfile('static', 48), [cells[47]]);
});
