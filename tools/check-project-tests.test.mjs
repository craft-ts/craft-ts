import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { checkProjectTests, findProjects } from './check-project-tests.mjs';

function workspace(files) {
  const root = mkdtempSync(join(tmpdir(), 'craft-project-tests-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

test('asks a project with code and no test for its tests', () => {
  const root = workspace({
    'libs/tested/project.json': '{}',
    'libs/tested/src/index.ts': '',
    'libs/tested/src/index.spec.ts': '',
    'apps/untested/project.json': '{}',
    'apps/untested/src/main.ts': '',
    // A graph suite is not a behaviour test.
    'apps/untested/architecture/architecture.spec.ts': '',
    'libs/types/package.json': '{}',
    'libs/types/src/index.d.ts': '',
  });
  try {
    assert.deepEqual(checkProjectTests(root, {}), [
      'apps/untested has 1 code file(s) and no test. Add a *.spec.ts that proves what it does, or a reasoned entry in PROJECTS_WITHOUT_TESTS (tools/check-project-tests.mjs).',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('counts a nested project on its own', () => {
  const root = workspace({
    'libs/outer/project.json': '{}',
    'libs/outer/src/index.ts': '',
    'libs/outer/inner/project.json': '{}',
    'libs/outer/inner/src/main.ts': '',
    'libs/outer/inner/src/main.spec.ts': '',
  });
  try {
    assert.deepEqual(findProjects(root), ['libs/outer', 'libs/outer/inner']);
    assert.deepEqual(checkProjectTests(root, {}), [
      'libs/outer has 1 code file(s) and no test. Add a *.spec.ts that proves what it does, or a reasoned entry in PROJECTS_WITHOUT_TESTS (tools/check-project-tests.mjs).',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('keeps the waivers honest', () => {
  const root = workspace({
    'libs/waived/project.json': '{}',
    'libs/waived/src/index.ts': '',
    'libs/tested/project.json': '{}',
    'libs/tested/src/index.ts': '',
    'libs/tested/src/index.spec.ts': '',
  });
  try {
    assert.deepEqual(checkProjectTests(root, { 'libs/waived': 'generated' }), []);
    assert.deepEqual(
      checkProjectTests(root, { 'libs/waived': ' ', 'libs/tested': 'old', 'libs/gone': 'old' }),
      [
        'libs/tested: the waiver is stale, the project has tests now. Remove it from tools/check-project-tests.mjs.',
        'libs/waived: the waiver has no reason.',
        'libs/gone: the waiver names a project that is gone.',
      ],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
