import { startCraft } from '@craft-ts/component';
import { appConfig } from './app/app.config';
import { startDemoSsrTypecheckIndicator } from './demo-typecheck-indicator';
// The whole stylesheet, emitted from the *.style.ts sheets and craft-ts' own.
import 'virtual:craft-style.css';

startDemoSsrTypecheckIndicator();
startCraft({
  config: appConfig,
  mode: import.meta.env.DEV ? 'development' : 'production',
});
