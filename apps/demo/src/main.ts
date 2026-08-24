import 'virtual:craft-style.css';
import { bootstrapCraft } from '@craft-ts/component';
import { appConfig } from './app/app.config';
import { startDemoTypecheckIndicator } from './demo-typecheck-indicator';

startDemoTypecheckIndicator();
bootstrapCraft({
  config: appConfig,
  mode: import.meta.env.DEV ? 'development' : 'production',
});
