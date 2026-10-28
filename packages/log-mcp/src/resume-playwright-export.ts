/** Generate a reviewable Playwright starting point from a Craft resume recipe. */
export function exportResumeRecipeToPlaywright(value: unknown): Readonly<{ fileName: string; source: string; manualSteps: readonly number[] }> {
  if (!isRecord(value) || !Array.isArray(value['steps'])) throw new Error('Recipe steps are unavailable.');
  const recipeId = typeof value['id'] === 'string' ? value['id'] : 'resume-recipe';
  const goal = isRecord(value['objective']) && typeof value['objective']['goal'] === 'string'
    ? value['objective']['goal'] : 'Guided resume recipe';
  const origin = typeof value['origin'] === 'string' ? value['origin'] : 'http://127.0.0.1:4200';
  const manualSteps: number[] = [];
  const body = (value['steps'] as unknown[]).map((raw, index) => {
    const step = isRecord(raw) ? raw : {};
    switch (step['type']) {
      case 'goto': {
        const route = literal(String(step['route'] ?? '/'));
        return `  await page.goto(new URL(${route}, baseURL).toString());`;
      }
      case 'act': {
        const action = isRecord(step['action']) ? step['action'] : step;
        const id = typeof action['id'] === 'string' ? action['id'] : undefined;
        if (!id) { manualSteps.push(index); return `  // TODO step ${index + 1}: choose a named Craft control.`; }
        const selector = `page.locator('[data-craft-name="' + ${literal(id)} + '"]')`;
        const match = isRecord(action['match']) ? action['match'] : {};
        const locator = Number.isInteger(match['index'])
          ? `${selector}.nth(${Number(match['index'])})`
          : `${selector}.first() /* TODO: preserve track ${literal(String(match['track'] ?? ''))} when the control repeats */`;
        if (Object.hasOwn(action, 'fill')) return `  await ${locator}.fill(${literal(String(action['fill']))});`;
        if (typeof action['press'] === 'string') return `  await ${locator}.press(${literal(action['press'])});`;
        return `  await ${locator}.click();`;
      }
      case 'handoff':
        manualSteps.push(index);
        return `  await test.step(${literal(`Human handoff: ${String(step['message'] ?? 'continue in the app')}`)}, async () => {\n    // TODO: replace with a deterministic test identity or a Playwright storage state.\n    await test.pause();\n  });`;
      case 'create':
      case 'ensure':
      case 'invoke':
      case 'expect':
      case 'checkpoint':
        manualSteps.push(index);
        return `  // TODO step ${index + 1} (${String(step['type'])}): translate the Craft condition or operation into an app-specific Playwright assertion.`;
      default:
        manualSteps.push(index);
        return `  // TODO step ${index + 1}: unsupported recipe step ${literal(String(step['type'] ?? 'unknown'))}.`;
    }
  }).join('\n');
  const source = [
    "import { test } from '@playwright/test';",
    '',
    '// Exploratory scaffold. Review every TODO before using it in CI.',
    `test(${literal(goal)}, async ({ page }) => {`,
    `  const baseURL = process.env['CRAFT_RECIPE_BASE_URL'] ?? ${literal(origin)};`,
    `  // Source recipe: ${recipeId}`,
    body,
    '});',
    '',
  ].join('\n');
  return { fileName: `${slug(goal)}.spec.ts`, source, manualSteps };
}

function literal(value: string): string { return JSON.stringify(value); }
function slug(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'resume-recipe';
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
