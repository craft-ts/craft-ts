import { bootstrapCraft } from '@craft-ts/component';
import { appConfig } from './app.config';
import './app.css';
import 'virtual:craft-style.css';

bootstrapCraft({ config: appConfig, mode: import.meta.env.DEV ? 'development' : 'production' });
