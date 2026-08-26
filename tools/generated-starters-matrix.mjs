export const frontends = ['plain', 'effect'];
export const backends = ['none', 'promise', 'effect'];
export const features = ['none', 'strict'].flatMap((i18n) =>
  ['none', 'basic'].flatMap((designSystem) =>
    [false, true].map((typedCss) => ({ i18n, designSystem, typedCss })),
  ),
);

export const cells = frontends.flatMap((frontendRuntime) =>
  backends.flatMap((backendRuntime) =>
    features.map((feature) => ({
      frontendRuntime,
      backendRuntime,
      ...feature,
    })),
  ),
);

const completeFeatures = {
  i18n: 'strict',
  designSystem: 'basic',
  typedCss: true,
};

// Six runtime combinations plus the eight feature combinations on the minimal
// plain starter, with the fully-enabled cell shared by both groups.
export const releaseCells = [
  ...frontends.flatMap((frontendRuntime) =>
    backends.map((backendRuntime) => ({
      frontendRuntime,
      backendRuntime,
      ...completeFeatures,
    })),
  ),
  ...features.slice(0, -1).map((feature) => ({
    frontendRuntime: 'plain',
    backendRuntime: 'none',
    ...feature,
  })),
];

export const profiles = {
  static: cells,
  smoke: releaseCells,
  release: cells,
  full: cells,
};

export function cellsForProfile(profile, cellNumber = 0) {
  const profileCells = profiles[profile];
  if (!profileCells)
    throw new Error(`Unknown generated starter profile "${profile}".`);
  if (cellNumber > 0)
    return cells.filter((_cell, index) => index + 1 === cellNumber);
  return profileCells;
}
