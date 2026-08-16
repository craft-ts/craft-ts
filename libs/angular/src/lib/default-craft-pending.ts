import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
  CRAFT_LOADING_TEXT,
  ɵregisterDefaultCraftPendingComponent,
  type GetDeps,
  type GetPublicComponentProperties,
} from '@craft-ng/core';
import { injectCraft } from './inject-craft';

/**
 * The default pending component: a single element rendering {@link CRAFT_LOADING_TEXT}.
 * Override globally with `withPendingComponent` or per route via the
 * route's `pendingComponent` field.
 */
@Component({
  selector: 'craft-pending',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="craft-pending">{{ loading() }}</div>`,
  styles: [
    `
      .craft-pending {
        padding: 1rem;
        font-family:
          system-ui,
          -apple-system,
          sans-serif;
        color: #6b7280;
      }
    `,
  ],
})
export class DefaultCraftPendingComponent {
  readonly loading = injectCraft(CRAFT_LOADING_TEXT);
}

ɵregisterDefaultCraftPendingComponent(DefaultCraftPendingComponent);

export type GenDeps_DefaultCraftPendingComponent = GetDeps<{
  deps: {};
  propertiesDeps: {
    loading: {
      CRAFT_LOADING_TEXT: typeof CRAFT_LOADING_TEXT;
    };
  };
  provided: {};
  publicProperties: GetPublicComponentProperties<DefaultCraftPendingComponent>;
  missingProvider: {
    CRAFT_LOADING_TEXT: typeof CRAFT_LOADING_TEXT;
  };
}>;
