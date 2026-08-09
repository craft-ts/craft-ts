import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as readline from 'node:readline';
import process from 'node:process';

const workspaceRoot = resolve(import.meta.dirname, '..');
// app.routes.ts est la source canonique : ce script ne doit jamais l'écrire.
// Seul l'overlay runtime est remplacé, puis restauré après l'arrêt d'Angular.
const routesPath = resolve(workspaceRoot, 'apps/demo/src/app/app.routes.ts');
const runtimeRoutesPath = resolve(
  workspaceRoot,
  'apps/demo/src/app/app.routes.runtime.ts',
);
const runtimeRoutesFallback = `// NE PAS MODIFIER : overlay temporaire de nx serve demo.
// Les routes se modifient uniquement dans app.routes.ts.
export {
  demoEnabledRoutePaths,
  demoRoutes,
} from './app.routes';
`;

const routeBlockPattern =
  /\s*\/\* demo-route: ([^*]+) \*\/([\s\S]*?)\/\* demo-route-end \*\//g;
const checkBlockPattern =
  /\s*\/\* demo-check: ([^*]+) \*\/([\s\S]*?)\/\* demo-check-end \*\//g;

function readRouteCatalog(source) {
  return [...source.matchAll(routeBlockPattern)].map((match) => {
    const id = match[1].trim();
    const block = match[0];
    const pathMatch = block.match(/path:\s*'([^']*)'/);
    const craftRouteMatch = block.match(/craftRoute\(\s*'([^']+)'/);
    const routePath = pathMatch?.[1] ?? craftRouteMatch?.[1] ?? id;

    return { id, label: routePath || '(racine)' };
  });
}

function generateRoutes(source, enabledRouteIds) {
  const collectionStart = source.indexOf(
    "export const { demoRoutes } = craftRoutes('demo', [",
  );
  if (collectionStart === -1) {
    throw new Error('Impossible de trouver la collection demoRoutes.');
  }

  const bodyStart = source.indexOf('[', collectionStart) + 1;
  const bodyEnd = source.indexOf('\n]);', bodyStart);
  if (bodyStart === 0 || bodyEnd === -1) {
    throw new Error('Impossible de trouver le contenu de demoRoutes.');
  }

  const enabled = new Set(enabledRouteIds);
  const selectedBlocks = [
    ...source.slice(bodyStart, bodyEnd).matchAll(routeBlockPattern),
  ]
    .filter((match) => enabled.has(match[1].trim()))
    .map((match) => match[2].replace(/^\s*/, '  ').replace(/\s*$/, ''))
    .join('\n');

  let generated =
    source.slice(0, bodyStart) +
    '\n' +
    selectedBlocks +
    '\n' +
    source.slice(bodyEnd);

  generated = generated.replace(checkBlockPattern, (wholeBlock, id, body) => {
    const checkId = id.trim();
    const enabledForCheck =
      enabled.has(checkId) ||
      (checkId === 'guard-registry' && enabled.has('guard-demo')) ||
      (checkId === 'view-transitions-mount' &&
        enabled.has('view-transitions')) ||
      (checkId === 'craft-lazy-layout-mount' &&
        enabled.has('craft-lazy-layout')) ||
      (checkId === 'child-mount-shared' &&
        (enabled.has('view-transitions') || enabled.has('craft-lazy-layout')));

    return enabledForCheck ? `${body}\n` : '';
  });
  generated = generated
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n\n\]\);/, '\n]);');

  const hasOmittedRoutes =
    [...source.matchAll(routeBlockPattern)].length !== enabledRouteIds.length;
  const lintDirective = hasOmittedRoutes
    ? '/* eslint-disable @typescript-eslint/no-unused-vars */\n'
    : '';

  return `// FICHIER GÉNÉRÉ : ne pas modifier directement. Éditer app.routes.ts.\n// Les routes et checks DI non sélectionnés sont volontairement retirés de cet overlay.\n${lintDirective}${generated.trimEnd()}\n`;
}

function parseArguments(argv) {
  const forwarded = [];
  let requestedRoutes;
  let allRoutes = false;
  let generateOnly = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--all-routes') {
      allRoutes = true;
    } else if (argument === '--generate-only') {
      generateOnly = true;
    } else if (argument === '--demo-routes' || argument === '--routes') {
      requestedRoutes = argv[++index] ?? '';
    } else if (
      argument.startsWith('--demo-routes=') ||
      argument.startsWith('--routes=')
    ) {
      requestedRoutes = argument.slice(argument.indexOf('=') + 1);
    } else {
      forwarded.push(argument);
    }
  }

  return { forwarded, requestedRoutes, allRoutes, generateOnly };
}

function chooseRoutes(routes, requestedRoutes, allRoutes) {
  if (allRoutes || requestedRoutes === 'all') {
    return routes.map((route) => route.id);
  }

  if (requestedRoutes) {
    const requested = requestedRoutes
      .split(',')
      .map((route) => route.trim())
      .filter(Boolean);
    const known = new Set(routes.map((route) => route.id));
    const unknown = requested.filter((route) => !known.has(route));
    if (unknown.length > 0) {
      throw new Error(`Routes inconnues: ${unknown.join(', ')}.`);
    }
    return requested;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY || process.env.CI) {
    return routes.map((route) => route.id);
  }

  return promptForRoutes(routes);
}

function promptForRoutes(routes) {
  return new Promise((resolveSelection) => {
    let cursor = 0;
    let outputRow = 0;
    const selected = new Set(routes.map((route) => route.id));
    const output = process.stdout;

    const writeRouteRow = (index) => {
      const route = routes[index];
      const pointer = index === cursor ? '❯' : ' ';
      const checkbox = selected.has(route.id) ? '◉' : '◯';
      readline.cursorTo(output, 0);
      readline.clearLine(output, 0);
      output.write(`${pointer} ${checkbox} ${route.label}  [${route.id}]`);
    };

    const moveToRow = (row) => {
      readline.moveCursor(output, 0, row - outputRow);
      outputRow = row;
    };

    const refreshRows = (indices, finalIndex = cursor) => {
      const rows = [...new Set(indices)].sort((left, right) => left - right);
      for (const index of rows) {
        moveToRow(index + 3);
        writeRouteRow(index);
      }
      moveToRow(finalIndex + 3);
    };

    const renderInitial = () => {
      output.write(
        'Routes de la démo à servir (↑/↓, espace, entrée)\n' +
          'a/t = tout sélectionner · n/d = tout désélectionner · q = quitter\n\n',
      );
      routes.forEach((route) => {
        const checkbox = selected.has(route.id) ? '◉' : '◯';
        output.write(`  ${checkbox} ${route.label}  [${route.id}]\n`);
      });
      output.write('\nToutes les routes sont activées par défaut.\n');
      outputRow = routes.length + 5;
      moveToRow(3);
      writeRouteRow(cursor);
    };

    const clearPrompt = () => {
      moveToRow(0);
      readline.clearScreenDown(output);
      readline.cursorTo(output, 0);
    };

    const redrawAll = () => {
      clearPrompt();
      output.write(
        'Routes de la démo à servir (↑/↓, espace, entrée)\n' +
          'a/t = tout sélectionner · n/d = tout désélectionner · q = quitter\n\n',
      );
      routes.forEach((route) => {
        const checkbox = selected.has(route.id) ? '◉' : '◯';
        output.write(`  ${checkbox} ${route.label}  [${route.id}]\n`);
      });
      output.write('\nToutes les routes sont activées par défaut.\n');
      outputRow = routes.length + 5;
      moveToRow(3);
      writeRouteRow(cursor);
    };

    const finish = () => {
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      clearPrompt();
      resolveSelection(
        routes
          .filter((route) => selected.has(route.id))
          .map((route) => route.id),
      );
    };

    const onData = (chunk) => {
      const key = chunk.toString();
      if (key === '\u0003' || key === 'q') {
        process.stdin.setRawMode?.(false);
        clearPrompt();
        process.exit(130);
      } else if (key === '\u001b[A' || key === 'k') {
        const previousCursor = cursor;
        cursor = (cursor + routes.length - 1) % routes.length;
        refreshRows([previousCursor, cursor]);
      } else if (key === '\u001b[B' || key === 'j') {
        const previousCursor = cursor;
        cursor = (cursor + 1) % routes.length;
        refreshRows([previousCursor, cursor]);
      } else if (key === ' ') {
        const id = routes[cursor].id;
        if (selected.has(id)) selected.delete(id);
        else selected.add(id);
        refreshRows([cursor]);
      } else if (key === 'a' || key === 't') {
        if (selected.size !== routes.length) {
          routes.forEach((route) => selected.add(route.id));
          redrawAll();
        }
      } else if (key === 'n' || key === 'd') {
        if (selected.size !== 0) {
          selected.clear();
          redrawAll();
        }
      } else if (key === '\r' || key === '\n') {
        finish();
      }
    };

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
    renderInitial();
  });
}

async function main() {
  const source = readFileSync(routesPath, 'utf8');
  const routes = readRouteCatalog(source);
  const { forwarded, requestedRoutes, allRoutes, generateOnly } =
    parseArguments(process.argv.slice(2));
  const enabledRouteIds = await chooseRoutes(
    routes,
    requestedRoutes,
    allRoutes,
  );

  writeFileSync(runtimeRoutesPath, generateRoutes(source, enabledRouteIds));
  process.stdout.write(
    `Routes activées: ${enabledRouteIds.length}/${routes.length}\n`,
  );

  if (generateOnly) return;

  const nxBin = resolve(workspaceRoot, 'node_modules/nx/bin/nx.js');
  const restoreAllRoutes = () => {
    writeFileSync(runtimeRoutesPath, runtimeRoutesFallback);
  };
  const child = spawn(
    process.execPath,
    [nxBin, 'run', 'demo:serve-angular', ...forwarded],
    {
      cwd: workspaceRoot,
      env: process.env,
      stdio: 'inherit',
    },
  );

  const forwardSignal = (signal) => child.kill(signal);
  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));
  child.on('exit', (code, signal) => {
    restoreAllRoutes();
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
