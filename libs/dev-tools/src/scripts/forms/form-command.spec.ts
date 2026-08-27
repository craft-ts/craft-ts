import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runFormAdd } from './form-command';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('craft add form', () => {
  it('generates a typed simple form with validation, mutation and submission test', async () => {
    const root = await mkdtemp(join(tmpdir(), 'craft-form-generator-'));
    roots.push(root);
    const result = await runFormAdd({ name: 'animal', rootDir: root });
    const source = await readFile(join(root, 'src/app/animal/animal-form.ts'), 'utf8');

    expect(result.advanced).toBe(false);
    expect(result.changedFiles).toEqual([
      'src/app/animal/animal-form.ts',
      'src/app/animal/animal-form.spec.ts',
      'src/app/animal/README.md',
    ]);
    expect(source).toContain('insertForm(');
    expect(source).toContain('insertFormSubmit(saveAnimal)');
    expect(source).toContain('CraftFieldDirective');
    expect(source).toContain('fieldErrorNode.exhaustive');
    expect(source).toContain('submitExceptions');
  });

  it('generates the advanced schema and nested conditional path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'craft-form-generator-'));
    roots.push(root);
    await runFormAdd({ name: 'animal', rootDir: root, advanced: true });
    const source = await readFile(join(root, 'src/app/animal/animal-form.ts'), 'utf8');

    expect(source).toContain('insertFormSchema(animalSchema)');
    expect(source).toContain("insertSelectFormTree('address'");
    expect(source).toContain('hidden: () => !includeAddress()');
    expect(source).toContain('Add cAsyncValidate here');
  });

  it('does not overwrite an existing form without --force', async () => {
    const root = await mkdtemp(join(tmpdir(), 'craft-form-generator-'));
    roots.push(root);
    await runFormAdd({ name: 'animal', rootDir: root });
    await expect(runFormAdd({ name: 'animal', rootDir: root })).rejects.toThrow(/--force/);
    await expect(runFormAdd({ name: 'animal', rootDir: root, force: true })).resolves.toBeDefined();
  });
});
