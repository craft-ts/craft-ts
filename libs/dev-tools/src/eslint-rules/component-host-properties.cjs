'use strict';

/**
 * The keys a component call reserves for its root (host) element.
 *
 * This mirrors `libs/component/src/lib/render/host-properties.ts`, the module
 * the `@craft-ts/component` runtime uses to split a component call's props into
 * host properties and inputs. `@craft-ts/dev-tools` does not depend on
 * `@craft-ts/component` at run time, so the vocabulary is mirrored here and
 * `no-reserved-component-input-name.spec.ts` checks that both classifications
 * stay identical. Change both files together.
 */

const HOST_EVENT_NAMES = new Set([
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

const HOST_PROPERTY_NAMES = new Set([
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

const HOST_ATTRIBUTE_PREFIXES = ['data-', 'aria-'];

/**
 * Why a component call sends `key` to its root element, or `undefined` when
 * the key reaches the component as an input.
 *
 * @returns {'property' | 'attribute' | 'event' | undefined}
 */
function hostPropertyKind(key) {
  if (HOST_PROPERTY_NAMES.has(key)) return 'property';
  if (HOST_ATTRIBUTE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    return 'attribute';
  }
  if (HOST_EVENT_NAMES.has(key)) return 'event';
  if (
    /^on[A-Z]/.test(key) &&
    HOST_EVENT_NAMES.has(`${key[2].toLowerCase()}${key.slice(3)}`)
  ) {
    return 'event';
  }
  return undefined;
}

function isComponentHostPropertyName(key) {
  return hostPropertyKind(key) !== undefined;
}

module.exports = {
  HOST_EVENT_NAMES,
  HOST_PROPERTY_NAMES,
  HOST_ATTRIBUTE_PREFIXES,
  hostPropertyKind,
  isComponentHostPropertyName,
};
