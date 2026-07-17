import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import {
  componentMonitoring,
  injectCraftGlobalError,
  provideHostName,
  type ExtractDeps,
  type GetDeps,
  type GetPublicComponentProperties,
} from '@craft-ng/core';

/**
 * The application-wide error screen rendered by `CraftRouterOutlet` when a route
 * exception handler delegates to `globalError()`. It reads its exception, typed
 * as the exhaustive union of every code routed here (maintained in
 * `CraftGlobalExceptionRegistry` by the ESLint autofix), and discriminates on
 * `code`.
 */
@Component({
  selector: 'app-global-error',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="global-error">
      <h2>⚠️ {{ title() }}</h2>
      <p>{{ message() }}</p>
    </div>
  `,
  styles: [
    `
      .global-error {
        padding: 2rem;
        border: 1px solid #fca5a5;
        border-radius: 8px;
        background: #fef2f2;
        color: #991b1b;
      }
    `,
  ],
  providers: [provideHostName('component:MyGlobalErrorScreen')],
})
export class MyGlobalErrorScreen {
  private readonly _monitoring = componentMonitoring();
  readonly error = injectCraftGlobalError();

  readonly title = computed(() => {
    const exception = this.error();
    return exception?.code === 'USER_DISABLED'
      ? 'Account disabled'
      : 'Something went wrong';
  });

  readonly message = computed(() => {
    const exception = this.error();
    switch (exception?.code) {
      case 'USER_DISABLED':
        return 'This account has been disabled. Contact support to restore access.';
      default:
        return 'An unexpected error occurred while loading this page.';
    }
  });
}

export type GenDeps_MyGlobalErrorScreen = GetDeps<{
  deps: {};
  propertiesDeps: {
    _monitoring: ExtractDeps<MyGlobalErrorScreen['_monitoring']>;
    error: {
      CraftGlobalError: ReturnType<typeof injectCraftGlobalError>;
    };
    title: ExtractDeps<MyGlobalErrorScreen['title']>;
    message: ExtractDeps<MyGlobalErrorScreen['message']>;
  };
  provided: {
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: GetPublicComponentProperties<MyGlobalErrorScreen>;
  missingProvider: {
    CraftGlobalError: ReturnType<typeof injectCraftGlobalError>;
  };
}>;
