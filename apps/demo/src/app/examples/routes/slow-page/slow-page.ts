import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
  componentMonitoring,
  provideHostName,
  type ExtractDeps,
  type GetDeps,
  type GetPublicComponentProperties,
} from '@craft-ng/core';
import { injectSlowPageRootResolvedData } from './slow-page.routes';

/**
 * Target of the `slow-page` route. It is mounted by `CraftRouterOutlet` ONLY
 * once BOTH the slow `canActivate` (~1.5s) and the slow `resolve` (~1.5s) have
 * settled — until then the URL is already committed and the pending component is
 * shown. The resolved report is read through the generated, fully-typed
 * `injectSlowPageRootResolvedData()` helper.
 */
@Component({
  selector: 'app-slow-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="slow-page">
      <h2>✅ Slow page loaded</h2>
      <p>
        Both the slow guard (~1.5s) and the slow resolver (~1.5s) finished. This
        component was mounted only after the whole chain settled — the URL was
        committed immediately and the pending component was shown meanwhile.
      </p>
      <dl>
        <dt>Report generated at</dt>
        <dd>{{ report().generatedAt }}</dd>
        <dt>Total users</dt>
        <dd>{{ report().totalUsers }}</dd>
      </dl>
    </div>
  `,
  styles: [
    `
      .slow-page {
        padding: 2rem;
        border: 1px solid #bbf7d0;
        border-radius: 8px;
        background: #f0fdf4;
        color: #166534;
      }
      dl {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.25rem 1rem;
        margin-top: 1rem;
      }
      dt {
        font-weight: 600;
      }
    `,
  ],
  providers: [provideHostName('component:SlowPageComponent')],
})
export default class SlowPageComponent {
  private readonly _monitoring = componentMonitoring();
  readonly report = injectSlowPageRootResolvedData();
}

export type GenDeps_SlowPageComponent = GetDeps<{
  deps: {};
  propertiesDeps: {
    _monitoring: ExtractDeps<SlowPageComponent['_monitoring']>;
    report: {
      SlowPageRootResolvedData: ReturnType<
        typeof injectSlowPageRootResolvedData
      >;
    };
  };
  provided: {
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: GetPublicComponentProperties<SlowPageComponent>;
  missingProvider: {
    SlowPageRootResolvedData: ReturnType<typeof injectSlowPageRootResolvedData>;
  };
}>;
