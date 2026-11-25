/**
 * The vocabulary a component call reserves for its host (root) element.
 *
 * A key of `Component({ ... })` that this module classifies as a host property
 * goes to the root element (as an attribute, a property or an event listener),
 * never to the component's inputs. The `craft-ts/no-reserved-component-input-name`
 * ESLint rule (`libs/dev-tools/src/eslint-rules/component-host-properties.cjs`)
 * mirrors this classification so a component cannot declare an input it would
 * never receive; the rule's spec checks that both stay identical. Keep this
 * module free of imports and change both files together.
 */

/** DOM events a template binds by name (`click`) or as `onClick`. */
export const HOST_EVENT_NAMES: ReadonlySet<string> = new Set([
  'abort',
  'blur',
  'change',
  'click',
  'contextmenu',
  'dblclick',
  'error',
  'focus',
  'input',
  'keydown',
  'keypress',
  'keyup',
  'load',
  'mousedown',
  'mouseenter',
  'mouseleave',
  'mousemove',
  'mouseout',
  'mouseover',
  'mouseup',
  'paste',
  'pointerdown',
  'pointerenter',
  'pointerleave',
  'pointermove',
  'pointerup',
  'reset',
  'scroll',
  'submit',
  'touchend',
  'touchmove',
  'touchstart',
]);

/** Global HTML attributes a component call forwards to its root element. */
export const HOST_PROPERTY_NAMES: ReadonlySet<string> = new Set([
  'accessKey',
  'autocapitalize',
  'autofocus',
  'class',
  'contentEditable',
  'dir',
  'draggable',
  'hidden',
  'id',
  'inert',
  'lang',
  'nonce',
  'slot',
  'spellcheck',
  'style',
  'tabIndex',
  'title',
  'translate',
  'attrs',
  'directives',
]);

/** Prefixes of attribute names a component call forwards to its root element. */
export const HOST_ATTRIBUTE_PREFIXES: readonly string[] = ['data-', 'aria-'];

/**
 * Whether a key of a component call belongs to the host element rather than
 * to the component's inputs.
 */
export function isComponentHostPropertyName(key: string): boolean {
  return (
    HOST_PROPERTY_NAMES.has(key) ||
    HOST_ATTRIBUTE_PREFIXES.some((prefix) => key.startsWith(prefix)) ||
    HOST_EVENT_NAMES.has(key) ||
    (/^on[A-Z]/.test(key) &&
      HOST_EVENT_NAMES.has(`${key[2].toLowerCase()}${key.slice(3)}`))
  );
}
