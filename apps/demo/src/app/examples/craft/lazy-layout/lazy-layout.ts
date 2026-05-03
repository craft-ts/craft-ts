import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterOutlet, type Router } from '@angular/router';
import {
  type ExtractDeps,
  type GetDeps,
  type GetPublicComponentProperties,
} from '@craft-ng/core';

@Component({
  selector: 'app-lazy-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="layout">
      <header class="hero">
        <span class="eyebrow">Inherited parent bindings</span>
        <h1>Parent route values inside a lazy feature</h1>
        <p>
          This lazy route only displays the parent route param and the parent
          route data bound as component inputs.
        </p>
      </header>

      <div class="grid">
        <article class="panel">
          <h2>Layout component</h2>
          <div class="facts">
            <div>
              <span>Layout route</span>
              <strong>/craft/lazy-layout/{{ teamId() }}</strong>
            </div>
            <div>
              <span>Parent route input</span>
              <strong>{{ teamId() }}</strong>
            </div>
            <div>
              <span>Parent route data input</span>
              <strong>{{ someParentRouteData() }}</strong>
            </div>
          </div>
        </article>

        <router-outlet />
      </div>
    </section>
  `,
  styles: `
    .layout {
      display: grid;
      gap: 1.5rem;
      min-height: 100%;
    }

    .hero {
      display: grid;
      gap: 0.75rem;
      padding: 1.75rem;
      border-radius: 24px;
      color: #f8fafc;
      background:
        radial-gradient(
          circle at top left,
          rgba(125, 211, 252, 0.28),
          transparent 35%
        ),
        linear-gradient(135deg, #0f172a, #0f766e);
      box-shadow: 0 24px 50px rgba(15, 23, 42, 0.22);
    }

    .eyebrow {
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(226, 232, 240, 0.88);
    }

    .hero h1,
    .hero p {
      margin: 0;
    }

    .hero h1 {
      font-size: clamp(1.75rem, 3vw, 2.4rem);
      line-height: 1.1;
    }

    .hero p {
      max-width: 58ch;
      line-height: 1.7;
      color: rgba(226, 232, 240, 0.92);
    }

    .grid {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
      gap: 1.25rem;
      align-items: start;
    }

    .panel {
      display: grid;
      gap: 1rem;
      padding: 1.5rem;
      border-radius: 20px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
    }

    .panel h2,
    .panel p {
      margin: 0;
    }

    .panel h2 {
      color: #0f172a;
      font-size: 1.35rem;
    }

    .panel p {
      color: #334155;
      line-height: 1.7;
    }

    .facts {
      display: grid;
      gap: 0.85rem;
      margin-top: 0.25rem;
    }

    .facts div {
      display: grid;
      gap: 0.3rem;
      padding: 0.9rem 1rem;
      border-radius: 14px;
      background: #ffffff;
      border: 1px solid #dbeafe;
    }

    .facts span {
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #64748b;
    }

    .facts strong {
      color: #0f172a;
      font-size: 1rem;
    }

    code {
      padding: 0.15rem 0.35rem;
      border-radius: 0.35rem;
      background: rgba(15, 23, 42, 0.06);
      font-family:
        'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 0.92em;
    }

    @media (max-width: 900px) {
      .grid {
        grid-template-columns: 1fr;
      }

      .hero,
      .panel {
        padding: 1.25rem;
      }
    }
  `,
  imports: [RouterOutlet],
})
export default class LazyLayoutComponent {
  public readonly teamId = input.required<string>();
  public readonly someParentRouteData = input.required<string>();
}

export type GenDeps_LazyLayoutComponent = GetDeps<{
  deps: {
    RouterOutlet: RouterOutlet;
    Router: Router;
  };
  propertiesDeps: {
    teamId: ExtractDeps<LazyLayoutComponent['teamId']>;
    someParentRouteData: ExtractDeps<
      LazyLayoutComponent['someParentRouteData']
    >;
  };
  provided: {};
  publicProperties: GetPublicComponentProperties<LazyLayoutComponent>;
  missingProvider: {
    Router: Router;
  };
}>;
