import { bootstrapCraft } from '@craft-ts/component';
import { appConfig } from './app/app.config';
import { startDemoTypecheckIndicator } from './demo-typecheck-indicator';

startDemoTypecheckIndicator();
bootstrapCraft({ config: appConfig });
