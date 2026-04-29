import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { craftException, queryParam, toCraftService, type DerivedService, type GetDeps, type GetInjectedServiceDependencies, type GetPublicComponentProperties, type GetServiceOutput } from '@craft-ng/core';

const { injectActivatedRoute } = toCraftService({
  name: 'ActivatedRoute',
  scope: 'global',
  token: ActivatedRoute,
});

const { injectRouter } = toCraftService({
  name: 'Router',
  scope: 'global',
  token: Router,
});

@Component({
  selector: 'app-exception-query-param',
  imports: [CommonModule],
  styles: [
    `
      .query-param-demo {
        margin-top: 24px;
        padding: 16px;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        background: #f8fafc;
      }

      .actions {
        display: flex;
        gap: 8px;
        margin: 12px 0;
      }

      .btn {
        padding: 8px 14px;
        border: 1px solid #cbd5e0;
        border-radius: 6px;
        background: white;
        color: #334155;
        cursor: pointer;
      }

      .row {
        margin: 6px 0;
        font-size: 14px;
      }

      .error {
        color: #b91c1c;
      }
    `,
  ],
  template: `
    <section class="query-param-demo">
      <h4>QueryParam parse exception</h4>

      <div class="actions">
        <button type="button" class="btn" (click)="navigateSuccess()">
          Navigate success
        </button>
        <button type="button" class="btn" (click)="navigateException()">
          Navigate exception
        </button>
      </div>

      <p class="row">
        <strong>Parsed value:</strong> {{ modeQueryParam.mode() }}
      </p>

      @if (modeQueryParam.exceptions().parse.mode; as parseException) {
        <p class="row error">
          <strong>Exception:</strong>
          {{ parseException.code }} (received:
          {{ parseException.payload.received }})
        </p>
      } @else {
        <p class="row"><strong>Exception:</strong> none</p>
      }
    </section>
  `,
})
export default class ExceptionQueryParamComponent {
  private readonly router = injectRouter(undefined, ({ navigate }) => ({
    navigate,
  }));
  private readonly activatedRoute = injectActivatedRoute();

  protected readonly modeQueryParam = queryParam({
    state: {
      mode: {
        fallbackValue: 'fallbackValue' as const,
        parse: (value: string) =>
          value === 'success'
            ? ('success' as const)
            : craftException(
                { code: 'InvalidModeFromUrl' },
                { received: value as string },
              ),
        serialize: (value: unknown) => String(value),
      },
    },
  });

  protected navigateSuccess(): void {
    void this.router.navigate([], {
      relativeTo: this.activatedRoute,
      queryParams: { mode: 'success' },
      queryParamsHandling: 'merge',
    });
  }

  protected navigateException(): void {
    void this.router.navigate([], {
      relativeTo: this.activatedRoute,
      queryParams: { mode: 'exception' },
      queryParamsHandling: 'merge',
    });
  }
}

export type GenDeps_ExceptionQueryParamComponent = GetDeps<{
      deps: {
        CommonModule: CommonModule;
        Router: DerivedService<GetInjectedServiceDependencies<typeof injectRouter>, {
          derivedPropertiesUsed: {
            navigate: GetServiceOutput<typeof injectRouter>["navigate"];
          };
          derivedPropertiesExposed: {
            navigate: GetServiceOutput<typeof injectRouter>["navigate"];
          };
        }>;
        ActivatedRoute: GetInjectedServiceDependencies<typeof injectActivatedRoute>;
      };
      provided: {};
      publicProperties: GetPublicComponentProperties<ExceptionQueryParamComponent>;
    }>;
