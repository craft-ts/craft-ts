import { ChangeDetectionStrategy, Component } from '@angular/core';
import { GetDeps, provideHostName, type GetPublicComponentProperties } from '@craft-ng/core';
import {
    injectDemoCraftLazyLayoutTeamIdData,
    injectDemoTeamIdParams,
} from '../../../app.routes';
import { OtherComponent, type GenDeps_OtherComponent } from './other';

@Component({
  selector: 'app-lazy-layout-child',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="child-card">
      <span class="badge">Child component</span>
      <h2>Input binding vs inject</h2>
      <p>
        The same parent route values are shown below, first via component inputs
        and then via route-scoped inject helpers.
      </p>

      <dl>
        <div>
          <dt>teamId via inject</dt>
          <dd>{{ injectedTeamId() }}</dd>
        </div>
        <div>
          <dt>someParentRouteData via inject</dt>
          <dd>{{ injectedParentRouteData().someParentRouteData }}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>lazy feature loaded with <code>loadChildren</code></dd>
        </div>
      </dl>
    </article>

    <app-other />
  `,
  styles: `
    .child-card {
      display: grid;
      gap: 0.875rem;
      padding: 1.5rem;
      border-radius: 20px;
      background:
        linear-gradient(
          160deg,
          rgba(14, 116, 144, 0.12),
          rgba(255, 255, 255, 0.95)
        ),
        #ffffff;
      border: 1px solid rgba(14, 116, 144, 0.16);
      box-shadow: 0 18px 45px rgba(14, 116, 144, 0.12);
    }

    .badge {
      justify-self: start;
      padding: 0.35rem 0.7rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #0f766e;
      background: rgba(15, 118, 110, 0.12);
    }

    h2,
    p,
    dl,
    dt,
    dd {
      margin: 0;
    }

    h2 {
      font-size: 1.4rem;
      color: #0f172a;
    }

    p {
      color: #334155;
      line-height: 1.6;
    }

    dl {
      display: grid;
      gap: 0.75rem;
    }

    dl div {
      padding-top: 0.75rem;
      border-top: 1px solid rgba(148, 163, 184, 0.25);
    }

    dt {
      font-size: 0.8rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      margin-bottom: 0.2rem;
    }

    dd {
      color: #0f172a;
      font-weight: 600;
    }

    code {
      padding: 0.15rem 0.35rem;
      border-radius: 0.35rem;
      background: rgba(15, 23, 42, 0.06);
      font-family:
        'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 0.92em;
    }
  `,
  imports: [OtherComponent],
  providers: [provideHostName('component:LazyLayoutChildComponent')]
})
export default class LazyLayoutChildComponent {
  readonly injectedParentRouteData = injectDemoCraftLazyLayoutTeamIdData();
  readonly injectedTeamId = injectDemoTeamIdParams();
  // readonly someParentRouteData = input.required<string>(); // ! not accessible
  // readonly teamId = input.required<string>(); // ! not accessible
  // readonly userId = injectDemoUserIdParams(); // ! ne devrait pas marcher ! TODO
}

export type GenDeps_LazyLayoutChildComponent = GetDeps<{
      deps: {
        GenDeps_OtherComponent: GenDeps_OtherComponent;
      };
      propertiesDeps: {
        injectedParentRouteData: {
            DemoCraftLazyLayoutTeamIdData: ReturnType<typeof injectDemoCraftLazyLayoutTeamIdData>;
          };
        injectedTeamId: {
            DemoTeamIdParams: ReturnType<typeof injectDemoTeamIdParams>;
          };
      };
      provided: {
        HostName: ReturnType<typeof provideHostName>;
      };
      publicProperties: GetPublicComponentProperties<LazyLayoutChildComponent>;
      missingProvider: {
        DemoCraftLazyLayoutTeamIdData: ReturnType<typeof injectDemoCraftLazyLayoutTeamIdData>;
        DemoTeamIdParams: ReturnType<typeof injectDemoTeamIdParams>;
      };
    }>;
