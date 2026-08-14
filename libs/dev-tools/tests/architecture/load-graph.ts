import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  analyzeDependencyGraph,
  createArchitectureGraph,
} from '@craft-ng/dev-tools';

const fixturesRoot = fileURLToPath(new URL('./fixtures', import.meta.url));

export function loadArchitectureFixture(fixture: string) {
  const rootDir = join(fixturesRoot, fixture);
  return createArchitectureGraph(
    analyzeDependencyGraph({
      rootDir,
      tsConfigFilePath: 'tsconfig.json',
    }),
  );
}
