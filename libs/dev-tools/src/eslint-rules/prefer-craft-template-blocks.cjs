const TEMPLATE_CONTROL_FLOW = new Set([
  'IfStatement',
  'SwitchStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'TryStatement',
]);

const DOM_EVENT_NAMES = new Set([
  'abort',
  'animationcancel',
  'animationend',
  'animationiteration',
  'animationstart',
  'auxclick',
  'beforeinput',
  'beforematch',
  'beforetoggle',
  'blur',
  'cancel',
  'canplay',
  'canplaythrough',
  'change',
  'click',
  'close',
  'compositionend',
  'compositionstart',
  'compositionupdate',
  'contextmenu',
  'copy',
  'cuechange',
  'cut',
  'dblclick',
  'drag',
  'dragend',
  'dragenter',
  'dragleave',
  'dragover',
  'dragstart',
  'drop',
  'durationchange',
  'emptied',
  'ended',
  'error',
  'focus',
  'formdata',
  'fullscreenchange',
  'fullscreenerror',
  'gotpointercapture',
  'input',
  'invalid',
  'keydown',
  'keypress',
  'keyup',
  'load',
  'loadeddata',
  'loadedmetadata',
  'loadstart',
  'lostpointercapture',
  'mousedown',
  'mouseenter',
  'mouseleave',
  'mousemove',
  'mouseout',
  'mouseover',
  'mouseup',
  'paste',
  'pause',
  'play',
  'playing',
  'pointercancel',
  'pointerdown',
  'pointerenter',
  'pointerleave',
  'pointermove',
  'pointerout',
  'pointerover',
  'pointerup',
  'progress',
  'ratechange',
  'reset',
  'resize',
  'scroll',
  'scrollend',
  'securitypolicyviolation',
  'seeked',
  'seeking',
  'select',
  'selectionchange',
  'selectstart',
  'slotchange',
  'stalled',
  'submit',
  'suspend',
  'timeupdate',
  'toggle',
  'touchcancel',
  'touchend',
  'touchmove',
  'touchstart',
  'transitioncancel',
  'transitionend',
  'transitionrun',
  'transitionstart',
  'volumechange',
  'waiting',
  'wheel',
]);

module.exports = {
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: {
      description:
        'Keep Craft component templates declarative by using typed Craft blocks instead of inline logic.',
    },
    schema: [],
    messages: {
      ternary:
        'Do not use a ternary in a Craft template. Use ifNode(...) for boolean visibility or matchNode.exhaustive(...) for a discriminated union.',
      logical:
        'Do not use a logical expression in a Craft template. Move the derivation to state, query, or craftComputed, then render it with a Craft block.',
      negation:
        'Do not use negation in a Craft template. Move the boolean derivation to state, query, or craftComputed, then bind the resulting value.',
      controlFlow:
        'Do not use imperative control flow in a Craft template. Use ifNode(...), matchNode.exhaustive(...), forNode(...), or deferNode(...) so the render contract stays type-checkable.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      CallExpression(node) {
        if (
          node.callee.type !== 'Identifier' ||
          node.callee.name !== 'craftComponent' ||
          node.arguments.length < 4
        ) {
          return;
        }

        inspectTemplate(node.arguments[3]);
      },
    };

    function inspectTemplate(template) {
      walk(template, (node) => {
        if (node !== template && isNestedCraftComponent(node)) {
          return 'skip';
        }

        if (isTemplatePipe(node)) {
          return 'skip';
        }

        if (node.type === 'ConditionalExpression') {
          const replacement = conditionalReplacement(node);
          context.report({
            node,
            messageId: 'ternary',
            ...(replacement === undefined
              ? {}
              : {
                  fix: (fixer) =>
                    [
                      fixer.replaceText(replacement.node, replacement.text),
                      namedImportFix(fixer, 'ifNode'),
                    ].filter(Boolean),
                }),
          });
          return;
        }

        if (node.type === 'LogicalExpression') {
          context.report({ node, messageId: 'logical' });
          return;
        }

        if (node.type === 'UnaryExpression' && node.operator === '!') {
          context.report({ node, messageId: 'negation' });
          return;
        }

        if (TEMPLATE_CONTROL_FLOW.has(node.type)) {
          const replacement =
            node.type === 'SwitchStatement'
              ? switchReplacement(node)
              : undefined;
          context.report({
            node,
            messageId: 'controlFlow',
            ...(replacement === undefined
              ? {}
              : {
                  fix: (fixer) =>
                    [
                      fixer.replaceText(node, replacement),
                      namedImportFix(fixer, 'matchNode'),
                    ].filter(Boolean),
                }),
          });
        }
      });
    }

    function walk(node, visit) {
      if (!node || typeof node.type !== 'string') {
        return;
      }

      if (visit(node) === 'skip') {
        return;
      }

      // Event handlers are imperative by design: they react to a user action
      // after rendering and may legitimately branch before triggering a
      // mutation or another command. Keep the declarative restriction on
      // render-time expressions while leaving event callbacks executable.
      if (isEventProperty(node)) {
        return;
      }

      const keys = sourceCode.visitorKeys[node.type] ?? [];
      for (const key of keys) {
        const child = node[key];
        if (Array.isArray(child)) {
          for (const item of child) {
            walk(item, visit);
          }
        } else {
          walk(child, visit);
        }
      }
    }

    function conditionalReplacement(node) {
      const condition = conditionName(node.test);
      if (condition === undefined || !isRenderablePosition(node)) {
        return undefined;
      }

      const text = `ifNode(${condition}, () => ${sourceCode.getText(
        node.consequent,
      )}, () => ${sourceCode.getText(node.alternate)})`;
      const parent = node.parent;
      if (
        parent?.type === 'ArrowFunctionExpression' &&
        parent.body === node &&
        isRenderableArrow(parent)
      ) {
        return { node: parent, text };
      }

      return { node, text };
    }

    function switchReplacement(node) {
      const match = switchMatch(node);
      if (match === undefined) {
        return undefined;
      }

      const handlers = match.cases
        .map(
          ({ key, expression }) =>
            `${formatObjectKey(key)}: () => ${expression}`,
        )
        .join(', ');
      return `return matchNode.exhaustive(${match.source}, ${JSON.stringify(
        match.key,
      )}, { ${handlers} });`;
    }

    function switchMatch(node) {
      if (node.cases.some((switchCase) => switchCase.test === null)) {
        return undefined;
      }

      const cases = [];
      for (const switchCase of node.cases) {
        if (
          switchCase.test.type !== 'Literal' ||
          (typeof switchCase.test.value !== 'string' &&
            typeof switchCase.test.value !== 'number')
        ) {
          return undefined;
        }

        const statements = switchCase.consequent.filter(
          (statement) => statement.type !== 'BreakStatement',
        );
        if (
          statements.length !== 1 ||
          statements[0].type !== 'ReturnStatement' ||
          statements[0].argument === null
        ) {
          return undefined;
        }

        cases.push({
          key: switchCase.test.value,
          expression: sourceCode.getText(statements[0].argument),
        });
      }

      const discriminant = node.discriminant;
      if (
        discriminant.type === 'MemberExpression' &&
        !discriminant.computed &&
        discriminant.property.type === 'Identifier'
      ) {
        const object = sourceCode.getText(discriminant.object);
        return {
          source: needsFunctionSource(discriminant.object)
            ? `() => ${object}`
            : object,
          key: discriminant.property.name,
          cases,
        };
      }

      return {
        source: `() => ({ value: ${sourceCode.getText(discriminant)} })`,
        key: 'value',
        cases,
      };
    }

    function namedImportFix(fixer, name) {
      const declaration = sourceCode.ast.body.find(
        (statement) =>
          statement.type === 'ImportDeclaration' &&
          statement.importKind !== 'type' &&
          statement.source.value === '@craft-ts/component',
      );

      if (declaration === undefined) {
        const firstStatement = sourceCode.ast.body[0];
        return fixer.insertTextBefore(
          firstStatement ?? sourceCode.ast,
          `import { ${name} } from '@craft-ts/component';\n`,
        );
      }

      if (
        declaration.specifiers.some(
          (specifier) =>
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.type === 'Identifier' &&
            specifier.imported.name === name,
        )
      ) {
        return undefined;
      }

      const namedSpecifiers = declaration.specifiers.filter(
        (specifier) => specifier.type === 'ImportSpecifier',
      );
      if (namedSpecifiers.length > 0) {
        return fixer.insertTextAfter(
          namedSpecifiers[namedSpecifiers.length - 1],
          `, ${name}`,
        );
      }

      return fixer.insertTextAfter(
        declaration,
        `\nimport { ${name} } from '@craft-ts/component';`,
      );
    }
  },
};

function conditionName(node) {
  if (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.arguments.length === 0
  ) {
    return node.callee.name;
  }

  return undefined;
}

function isRenderablePosition(node) {
  const parent = node.parent;
  if (parent === undefined) {
    return false;
  }

  if (parent.type === 'ArrayExpression') {
    return true;
  }

  if (parent.type === 'ReturnStatement') {
    return true;
  }

  if (parent.type === 'CallExpression') {
    return parent.arguments.includes(node);
  }

  return (
    parent.type === 'ArrowFunctionExpression' &&
    parent.body === node &&
    isRenderableArrow(parent)
  );
}

function isRenderableArrow(node) {
  const parent = node.parent;
  if (parent?.type === 'ArrayExpression') {
    return true;
  }

  if (parent?.type !== 'CallExpression') {
    return false;
  }

  const callee = parent.callee;
  if (callee.type !== 'Identifier') {
    return false;
  }

  return !new Set([
    'forNode',
    'deferNode',
    'content',
    'craftTemplate',
    'renderTemplate',
    'renderContent',
  ]).has(callee.name);
}

function needsFunctionSource(node) {
  return node.type === 'CallExpression';
}

function formatObjectKey(value) {
  return typeof value === 'string' && /^[A-Za-z_$][\w$]*$/.test(value)
    ? value
    : JSON.stringify(value);
}

function isNestedCraftComponent(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'craftComponent'
  );
}

function isEventProperty(node) {
  if (node.type !== 'Property' || node.computed) {
    return false;
  }

  const propertyName =
    node.key.type === 'Identifier'
      ? node.key.name
      : node.key.type === 'Literal' && typeof node.key.value === 'string'
        ? node.key.value
        : undefined;

  return Boolean(
    propertyName &&
      (DOM_EVENT_NAMES.has(propertyName) || /^on[A-Z]/.test(propertyName)),
  );
}

function isTemplatePipe(node) {
  if (node.type !== 'CallExpression') {
    return false;
  }

  if (node.callee.type === 'Identifier') {
    return node.callee.name === 'pipe';
  }

  return (
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === 'pipe'
  );
}
