import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import {
  craftUse,
  componentMonitoring,
  craftMethod,
  CraftRouterToYield,
  insertLocalStoragePersister,
  provideHostName,
  query,
  type ExtractDeps,
  type GetDeps,
  type GetPublicComponentProperties,
} from '@craft-ng/core';
import {
  StatusComponent,
  type GenDeps_StatusComponent,
} from '../../../ui/status.component';
import { injectApiService } from './api.service';

@Component({
  selector: 'app-query',
  imports: [CommonModule, StatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['query.css'],
  template: `
    <div>
      User
      <app-status [status]="userQuery.status()" />

      :
      @if (userQuery.hasValue()) {
        <pre>{{ userQuery.value() | json }}</pre>
      }
    </div>

    <div>
      <p>
        > Reload the page to see the query result to be retrieved from the cache
      </p>
    </div>

    <button (click)="previousPage()">Previous user</button>
    <button (click)="nextPage()">Next user</button>
  `,
  providers: [provideHostName('component:GlobalQuery')],
})
export default class GlobalQuery {
  private readonly _monitoring = componentMonitoring();
  public readonly userId = input<string>();

  private readonly apiService = injectApiService();

  protected readonly userQuery = craftUse(
    query(
      {
        params: this.userId,
        loader: ({ params: userId }) => this.apiService.getItemById(userId),
      },
      insertLocalStoragePersister({
        storeName: 'demo-app',
        key: 'user-query',
      }),
    ),
  );

  protected nextPage = craftMethod('nextPage', this, function* () {
    return yield* CraftRouterToYield.navigate({
      to: 'query/:userId',
      params: {
        userId: String(parseInt(this.userId() ?? '0', 10) + 1),
      },
    });
  });

  protected previousPage = craftMethod('previousPage', this, function* () {
    return yield* CraftRouterToYield.navigate({
      to: 'query/:userId',
      params: {
        userId: String(parseInt(this.userId() ?? '10', 10) - 1),
      },
    });
  });
}

export type GenDeps_GlobalQuery = GetDeps<{
  deps: {
    CommonModule: CommonModule;
    GenDeps_StatusComponent: GenDeps_StatusComponent;
  };
  propertiesDeps: {
    _monitoring: ExtractDeps<GlobalQuery['_monitoring']>;
    userId: ExtractDeps<GlobalQuery['userId']>;
    apiService: {
      ApiService: ExtractDeps<typeof injectApiService>['ApiService'];
    };
    userQuery: ExtractDeps<GlobalQuery['userQuery']>;
    nextPage: ExtractDeps<GlobalQuery['nextPage']>;
    previousPage: ExtractDeps<GlobalQuery['previousPage']>;
  };
  provided: {
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: GetPublicComponentProperties<GlobalQuery>;
}>;
