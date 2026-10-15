/**
 * `require-loop-sleep-or-stop`: a loop driven by `yield*` (or `true`) must
 * suspend on `craftSleep` or have a way out.
 *
 * ```ts
 * while (yield* following()) {
 *   yield* sessions.refresh(); // never suspends on a timer: a hot loop
 * }
 * ```
 *
 * Nothing fails when it runs away: the page keeps working while it re-runs the
 * body as fast as the runtime allows, and the first symptom is a saturated
 * server. `craftSleep` is the suspension the temporal runtime cancels when the
 * owner (the asyncProcess, the component, the service) is destroyed, so a loop
 * that sleeps ends with its owner. A loop without it needs its own exit: a
 * `break`, a `return` or a `throw` in the body.
 */
'use strict';

const FUNCTIONS = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);
const EXITS = new Set(['BreakStatement', 'ReturnStatement', 'ThrowStatement']);

/** Child nodes of `node`, without climbing back to the parent. */
function* children(node) {
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item.type === 'string') yield item;
      }
    } else if (value && typeof value.type === 'string') {
      yield value;
    }
  }
}

/** Walks `node` without entering nested functions; stops when `visit` is true. */
function some(node, visit) {
  if (visit(node)) return true;
  for (const child of children(node)) {
    if (FUNCTIONS.has(child.type)) continue;
    if (some(child, visit)) return true;
  }
  return false;
}

const isCraftSleepCall = (node) =>
  node.type === 'CallExpression' &&
  ((node.callee.type === 'Identifier' && node.callee.name === 'craftSleep') ||
    (node.callee.type === 'MemberExpression' &&
      node.callee.property.type === 'Identifier' &&
      node.callee.property.name === 'craftSleep'));

const isYieldDelegate = (node) =>
  node.type === 'YieldExpression' && node.delegate === true;

const isConstantTrue = (node) =>
  node.type === 'Literal' && (node.value === true || node.value === 1);

function isOpenEnded(loop) {
  if (loop.type === 'ForStatement') {
    return (
      (loop.test === null || isConstantTrue(loop.test) || some(loop.test, isYieldDelegate))
    );
  }
  return isConstantTrue(loop.test) || some(loop.test, isYieldDelegate);
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a loop driven by `yield*` or `true` to suspend on `craftSleep`, or to have a `break`, `return` or `throw`.',
    },
    schema: [],
    messages: {
      hotLoop:
        'This loop never suspends on a timer and has no way out. Add `yield* craftSleep(ms)` to the body — the temporal runtime cancels it when the owner is destroyed, so the loop ends with it — or give the loop a `break`/`return` tied to a stop condition. Without either it re-runs as fast as the runtime allows and floods requests and renders without any error.',
    },
  },

  create(context) {
    function check(loop) {
      if (!isOpenEnded(loop)) return;
      const body = loop.body;
      const sleeps = some(body, isCraftSleepCall);
      if (sleeps) return;
      if (some(body, (node) => EXITS.has(node.type))) return;
      context.report({ node: loop, messageId: 'hotLoop' });
    }
    return {
      WhileStatement: check,
      DoWhileStatement: check,
      ForStatement: check,
    };
  },
};

