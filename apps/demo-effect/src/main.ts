import { bootstrapCraft } from '@craft-ts/component';
import { appConfig } from './app/app.config';
import './styles.css';

bootstrapCraft({
  config: appConfig,
  mode: import.meta.env.DEV ? 'development' : 'production',
});
