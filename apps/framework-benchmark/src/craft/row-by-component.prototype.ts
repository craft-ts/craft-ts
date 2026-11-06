// PROTOTYPE: Does tracking the whole row template reduce mount cost?
// Uses the existing craftComponent component-render effect, without changing
// Core/Component. Its template reads the inputs eagerly and returns plain values.
// Synchronous list fixture only: this is not a new public component strategy API.
import { craftComponent, div, span, type Input } from '@craft-ts/component';
import { craftUse } from '@craft-ts/core';
import { settings } from '../common.js';

export const RowByComponentPrototype = craftComponent(
  // Same name as the reference so render paths are comparable.
  'FrameworkBenchRow',
  {},
  (inputs: {
    row: Input<{ id: number; label: string }>;
    position: Input<number>;
  }) => {
    const row = craftUse(inputs.row());
    const position = settings.indexes ? craftUse(inputs.position()) : 0;
    return div({ 'data-row': row.id }, [
      settings.indexes
        ? span({ 'data-position': position }, `${position + 1}. `)
        : null,
      row.label,
    ]);
  },
);
