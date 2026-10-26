// Everything that schedules work or reads a clock must go through the Craft
// temporal runtime: replay drives a virtual clock, and a session resumed live
// recalibrates time. A single direct read is enough to make both diverge.
const TEMPORAL_GLOBALS = new Set([
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'setImmediate',
  'clearImmediate',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
]);

// `Date` stays usable for what does not read the current time.
const SAFE_DATE_MEMBERS = new Set(['parse', 'UTC', 'prototype']);
// `performance` stays usable for instrumentation; only its clocks are banned.
const PERFORMANCE_CLOCK_MEMBERS = new Set(['now', 'timeOrigin']);
const GLOBAL_OBJECTS = new Set(['globalThis', 'window', 'self']);

const RUNTIME_HINT = 'Use the Craft temporal runtime instead.';
const CIVIL_TIME_HINT =
  'Read the civil time from the Craft temporal runtime (dateNow()) instead.';
const MONOTONIC_TIME_HINT =
  'Read the monotonic time from the Craft temporal runtime (now()) instead.';

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow direct timers and clock reads in Craft modules in favour of the Craft temporal runtime.',
    },
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const filename = context.filename ?? '';
    const implementationFile =
      /(?:^|[/\\])temporal-runtime\.[cm]?[jt]sx?$/.test(filename);

    function isGlobalReference(node) {
      let scope = sourceCode.getScope(node);
      while (scope) {
        const reference = scope.references.find(
          (candidate) => candidate.identifier === node,
        );
        if (reference) {
          // Type positions (`let at: Date`) read no clock.
          if (reference.isValueReference === false) return false;
          return (
            reference.resolved == null || reference.resolved.defs.length === 0
          );
        }
        scope = scope.upper;
      }
      return false;
    }

    function memberName(node) {
      if (!node.computed && node.property.type === 'Identifier')
        return node.property.name;
      if (
        node.property.type === 'Literal' &&
        typeof node.property.value === 'string'
      )
        return node.property.value;
      return undefined;
    }

    function report(node, message) {
      context.report({ node, message });
    }

    /** `node` evaluates to the global `name`: a bare identifier or `globalThis.name`. */
    function checkGlobal(node, name) {
      if (TEMPORAL_GLOBALS.has(name)) {
        report(
          node,
          `Direct ${name}(...) is forbidden in Craft modules. ${RUNTIME_HINT}`,
        );
        return;
      }
      if (name === 'Date') checkDate(node);
      else if (name === 'performance') checkPerformance(node);
    }

    function checkDate(node) {
      const parent = node.parent;
      if (parent.type === 'MemberExpression' && parent.object === node) {
        const member = memberName(parent);
        if (member !== undefined && SAFE_DATE_MEMBERS.has(member)) return;
        report(
          parent,
          member === 'now'
            ? `Direct Date.now() is forbidden in Craft modules. ${CIVIL_TIME_HINT}`
            : `Direct Date.${member ?? '[…]'} access is forbidden in Craft modules. ${CIVIL_TIME_HINT}`,
        );
        return;
      }
      if (parent.type === 'NewExpression' && parent.callee === node) {
        if (parent.arguments.length > 0) return;
        report(
          parent,
          `Direct new Date() is forbidden in Craft modules. ${CIVIL_TIME_HINT}`,
        );
        return;
      }
      if (parent.type === 'CallExpression' && parent.callee === node) {
        report(
          parent,
          `Direct Date() is forbidden in Craft modules. ${CIVIL_TIME_HINT}`,
        );
        return;
      }
      if (
        parent.type === 'BinaryExpression' &&
        parent.operator === 'instanceof' &&
        parent.right === node
      )
        return;
      // An alias (`const clock = Date`, `const { now } = Date`, `fn(Date)`)
      // would let the clock be read where the rule cannot see it.
      report(
        node,
        `Passing Date around is forbidden in Craft modules: it escapes the temporal runtime. ${CIVIL_TIME_HINT}`,
      );
    }

    function checkPerformance(node) {
      const parent = node.parent;
      if (parent.type === 'MemberExpression' && parent.object === node) {
        const member = memberName(parent);
        if (member !== undefined && !PERFORMANCE_CLOCK_MEMBERS.has(member))
          return;
        report(
          parent,
          `Direct performance.${member ?? '[…]'} is forbidden in Craft modules. ${MONOTONIC_TIME_HINT}`,
        );
        return;
      }
      report(
        node,
        `Passing performance around is forbidden in Craft modules: it escapes the temporal runtime. ${MONOTONIC_TIME_HINT}`,
      );
    }

    return {
      Identifier(node) {
        if (implementationFile) return;
        if (
          !TEMPORAL_GLOBALS.has(node.name) &&
          node.name !== 'Date' &&
          node.name !== 'performance'
        )
          return;
        // `obj.setTimeout` / `{ setTimeout: … }` name a property, not the global.
        const parent = node.parent;
        if (
          parent.type === 'MemberExpression' &&
          parent.property === node &&
          !parent.computed
        )
          return;
        if (
          (parent.type === 'Property' || parent.type === 'MethodDefinition') &&
          parent.key === node &&
          !parent.computed &&
          parent.value !== node
        )
          return;
        if (!isGlobalReference(node)) return;
        checkGlobal(node, node.name);
      },
      MemberExpression(node) {
        if (
          implementationFile ||
          node.object.type !== 'Identifier' ||
          !GLOBAL_OBJECTS.has(node.object.name) ||
          !isGlobalReference(node.object)
        )
          return;
        const name = memberName(node);
        if (
          name === undefined ||
          (!TEMPORAL_GLOBALS.has(name) &&
            name !== 'Date' &&
            name !== 'performance')
        )
          return;
        checkGlobal(node, name);
      },
    };
  },
};
