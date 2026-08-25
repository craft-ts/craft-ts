import { startCraft } from '@craft-ts/component';
import { appConfig } from './app/app.config';
import { startDemoSsrTypecheckIndicator } from './demo-typecheck-indicator';
import './styles.css';

startDemoSsrTypecheckIndicator();
startCraft({
  config: appConfig,
  mode: import.meta.env.DEV ? 'development' : 'production',
});
