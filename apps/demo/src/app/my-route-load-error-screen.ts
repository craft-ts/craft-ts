import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import {
  injectCraftRouteLoadError,
  injectCraftRouteLoadRecovery,
  provideHostName,
  type ExtractDeps,
  type GetDeps,
  type GetPublicComponentProperties,
} from '@craft-ng/core';

@Component({
  selector: 'app-route-load-error',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="route-load-error">
      <h2>⚠️ Route chunk failed</h2>
      <p>{{ message() }}</p>

      <div class="actions">
        <button type="button" (click)="retry()">Retry route load</button>
        <button type="button" (click)="reload()">Reload app</button>
      </div>
    </div>
  `,
  styles: [
    `
      .route-load-error {
        padding: 2rem;
        border: 1px solid #f97316;
        border-radius: 8px;
        background: #fff7ed;
        color: #9a3412;
      }

      .actions {
        display: flex;
        gap: 0.75rem;
        margin-top: 1rem;
      }
    `,
  ],
  providers: [provideHostName('component:MyRouteLoadErrorScreen')],
})
export class MyRouteLoadErrorScreen {
  readonly error = injectCraftRouteLoadError();
  readonly recovery = injectCraftRouteLoadRecovery();

  readonly message = computed(() => {
    const error = this.error();
    if (!error) return 'The requested route chunk could not be loaded.';

    return `Failed to load ${error.payload.phase} for route "${error.payload.routePath}" after ${error.payload.attempt} attempts.`;
  });

  retry(): void {
    void this.recovery.retry();
  }

  reload(): void {
    this.recovery.reload();
  }
}

export type GenDeps_MyRouteLoadErrorScreen = GetDeps<{
  deps: {};
  propertiesDeps: {
    error: {
      CraftRouteLoadError: ReturnType<typeof injectCraftRouteLoadError>;
    };
    recovery: {
      CraftRouteLoadRecovery: ReturnType<typeof injectCraftRouteLoadRecovery>;
    };
    message: ExtractDeps<MyRouteLoadErrorScreen['message']>;
  };
  provided: {
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: GetPublicComponentProperties<MyRouteLoadErrorScreen>;
  missingProvider: {
    CraftRouteLoadError: ReturnType<typeof injectCraftRouteLoadError>;
    CraftRouteLoadRecovery: ReturnType<typeof injectCraftRouteLoadRecovery>;
  };
}>;
