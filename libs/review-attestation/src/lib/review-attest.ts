import type { VisualScenario } from './matrix.js';
import {
  defineVisualAppConfig,
  visualAppCaptureTargets,
  type VisualAppConfig,
  type VisualAppConfigInput,
} from './visual-app.js';

/** A component matrix and the graph node it captures. */
export type ReviewAttestMatrix = {
  readonly component: string;
  readonly scenarios: readonly VisualScenario[];
};

/**
 * A matrix may be supplied as an already materialised `visualMatrix(...)`
 * result, or with its component id attached. The latter is what lets the CLI
 * select the corresponding visual subjects from a report.
 */
export type ReviewAttestMatrixInput =
  | ReviewAttestMatrix
  | {
      readonly component: string;
      readonly matrix: readonly VisualScenario[];
    }
  | readonly VisualScenario[];

export type ReviewAttestVisualConfig = {
  readonly app?: VisualAppConfig;
  readonly matrices: readonly ReviewAttestMatrixInput[];
};

export type ReviewAttestConfigInput = {
  readonly visual?: {
    readonly app?: VisualAppConfigInput | VisualAppConfig;
    readonly matrices?: readonly ReviewAttestMatrixInput[];
  };
  /** Global v1 switch for template obligations. */
  readonly template?: boolean;
  /**
   * Deliberate bypasses — `eslint-disable` directives and architecture waivers
   * — listed for a decision. On by default: a bypass is allowed, never silent.
   * `styleDump` points at the dump the build writes (`craftStyle({ dumpPath })`)
   * so the design-system adoption indicator sees what the sheets emit.
   */
  readonly bypasses?: false | { readonly styleDump?: string };
  /** Deterministic folder-layout proposal to include in the review queue. */
  readonly folderLayout?:
    | string
    | {
        readonly proposal: string;
        readonly analysis?: string;
      };
};

export type ReviewAttestConfig = {
  readonly visual?: ReviewAttestVisualConfig;
  readonly template: boolean;
  /**
   * Deliberate bypasses — `eslint-disable` directives and architecture waivers
   * — listed for a decision. On by default: a bypass is allowed, never silent.
   * `styleDump` points at the dump the build writes (`craftStyle({ dumpPath })`)
   * so the design-system adoption indicator sees what the sheets emit.
   */
  readonly bypasses?: false | { readonly styleDump?: string };

  readonly folderLayout?: {
    readonly proposal: string;
    readonly analysis?: string;
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const invalid = (message: string): never => {
  throw new TypeError(`review-attest.config: ${message}`);
};

const validateApp = (value: unknown): VisualAppConfig => {
  if (!isRecord(value) || !Array.isArray(value['pages']))
    invalid('visual.app.pages must be an array.');
  return defineVisualAppConfig(value as VisualAppConfigInput);
};

const validateMatrix = (
  value: unknown,
  path: string,
): ReviewAttestMatrixInput => {
  if (Array.isArray(value)) {
    for (const [index, scenario] of value.entries()) {
      if (!isRecord(scenario) || typeof scenario['id'] !== 'string') {
        invalid(`${path}[${index}] must be a visual scenario.`);
      }
    }
    return value as readonly VisualScenario[];
  }
  const record = isRecord(value)
    ? value
    : invalid(`${path} must contain a non-empty component and scenarios.`);
  if (
    typeof record['component'] !== 'string' ||
    record['component'].length === 0
  ) {
    invalid(`${path} must contain a non-empty component and scenarios.`);
  }
  const scenarios = (record['scenarios'] ?? record['matrix']) as
    | readonly unknown[]
    | undefined;
  if (!Array.isArray(scenarios)) {
    invalid(`${path}.scenarios or matrix must be an array.`);
  }
  const scenarioList = Array.isArray(scenarios)
    ? scenarios
    : invalid(`${path}.scenarios or matrix must be an array.`);
  for (const [index, scenario] of scenarioList.entries()) {
    if (!isRecord(scenario) || typeof scenario['id'] !== 'string') {
      invalid(`${path}.scenarios[${index}] must be a visual scenario.`);
    }
  }
  return {
    component: record['component'] as string,
    scenarios: scenarioList as readonly VisualScenario[],
  };
};

/** Defines the public, typed source of truth for the attestation workflow. */
export function defineReviewAttestConfig<
  const Input extends ReviewAttestConfigInput,
>(input: Input): ReviewAttestConfig {
  if (!isRecord(input)) invalid('the root value must be an object.');
  if (input.template !== undefined && typeof input.template !== 'boolean')
    invalid('template must be a boolean.');
  const folderLayout = input.folderLayout;
  if (
    folderLayout !== undefined &&
    typeof folderLayout !== 'string' &&
    (!isRecord(folderLayout) || typeof folderLayout['proposal'] !== 'string')
  ) {
    invalid('folderLayout must be a proposal path or an object with proposal.');
  }
  const normalizedFolderLayout =
    typeof folderLayout === 'string'
      ? { proposal: folderLayout }
      : folderLayout;
  const bypasses = input.bypasses;
  if (
    bypasses !== undefined &&
    bypasses !== false &&
    (!isRecord(bypasses) ||
      (bypasses['styleDump'] !== undefined &&
        typeof bypasses['styleDump'] !== 'string'))
  ) {
    invalid(
      'bypasses must be false or an object with an optional styleDump path.',
    );
  }
  const bypassesOption = bypasses === undefined ? {} : { bypasses };
  const visual = input.visual;
  if (visual !== undefined) {
    if (!isRecord(visual)) invalid('visual must be an object.');
    const app = visual.app === undefined ? undefined : validateApp(visual.app);
    const matrices = (visual.matrices ?? []).map((matrix, index) =>
      validateMatrix(matrix, `visual.matrices[${index}]`),
    );
    return {
      visual: {
        ...(app ? { app } : {}),
        matrices,
      },
      template: input.template === true,
      ...bypassesOption,
      ...(normalizedFolderLayout
        ? { folderLayout: normalizedFolderLayout }
        : {}),
    };
  }
  if (input.template !== undefined && typeof input.template !== 'boolean') {
    invalid('template must be a boolean.');
  }
  return {
    template: input.template === true,
    ...bypassesOption,
    ...(normalizedFolderLayout ? { folderLayout: normalizedFolderLayout } : {}),
  };
}

/** Runtime guard for config values loaded from JavaScript or transpiled TS. */
export function isReviewAttestConfig(
  value: unknown,
): value is ReviewAttestConfig {
  try {
    if (!isRecord(value)) return false;
    defineReviewAttestConfig(value as ReviewAttestConfigInput);
    return true;
  } catch {
    return false;
  }
}

/** Returns the explicitly declared visual subjects, when the config names any. */
export function reviewAttestVisualSubjects(
  config: ReviewAttestConfig,
): ReadonlySet<string> {
  const subjects = new Set<string>();
  if (config.visual?.app)
    for (const target of visualAppCaptureTargets(config.visual.app))
      subjects.add(target.subject);
  for (const matrix of config.visual?.matrices ?? []) {
    if (Array.isArray(matrix)) continue;
    const namedMatrix = matrix as ReviewAttestMatrix;
    for (const scenario of namedMatrix.scenarios) {
      subjects.add(`visual:${namedMatrix.component}#${scenario.id}`);
    }
  }
  return subjects;
}

export function reviewAttestHasVisualTargets(
  config: ReviewAttestConfig,
): boolean {
  return (
    (config.visual?.app?.pages.length ?? 0) > 0 ||
    (config.visual?.matrices.length ?? 0) > 0
  );
}

export * from './visual-app.js';
