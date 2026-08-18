import { bootstrapCraft } from '@craft-ng/component';
import { appConfig } from './app/app.config';
import { startDemoTypecheckIndicator } from './demo-typecheck-indicator';

startDemoTypecheckIndicator();
bootstrapCraft({ config: appConfig });
