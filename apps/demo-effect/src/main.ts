import { bootstrapCraft } from '@craft-ts/component';
import { appConfig } from './app/app.config';
import { startDemoEffectTypecheckIndicator } from './demo-typecheck-indicator';
import './styles.css';

startDemoEffectTypecheckIndicator();
bootstrapCraft({
  config: appConfig,
  mode: import.meta.env.DEV ? 'development' : 'production',
});
