const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_POLICY_FILE = '.craft/eslint-disable-policy.json';

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid disabling ESLint rules protected by the project review policy.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          file: { type: 'string', minLength: 1 },
          forbiddenRules: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      forbidden:
        "The ESLint rule '{{rule}}' is protected and must not be disabled. Remove this eslint-disable directive before reviewing the application.",
      invalidPolicy:
        "The ESLint disable policy '{{file}}' is invalid: {{reason}}.",
    },
  },

  create(context) {
    const options = context.options[0] || {};
    const cwd = context.getCwd ? context.getCwd() : process.cwd();
    const file = path.resolve(cwd, options.file || DEFAULT_POLICY_FILE);
    let forbiddenRules = options.forbiddenRules;

    if (!forbiddenRules) {
      try {
        if (fs.existsSync(file)) {
          const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
          if (
            !parsed ||
            (parsed.forbiddenRules !== undefined &&
              !Array.isArray(parsed.forbiddenRules))
          ) {
            throw new Error('forbiddenRules must be an array when provided');
          }
          if (parsed.forbidAll === true) {
            if (!Array.isArray(parsed.appliedRules)) {
              throw new Error('appliedRules must be an array when forbidAll is true');
            }
            const allowedRules = new Set(
              Array.isArray(parsed.allowedRules)
                ? parsed.allowedRules.filter((rule) => typeof rule === 'string')
                : [],
            );
            forbiddenRules = parsed.appliedRules.filter(
              (rule) => typeof rule === 'string' && !allowedRules.has(rule),
            );
          } else {
            forbiddenRules = parsed.forbiddenRules || [];
          }
        } else {
          forbiddenRules = [];
        }
      } catch (error) {
        context.report({
          loc: { line: 1, column: 0 },
          messageId: 'invalidPolicy',
          data: {
            file,
            reason: error instanceof Error ? error.message : String(error),
          },
        });
        forbiddenRules = [];
      }
    }

    const protectedRules = new Set(
      forbiddenRules
        .filter((rule) => typeof rule === 'string')
        .map((rule) => rule.trim())
        .filter(Boolean),
    );
    if (protectedRules.size === 0) return {};

    const sourceCode = context.sourceCode || context.getSourceCode();
    for (const comment of sourceCode.getAllComments()) {
      const match = /^\s*eslint-disable(?:(-next-line)|(-line))?(?:\s|$)/i.exec(
        comment.value,
      );
      if (!match) continue;

      const rulesText = comment.value
        .slice(match[0].length)
        .split(/\s+--\s+/, 1)[0]
        .trim();
      const requested = rulesText
        ? rulesText.split(/[\s,]+/).filter(Boolean)
        : ['*'];
      const forbidden = requested.includes('*')
        ? [...protectedRules]
        : requested.filter((rule) => protectedRules.has(rule));
      for (const rule of forbidden) {
        context.report({
          loc: comment.loc,
          messageId: 'forbidden',
          data: { rule },
        });
      }
    }

    return {};
  },
};
