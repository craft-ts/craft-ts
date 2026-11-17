import { renderToString } from '@craft-ts/component';
import { fixture } from './fixture';
export async function render(mode: string, count: number, buttons: boolean) {
  const sample = fixture(count, mode, buttons, true);
  const html = await renderToString(sample.App, { mode: 'production' });
  return { html, lifecycle: sample.lifecycle };
}
