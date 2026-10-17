import 'virtual:craft-style.css';
import './dashboard.css';
import { bootstrapCraft } from '@craft-ts/component';
import { appConfig } from './app.config';

bootstrapCraft({ config: appConfig, mode: import.meta.env.DEV ? 'development' : 'production' });
