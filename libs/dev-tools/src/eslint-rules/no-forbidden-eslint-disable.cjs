const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_POLICY_FILE = '.craft/eslint-disable-policy.json';

/**
 * Rules that may be disabled, but never silently.
 *
 * The design system is the only way to style a component; bypassing it stays
 * possible for a third-party widget or rendered markdown, but the directive
 * must say why — `eslint-disable-next-line craft-ts/no-raw-class -- reason` —
 * because that reason is what the reviewer decides on in Review Attest.
 */
const REASON_REQUIRED_RULES = [
  'craft-ts/no-raw-class',
  'craft-ts/no-inline-style',
  'craft-ts/no-component-css',
  'craft-ts/no-raw-css-value',
  'craft-ts/no-free-has',
  'craft-ts/style-file-boundary',
];

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
          reasonRequiredRules: {
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
      missingReason:
        "Disabling '{{rule}}' bypasses the design system and needs a reason: add ' -- <why>' to the directive. The reason is what the reviewer decides on in Review Attest.",
      invalidPolicy:
        "The ESLint disable policy '{{file}}' is invalid: {{reason}}.",
    },
  },

  create(context) {
    const options = context.options[0] || {};
    const cwd = context.getCwd ? context.getCwd() : process.cwd();
    const file = path.resolve(cwd, options.file || DEFAULT_POLICY_FILE);
    let forbiddenRules = options.forbiddenRules;
    let reasonRequired = options.reasonRequiredRules ?? REASON_REQUIRED_RULES;

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
          if (Array.isArray(parsed.reasonRequiredRules)) {
            reasonRequired = [
              ...reasonRequired,
              ...parsed.reasonRequiredRules.filter(
                (rule) => typeof rule === 'string',
              ),
            ];
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
    const needsReason = new Set(reasonRequired.map((rule) => rule.trim()));
    if (protectedRules.size === 0 && needsReason.size === 0) return {};

    const sourceCode = context.sourceCode || context.getSourceCode();
    for (const comment of sourceCode.getAllComments()) {
      const match = /^\s*eslint-disable(?:(-next-line)|(-line))?(?:\s|$)/i.exec(
        comment.value,
      );
      if (!match) continue;

      const [rulesPart, ...reasonParts] = comment.value
        .slice(match[0].length)
        .split(/\s--(?:\s|$)/);
      const rulesText = rulesPart.trim();
      const reason = reasonParts.join(' -- ').trim();
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
      if (reason) continue;
      // A blanket `eslint-disable` is not checked here: it silences this rule
      // too, from the directive on, so a report on it would be swallowed.
      // Review Attest lists blanket directives instead.
      const unexplained = requested.includes('*')
        ? []
        : requested.filter(
            (rule) => needsReason.has(rule) && !protectedRules.has(rule),
          );
      for (const rule of unexplained) {
        context.report({
          loc: comment.loc,
          messageId: 'missingReason',
          data: { rule },
        });
      }
    }

    return {};
  },
};
