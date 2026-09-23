import { bootstrapCraft } from '@craft-ts/component';
import { appConfig } from './app/app.config';
import { startDemoEffectTypecheckIndicator } from './demo-typecheck-indicator';
import './styles.css';
// The sheets of @craft-ts/component (AI overlay, pending indicator, skip
// link). TODO(style-only): the only stylesheet left once the app migrates.
import 'virtual:craft-style.css';

startDemoEffectTypecheckIndicator();
bootstrapCraft({
  config: appConfig,
  mode: import.meta.env.DEV ? 'development' : 'production',
});
