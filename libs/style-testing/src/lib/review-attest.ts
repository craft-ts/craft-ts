import type { VisualScenario } from './matrix.js';
import {
  defineVisualAppConfig,
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
};

export type ReviewAttestConfig = {
  readonly visual?: ReviewAttestVisualConfig;
  readonly template: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const invalid = (message: string): never => {
  throw new TypeError(`review-attest.config: ${message}`);
};

const validateViewport = (value: unknown, path: string): void => {
  const record = isRecord(value)
    ? value
    : invalid(`${path} must be an object.`);
  if (
    typeof record['width'] !== 'number' ||
    !Number.isFinite(record['width']) ||
    record['width'] <= 0 ||
    typeof record['height'] !== 'number' ||
    !Number.isFinite(record['height']) ||
    record['height'] <= 0
  ) {
    invalid(`${path} must contain positive numeric width and height.`);
  }
};

const validateApp = (value: unknown): VisualAppConfig => {
  const record = isRecord(value)
    ? value
    : invalid('visual.app must be an object.');
  if (!Array.isArray(record['pages'])) {
    invalid('visual.app.pages must be an array.');
  }
  const pages = record['pages'] as readonly unknown[];
  const viewports = record['viewports'];
  if (viewports !== undefined) {
    const viewportRecord = isRecord(viewports)
      ? viewports
      : invalid('visual.app.viewports must be an object.');
    for (const [name, viewport] of Object.entries(viewportRecord)) {
      validateViewport(viewport, `visual.app.viewports.${name}`);
    }
  }
  for (const [index, page] of pages.entries()) {
    const pageRecord = isRecord(page)
      ? page
      : invalid(`visual.app.pages[${index}] must be an object.`);
    for (const field of ['id', 'route', 'url', 'component']) {
      if (
        typeof pageRecord[field] !== 'string' ||
        pageRecord[field].length === 0
      ) {
        invalid(
          `visual.app.pages[${index}].${field} must be a non-empty string.`,
        );
      }
    }
    const mocks = pageRecord['mocks'];
    if (!isRecord(mocks) || typeof mocks['source'] !== 'string') {
      invalid(
        `visual.app.pages[${index}].mocks must be defined with a source.`,
      );
    }
  }
  return defineVisualAppConfig(record as VisualAppConfigInput);
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
    };
  }
  if (input.template !== undefined && typeof input.template !== 'boolean') {
    invalid('template must be a boolean.');
  }
  return { template: input.template === true };
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
  for (const page of config.visual?.app?.pages ?? []) {
    for (const viewportName of Object.keys(
      config.visual?.app?.viewports ?? {},
    )) {
      subjects.add(
        `visual:${page.component}#${page.id}--happy-path--${viewportName}`,
      );
    }
  }
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
