import 'virtual:craft-style.css';
import { startCraft } from '@craft-ts/component';
import { appConfig } from './app.config.ts';
import { DATA_ID } from './data-id.ts';
import { asInputs, type DocsProps } from './page-data.ts';


const data = document.getElementById(DATA_ID);
if (!data?.textContent) {
  throw new Error(`The page carries no #${DATA_ID}: it was not built by the docs build.`);
}

const started = startCraft({
  config: appConfig,
  onMismatch: (error) => console.warn('[docs] hydration mismatch', error.message),
  props: asInputs(JSON.parse(data.textContent) as DocsProps),
  mode: import.meta.env.DEV ? 'development' : 'production',
});

(window as unknown as { __docs?: unknown }).__docs = started;
