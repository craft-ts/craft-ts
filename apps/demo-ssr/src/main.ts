import { startCraft } from '@craft-ts/component';
import { appConfig } from './app/app.config';
import './styles.css';

startCraft({
  config: appConfig,
  mode: import.meta.env.DEV ? 'development' : 'production',
});
