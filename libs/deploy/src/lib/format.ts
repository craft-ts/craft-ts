import type { CraftDeploymentDiagnostic } from './diagnostics.js';
import type { CraftDeploymentPlan } from './providers.js';

/**
 * Renders a diagnostic on one line, followed by the correction.
 *
 * The location comes first so an editor or a CI log parser finds the file, and
 * the fix is never dropped: a code without a correction is what makes a check
 * get disabled instead of satisfied.
 */
export function formatCraftDeploymentDiagnostic(
  diagnostic: CraftDeploymentDiagnostic,
): string {
  const location = diagnostic.file
    ? `${diagnostic.file}${diagnostic.line ? `:${diagnostic.line}` : ''}`
    : (diagnostic.path ?? 'craft.deploy');
  const target = [
    diagnostic.runtime && `runtime ${diagnostic.runtime}`,
    diagnostic.platform && `platform ${diagnostic.platform}`,
    diagnostic.provider && `provider ${diagnostic.provider}`,
  ]
    .filter((part): part is string => typeof part === 'string')
    .join(', ');

  const header = `${diagnostic.severity} ${location} ${diagnostic.code}${
    target ? ` (${target})` : ''
  }: ${diagnostic.message}`;
  return `${header}\n  fix: ${diagnostic.fix}`;
}

/**
 * Renders a plan as the approval surface it is: one line per resource, the
 * action first so a `delete` cannot be skimmed past, then the facts that
 * justify it.
 */
export function formatCraftDeploymentPlan(plan: CraftDeploymentPlan): string {
  const lines = [
    `plan: ${plan.provider} → stage ${plan.stage} (${plan.resources.length} resource(s))`,
  ];

  for (const resource of plan.resources) {
    lines.push(
      `  ${resource.action.padEnd(9)} ${resource.type} ${resource.name}`,
    );
    for (const [key, value] of Object.entries(resource.details)) {
      lines.push(`    ${key}: ${value}`);
    }
  }

  for (const note of plan.notes) {
    lines.push(`  note: ${note}`);
  }

  return lines.join('\n');
}
