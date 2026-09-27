import { bootstrapCraft } from '@craft-ts/component';
import { appConfig } from './app/app.config';
// The whole stylesheet, emitted from the *.style.ts sheets and craft-ts' own.
import 'virtual:craft-style.css';

bootstrapCraft({
  config: appConfig,
  mode: import.meta.env.DEV ? 'development' : 'production',
});
