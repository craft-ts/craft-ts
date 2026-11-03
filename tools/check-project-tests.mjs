#!/usr/bin/env node

// Every app and lib that has code has tests: a project never starts without
// them (behavior-tests-plan.md). An app's architecture suite then asks a proof
// for each behaviour; this check covers the libs, which have no behaviour
// catalog, and catches a project that has no test at all.

import { existsSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/**
 * Projects left without tests on purpose, each with its reason. An entry
 * whose project has tests, or is gone, fails the check.
 */
export const PROJECTS_WITHOUT_TESTS = {
  'libs/test-type':
    'Types only (Expect, Equal): every type test that imports them exercises them.',
};

const PROJECT_ROOTS = ['apps', 'libs', 'packages'];
const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'tmp',
  'test-results',
  '.craft',
  '.nx',
  '.vite',
]);
const CODE = /\.(?:[cm]?[jt]sx?)$/;
const TEST = /\.(?:spec|test)\.(?:[cm]?[jt]sx?)$/;

const isProject = (dir) =>
  existsSync(join(dir, 'project.json')) || existsSync(join(dir, 'package.json'));

/** The project directories under `apps`, `libs` and `packages`, nested ones included. */
export function findProjects(root) {
  const projects = [];
  const visit = (dir) => {
    if (isProject(dir)) projects.push(dir);
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || SKIPPED_DIRECTORIES.has(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;
      visit(join(dir, entry.name));
    }
  };
  for (const name of PROJECT_ROOTS) {
    const dir = join(root, name);
    if (existsSync(dir)) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) visit(join(dir, entry.name));
      }
    }
  }
  return projects.map((dir) => relative(root, dir)).sort();
}

/**
 * The code and test files a project owns: a nested project keeps its own.
 * An `architecture/` suite checks the graph, not a behaviour, so it is not a
 * test here; type declarations are not code.
 */
export function projectFiles(root, project) {
  const files = { code: 0, tests: 0 };
  const visit = (dir, top) => {
    if (!top && isProject(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name) || entry.name.startsWith('.')) continue;
        if (top && entry.name === 'architecture') continue;
        visit(path, false);
      } else if (CODE.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        if (TEST.test(entry.name)) files.tests++;
        else files.code++;
      }
    }
  };
  visit(join(root, project), true);
  return files;
}

/** One message per project with code and no test, and per stale waiver. */
export function checkProjectTests(root, waivers = PROJECTS_WITHOUT_TESTS) {
  const problems = [];
  const projects = findProjects(root);
  for (const project of projects) {
    const { code, tests } = projectFiles(root, project);
    const waiver = waivers[project];
    if (waiver !== undefined && !waiver.trim()) {
      problems.push(`${project}: the waiver has no reason.`);
    } else if (waiver !== undefined && (tests > 0 || code === 0)) {
      problems.push(
        `${project}: the waiver is stale, ${tests > 0 ? 'the project has tests now' : 'it has no code'}. Remove it from tools/check-project-tests.mjs.`,
      );
    } else if (waiver === undefined && code > 0 && tests === 0) {
      problems.push(
        `${project} has ${code} code file(s) and no test. Add a *.spec.ts that proves what it does, or a reasoned entry in PROJECTS_WITHOUT_TESTS (tools/check-project-tests.mjs).`,
      );
    }
  }
  for (const project of Object.keys(waivers)) {
    if (!projects.includes(project))
      problems.push(`${project}: the waiver names a project that is gone.`);
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const problems = checkProjectTests(resolve(import.meta.dirname, '..'));
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log('Every project with code has tests.');
}
