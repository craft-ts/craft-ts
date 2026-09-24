/**
 * How far the design system has reached in one project.
 *
 * The number the review app shows next to the bypasses: components fully on
 * `@craft-ts/style`, against the components that style anything at all. It is
 * read off the same findings as the `style-only-design-system` architecture
 * rule — one source of truth, so the indicator and the check cannot disagree.
 *
 * A component of pure composition, rendering no class of its own, is left out
 * of the count rather than counted as adopted: it would inflate the number
 * without anything having been migrated.
 */
import { relative } from 'node:path';
import { styleOnlyDesignSystemFindings } from './architecture-style-rules.ts';
import type { DependencyGraph } from './dependency-graph.ts';
import type { StyleAdoption } from '../attestation-review.ts';

export interface StyleAdoptionWaiver {
  readonly rule: string;
  readonly target: string;
  readonly reason: string;
}

export function styleAdoption(
  graph: DependencyGraph,
  options: {
    /** Only components declared under this directory are counted. */
    readonly projectDir?: string;
    readonly waivers?: readonly StyleAdoptionWaiver[];
  } = {},
): StyleAdoption {
  const inProject = (filePath: string | undefined): boolean =>
    options.projectDir === undefined ||
    (filePath !== undefined &&
      !relative(options.projectDir, filePath).startsWith('..'));

  const components = new Set<string>();
  const styling = new Set<string>();
  for (const node of graph.nodes) {
    if (node.kind === 'component' && inProject(node.filePath)) {
      components.add(node.label);
    }
    if (node.kind === 'styled-element' && inProject(node.filePath)) {
      const details = node.details ?? {};
      const component = String(details['component'] ?? '');
      const keys = details['classKeys'];
      if (
        (Array.isArray(keys) && keys.length > 0) ||
        typeof details['unresolvedClass'] === 'string'
      ) {
        styling.add(component);
      }
    }
  }

  const findings = new Map<string, string[]>();
  for (const finding of styleOnlyDesignSystemFindings(graph)) {
    if (!components.has(finding.target)) continue;
    styling.add(finding.target);
    const list = findings.get(finding.target) ?? [];
    list.push(finding.message);
    findings.set(finding.target, list);
  }

  const waivers = (options.waivers ?? []).filter(
    (waiver) => waiver.rule === 'style-only-design-system',
  );
  const wholeRule = waivers.find((waiver) => waiver.target === '*');
  const remaining = [...findings]
    .map(([component, messages]) => {
      const waiver =
        waivers.find((candidate) => candidate.target === component) ??
        wholeRule;
      return {
        component,
        findings: messages,
        ...(waiver ? { waivedBy: waiver.reason } : {}),
      };
    })
    .sort((left, right) => left.component.localeCompare(right.component));

  return {
    styling: styling.size,
    adopted: styling.size - remaining.length,
    composition: [...components].filter((name) => !styling.has(name)).length,
    remaining,
  };
}
