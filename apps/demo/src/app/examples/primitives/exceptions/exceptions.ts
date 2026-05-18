import { Component, signal } from '@angular/core';
import {
    componentMonitoring,
    craftException,
    provideHostName,
    query,
    type ExtractDeps,
    type GetDeps,
    type GetPublicComponentProperties
} from '@craft-ng/core';

type User = {
  id: string;
  name: string;
  email: string;
};

type Scenario = 'success' | 'not-found' | 'consent-missing' | 'forbidden';

@Component({
  selector: 'app-exceptions',
  styles: [
    `
      .actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }

      .btn {
        padding: 8px 16px;
        border: 1px solid #e2e8f0;
        background: white;
        border-radius: 6px;
        color: #4a5568;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }

      .btn:hover {
        background: #f8fafc;
        border-color: #cbd5e0;
      }

      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `,
  ],
  template: `
    <h3>Query user with business exceptions ({{userQuery.status()}})</h3>

    <div class="actions">
      <button type="button" class="btn" (click)="setScenario('success')">
        Success
      </button>
      <button type="button" class="btn" (click)="setScenario('not-found')">
        User not found
      </button>
      <button
        type="button"
        class="btn"
        (click)="setScenario('consent-missing')"
      >
        Consent missing
      </button>
      <button type="button" class="btn" (click)="setScenario('forbidden')">
        Access forbidden
      </button>
    </div>

    @if (userQuery.isLoading()) {
      <p>Loading user...</p>
    } @else if (userQuery.exceptions().loader; as exception) {
      <!-- code: "UserNotFoundException" | "UserConsentMissingException" | "UserAccessForbiddenException" -->
      @let exceptionCode = exception.code;
      @switch (exceptionCode) {
        @case ('UserNotFoundException') {
          <p>❌ UserNotFoundException</p>
        }
        @case ('UserAccessForbiddenException') {
          <p>⛔ UserAccessForbiddenException</p>
        }
        @case ('UserConsentMissingException') {
          <p>⚠️ UserConsentMissingException</p>
          <button type="button" class="btn" (click)="acceptConsent()">
            Accept consent
          </button>
        }
        @default never;
      }
    } @else if (userQuery.safeValue(); as user) {
      <div>
        <p><strong>ID:</strong> {{ user.id }}</p>
        <p><strong>Name:</strong> {{ user.name }}</p>
        <p><strong>Email:</strong> {{ user.email }}</p>
      </div>
    }
  `,
  providers: [provideHostName('component:ExceptionsComponent')],
})
export default class ExceptionsComponent {
  private readonly _monitoring = componentMonitoring();
  private readonly scenario = signal<Scenario>('success');

  protected readonly userQuery = query({
    params: () => this.scenario(),
    loader: async ({ params }) => this.mockGetUser(params),
  });

  protected setScenario(scenario: Scenario): void {
    this.scenario.set(scenario);
  }

  protected acceptConsent(): void {
    return;
  }

  private async mockGetUser(scenario: Scenario) {
    await new Promise((resolve) => setTimeout(resolve, 600));

    switch (scenario) {
      case 'not-found':
        return craftException(
          { code: 'UserNotFoundException' },
          { message: 'User does not exist' as const },
        );
      case 'consent-missing':
        return craftException(
          { code: 'UserConsentMissingException' },
          { message: 'User consent is required' as const },
        );
      case 'forbidden':
        return craftException(
          { code: 'UserAccessForbiddenException' },
          { message: 'Access to this user is forbidden' as const },
        );
      default:
        return {
          id: 'user-1',
          name: 'John Doe',
          email: 'john@doe.dev',
        } satisfies User;
    }
  }
}

export type GenDeps_ExceptionsComponent = GetDeps<{
      deps: {};
      propertiesDeps: {
        _monitoring: ExtractDeps<ExceptionsComponent["_monitoring"]>;
        scenario: ExtractDeps<ExceptionsComponent["scenario"]>;
        userQuery: ExtractDeps<ExceptionsComponent["userQuery"]>;
      };
      provided: {
        HostName: ReturnType<typeof provideHostName>;
      };
      publicProperties: GetPublicComponentProperties<ExceptionsComponent>;
    }>;
