// Task 3.3 — fine edges for Effect services.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Project, SyntaxKind } from 'ts-morph';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectEffectServices,
  collectEffectServiceUsage,
  selectedMemberNames,
} from './effect-dependency-graph';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function sourceFilesFor(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'craft-effect-graph-'));
  temporaryDirectories.push(root);
  await Promise.all(
    Object.entries(files).map(([path, contents]) =>
      writeFile(join(root, path), contents, 'utf8'),
    ),
  );
  const project = new Project({
    compilerOptions: { strict: true, skipLibCheck: true },
    skipFileDependencyResolution: true,
  });
  project.addSourceFilesAtPaths(join(root, '**/*.ts'));
  return project.getSourceFiles();
}

const SERVICE = `
import { Context, Effect } from 'effect';

export class UserApi extends Context.Service<UserApi, {
  readonly byId: (id: string) => Effect.Effect<string>;
  readonly count: () => Effect.Effect<number>;
}>()('UserApi') {}
`;

describe('collectEffectServices', () => {
  it('finds a Context.Service class and its tag key', async () => {
    const files = await sourceFilesFor({ 'api.ts': SERVICE });
    const services = collectEffectServices(files);

    expect([...services.keys()]).toEqual(['UserApi']);
    expect(services.get('UserApi')?.key).toBe('UserApi');
  });

  it('ignores classes that are not Effect services', async () => {
    const files = await sourceFilesFor({
      'other.ts': 'export class Plain extends Error {}',
    });
    expect(collectEffectServices(files).size).toBe(0);
  });
});

describe('selectedMemberNames', () => {
  const selectorIn = async (code: string) => {
    const files = await sourceFilesFor({ 's.ts': code });
    const arrow = files[0]!.getDescendantsOfKind(SyntaxKind.ArrowFunction)[0]!;
    return selectedMemberNames(arrow);
  };

  it('reads the keys of the returned object', async () => {
    expect(await selectorIn('const s = ({ byId }) => ({ byId });')).toEqual([
      'byId',
    ]);
  });

  it('falls back to the destructured parameter when the selector renames', async () => {
    expect(
      await selectorIn('const s = ({ byId }) => ({ fetchUser: byId });'),
    ).toEqual(['fetchUser']);
  });
});

describe('collectEffectServiceUsage', () => {
  it('draws Consumer -> Service.member for a selected member', async () => {
    const files = await sourceFilesFor({
      'api.ts': SERVICE,
      'store.ts': `
        import { effectService } from '@craft-ts/effect';
        import { UserApi } from './api';
        export function* store() {
          const { byId } = yield* effectService(UserApi, ({ byId }) => ({ byId }));
          return byId;
        }
      `,
    });

    const services = collectEffectServices(files);
    const { nodes, edges } = collectEffectServiceUsage(
      files,
      services,
      () => 'component:UserStore',
    );

    expect(nodes.map((node) => node.id)).toContain(
      'property:service:effect:UserApi:byId',
    );

    const fine = edges.find((edge) => edge.kind === 'uses-property');
    expect(fine).toMatchObject({
      from: 'component:UserStore',
      to: 'property:service:effect:UserApi:byId',
      details: { property: 'byId', runtime: 'effect' },
    });

    // The member is contained by its service, so the graph can group it.
    expect(
      edges.some(
        (edge) =>
          edge.kind === 'contains' &&
          edge.from === 'service:effect:UserApi' &&
          edge.to === 'property:service:effect:UserApi:byId',
      ),
    ).toBe(true);

    // And nothing was invented for the member the consumer never touched.
    expect(nodes.map((node) => node.id)).not.toContain(
      'property:service:effect:UserApi:count',
    );
  });

  it('falls back to a whole-service edge when nothing is selected', async () => {
    const files = await sourceFilesFor({
      'api.ts': SERVICE,
      'store.ts': `
        import { effectService } from '@craft-ts/effect';
        import { UserApi } from './api';
        export function* store() {
          return yield* effectService(UserApi);
        }
      `,
    });

    const { edges } = collectEffectServiceUsage(
      files,
      collectEffectServices(files),
      () => 'component:UserStore',
    );

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      kind: 'depends-on',
      to: 'service:effect:UserApi',
      details: { selection: 'whole-service' },
    });
  });

  it('skips a call that belongs to no known consumer', async () => {
    const files = await sourceFilesFor({
      'api.ts': SERVICE,
      'loose.ts': `
        import { effectService } from '@craft-ts/effect';
        import { UserApi } from './api';
        export const loose = effectService(UserApi, ({ byId }) => ({ byId }));
      `,
    });

    const { edges } = collectEffectServiceUsage(
      files,
      collectEffectServices(files),
      () => undefined,
    );

    // An edge attached to an arbitrary node would be a lie; none is better.
    expect(edges).toHaveLength(0);
  });
});
