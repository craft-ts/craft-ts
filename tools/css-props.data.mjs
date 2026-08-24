/**
 * The generator's data, kept out of the generator so that it can be tested and
 * reviewed on its own.
 *
 * EXCLUSIONS are properties the vocabulary must NOT contain. The overflow
 * family is the point of the whole exercise: the only path to `overflow: auto`
 * is `provides(scrollPort.block)`, which lays down the CSS effect and the
 * discharge in the same object. If `overflow` were reachable as a plain
 * property, the wrong fix would merely be discouraged instead of inexpressible.
 */
export const EXCLUSIONS = Object.freeze([
  'overflow',
  'overflow-x',
  'overflow-y',
  'overflow-block',
  'overflow-inline',
  'overflow-clip-margin',
  'container',
  'container-type',
]);

/**
 * The terminal types the generator knows how to close, mapped to the branded
 * value each one accepts. Anything not in this map makes the property
 * uncovered — never a helper taking `string` "for now".
 */
export const TERMINALS = Object.freeze({
  '<length>': 'length',
  '<percentage>': 'percentage',
  '<length-percentage>': 'lengthPercentage',
  '<number>': 'number',
  '<integer>': 'integer',
  '<angle>': 'angle',
  '<time>': 'time',
  '<color>': 'color',
  '<custom-ident>': 'ident',
  '<dashed-ident>': 'ident',
  '<string>': 'string',
  '<url>': 'url',
});

/**
 * Terminal pairs that collapse into a wider terminal rather than making the
 * property uncovered. `<length> | <percentage>` is `<length-percentage>`, which
 * is a real CSS type, not an approximation.
 */
export const TERMINAL_MERGES = Object.freeze({
  'length+percentage': 'lengthPercentage',
  'length+lengthPercentage': 'lengthPercentage',
  'percentage+lengthPercentage': 'lengthPercentage',
  'integer+number': 'number',
  'number+percentage': 'number',
});

/**
 * Properties a human would expect to find in the table. The generator does not
 * use this list; `props.spec.ts` asserts none of them ended up uncovered, so a
 * regression in the grammar reader shows up as a failing test rather than as a
 * helper quietly disappearing.
 */
export const EXPECTED_COVERED = Object.freeze([
  'padding',
  'padding-inline',
  'padding-block',
  'margin-inline',
  'gap',
  'row-gap',
  'column-gap',
  'color',
  'background-color',
  'border-color',
  'border-radius',
  'border-width',
  'border-style',
  'display',
  'position',
  'align-items',
  'justify-content',
  'flex-direction',
  'font-weight',
  'font-size',
  'line-height',
  'opacity',
  'z-index',
  'inline-size',
  'block-size',
  'min-inline-size',
  'max-inline-size',
  'text-align',
  'cursor',
  'visibility',
  'white-space',
  'inset-block-end',
  'inset-inline-start',
]);
