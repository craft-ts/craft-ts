/**
 * Maps Nx `--configuration` flags onto Vite `--mode`.
 * Vite does not understand `--configuration`; dropping it silently serves in
 * development even when `demo:serve:production` was requested.
 */
export function toViteCliArgs(argv) {
  const viteArgs = [];
  let mode;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--configuration') {
      mode = argv[++index] ?? mode;
      continue;
    }
    if (argument.startsWith('--configuration=')) {
      mode = argument.slice('--configuration='.length) || mode;
      continue;
    }
    viteArgs.push(argument);
  }

  if (mode) {
    viteArgs.push('--mode', mode);
  }

  return viteArgs;
}
