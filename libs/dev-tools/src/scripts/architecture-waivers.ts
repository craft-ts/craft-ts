/**
 * Waivers: the one way to bypass an architecture rule on purpose.
 *
 * A waiver names a rule, a target and a reason. It is declared in the app's
 * `architecture/waivers.ts`, typed against the generated catalog — a target
 * that does not exist does not compile — and Review Attest lists each one for
 * a decision. Two things keep the list honest:
 *
 * - an **empty reason** is refused: the reason is what the reviewer decides on;
 * - a **stale waiver** — one that no longer waives anything — is itself a
 *   violation. The list cannot quietly outlive the code it excused.
 *
 * The per-rule `allow` options that predate this mechanism (`mutation-react-on`
 * for one) keep working; they carry no reason and are due to move here.
 */
import ts from 'typescript';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ArchitectureCatalog } from './architecture-graph.ts';

export const ARCHITECTURE_RULE_NAMES = [
  'craft-unique',
  'http-endpoint-unique',
  'craft-computed-pure',
  'primitive-methods-used-once',
  'no-unused-primitive-methods',
  'no-dependency-cycles',
  'no-event-only-craft-method',
  'server-function-architecture',
  'input-action-forms',
  'mutation-react-on',
  'style-only-design-system',
  'style-obligations-discharged',
  'no-dangling-css-vars',
  'no-global-stylesheet',
] as const;

export type ArchitectureRuleName = (typeof ARCHITECTURE_RULE_NAMES)[number];

/**
 * What a waiver may name.
 *
 * `'*'` waives the whole rule for the app — the only form a rule that reports
 * no target accepts, and the form a project uses while it migrates; it goes
 * stale, and fails, once the rule passes.
 */
export type ArchitectureWaiverTarget<
  C extends ArchitectureCatalog = ArchitectureCatalog,
> =
  | C['components'][number]
  | `file:${string}`
  | `obligation:${string}`
  | `css-var:${string}`
  | 'graph:style-dump'
  | '*';

export interface ArchitectureWaiver<
  C extends ArchitectureCatalog = ArchitectureCatalog,
> {
  readonly rule: ArchitectureRuleName;
  readonly target: ArchitectureWaiverTarget<C>;
  readonly reason: string;
}

/**
 * Types an app's waivers against its catalog. Returns them unchanged; the
 * value of the call is the type check.
 */
export function defineArchitectureWaivers<const C extends ArchitectureCatalog>(
  _catalog: C,
  waivers: readonly ArchitectureWaiver<C>[],
): readonly ArchitectureWaiver<C>[] {
  return waivers;
}

export interface WaivableFinding {
  readonly rule: string;
  readonly target: string;
  readonly message: string;
}

export interface WaiverOutcome {
  readonly violations: readonly WaivableFinding[];
  readonly waived: readonly (WaivableFinding & { readonly reason: string })[];
  /** Waivers refused for themselves: empty reason, stale, unknown rule. */
  readonly problems: readonly string[];
}

export function applyArchitectureWaivers(
  findings: readonly WaivableFinding[],
  waivers: readonly ArchitectureWaiver[],
): WaiverOutcome {
  const problems: string[] = [];
  const valid = waivers.filter((waiver) => {
    const label = `waiver ${waiver.rule} → ${waiver.target}`;
    if (!(ARCHITECTURE_RULE_NAMES as readonly string[]).includes(waiver.rule)) {
      problems.push(`${label}: '${waiver.rule}' is not an architecture rule.`);
      return false;
    }
    if (!waiver.reason || waiver.reason.trim().length === 0) {
      problems.push(
        `${label}: the reason is empty. A waiver without a reason gives the reviewer nothing to decide on.`,
      );
      return false;
    }
    return true;
  });

  const used = new Set<ArchitectureWaiver>();
  const violations: WaivableFinding[] = [];
  const waived: (WaivableFinding & { reason: string })[] = [];
  for (const finding of findings) {
    const waiver = valid.find(
      (candidate) =>
        candidate.rule === finding.rule &&
        (candidate.target === '*' || candidate.target === finding.target),
    );
    if (waiver) {
      used.add(waiver);
      waived.push({ ...finding, reason: waiver.reason });
    } else {
      violations.push(finding);
    }
  }
  for (const waiver of valid) {
    if (used.has(waiver)) continue;
    problems.push(
      `waiver ${waiver.rule} → ${waiver.target} is stale: nothing violates it any more. Remove it from architecture/waivers.ts.`,
    );
  }
  return { violations, waived, problems };
}

export interface DeclaredArchitectureWaiver {
  readonly rule: string;
  readonly target: string;
  readonly reason: string;
  readonly filePath: string;
  readonly line: number;
}

export const ARCHITECTURE_WAIVERS_FILE = join('architecture', 'waivers.ts');

/**
 * The waivers an app declares, read **statically** from
 * `architecture/waivers.ts` — for the attestation, which must list them
 * without executing the app's code. Only literal entries are read: a waiver
 * built by a function call is not one a reviewer can read either.
 */
export function architectureWaivers(
  projectDir: string,
): readonly DeclaredArchitectureWaiver[] {
  const filePath = join(projectDir, ARCHITECTURE_WAIVERS_FILE);
  if (!existsSync(filePath)) return [];
  const source = ts.createSourceFile(
    filePath,
    readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const found: DeclaredArchitectureWaiver[] = [];
  const text = (node: ts.Expression | undefined): string | undefined =>
    node && ts.isStringLiteralLike(node) ? node.text : undefined;
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineArchitectureWaivers'
    ) {
      const list = node.arguments[1];
      if (list && ts.isArrayLiteralExpression(list)) {
        for (const element of list.elements) {
          if (!ts.isObjectLiteralExpression(element)) continue;
          const field = (name: string) => {
            const property = element.properties.find(
              (entry): entry is ts.PropertyAssignment =>
                ts.isPropertyAssignment(entry) &&
                (ts.isIdentifier(entry.name) ||
                  ts.isStringLiteral(entry.name)) &&
                entry.name.text === name,
            );
            return text(property?.initializer);
          };
          found.push({
            rule: field('rule') ?? '',
            target: field('target') ?? '',
            reason: field('reason') ?? '',
            filePath,
            line:
              source.getLineAndCharacterOfPosition(element.getStart(source))
                .line + 1,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}
