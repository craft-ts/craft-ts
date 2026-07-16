import { Component } from '@angular/core';
import { RouterLinkActive, type Router } from '@angular/router';
import {
  BrowserLocation,
  BrowserWindow,
  componentMonitoring,
  craftMethod,
  CraftRouterLink,
  CraftRouterOutlet,
  GlobalPersisterHandlerServiceToYield,
  provideHostName,
  type ExtractDeps,
  type GetDeps,
  type GetPublicComponentProperties,
} from '@craft-ng/core';

@Component({
  imports: [CraftRouterLink, CraftRouterOutlet, RouterLinkActive],
  selector: 'app-root',
  template: `
    <div class="app-container">
      <nav class="tabs">
        <a
          [craftRouterLink]="{ to: '' }"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: true }"
          >Test</a
        >
        <a
          [craftRouterLink]="{ to: 'query/:userId', params: { userId: '1' } }"
          routerLinkActive="active"
          >Query</a
        >
        <a [craftRouterLink]="{ to: 'slow-page' }" routerLinkActive="active"
          >Slow Page</a
        >
        <a
          [craftRouterLink]="{ to: 'view-transitions' }"
          routerLinkActive="active"
          >View Transitions</a
        >
        <a
          [craftRouterLink]="{
            to: 'mutation/:userId',
            params: { userId: '1' },
          }"
          routerLinkActive="active"
          >Mutation</a
        >
        <a
          [craftRouterLink]="{ to: 'list-with-pagination' }"
          routerLinkActive="active"
          >List with Pagination</a
        >
        <a
          [craftRouterLink]="{ to: 'granular-mutation' }"
          routerLinkActive="active"
          >Granular Mutation</a
        >
        <a [craftRouterLink]="{ to: 'full-demo' }" routerLinkActive="active"
          >Full Demo</a
        >
        <a [craftRouterLink]="{ to: 'pixel-art' }" routerLinkActive="active"
          >Pixel Art</a
        >
        <a
          [craftRouterLink]="{ to: 'pixel-art-matrix' }"
          routerLinkActive="active"
          >Pixel Art Matrix</a
        >
        <a [craftRouterLink]="{ to: 'exceptions' }" routerLinkActive="active"
          >Exceptions</a
        >
        <a [craftRouterLink]="{ to: 'login-form' }" routerLinkActive="active"
          >Login Form</a
        >
        <a
          [craftRouterLink]="{ to: 'exception-query-param' }"
          routerLinkActive="active"
          >Exception QueryParam</a
        >
        <a
          [craftRouterLink]="{
            to: 'craft/query/:userId',
            params: { userId: '1' },
          }"
          routerLinkActive="active"
          >Craft Query</a
        >
        <a
          [craftRouterLink]="{
            to: 'craft/mutation/:userId',
            params: { userId: '1' },
          }"
          routerLinkActive="active"
          >Craft Mutation</a
        >
        <a
          [craftRouterLink]="{ to: 'craft/list-with-pagination' }"
          routerLinkActive="active"
          >Craft List Pagination</a
        >
        <a
          [craftRouterLink]="{ to: 'craft/granular-mutation' }"
          routerLinkActive="active"
          >Craft Granular Mutation</a
        >
        <a
          [craftRouterLink]="{ to: 'craft/full-demo' }"
          routerLinkActive="active"
          >Craft Full Demo</a
        >
        <a
          [craftRouterLink]="{
            to: 'craft/lazy-layout/:teamId/users/:userId',
            params: { teamId: '100', userId: '42' },
          }"
          routerLinkActive="active"
          >Craft Lazy Layout</a
        >
        <a
          [craftRouterLink]="{ to: 'craft-service/counter' }"
          routerLinkActive="active"
          >craftService Counter</a
        >
        <a
          [craftRouterLink]="{ to: 'craft-service/user-detail' }"
          routerLinkActive="active"
          >craftService User Detail</a
        >
        <!-- <a [craftRouterLink]="{ to: 'playground' }" routerLinkActive="active"
          >Playground</a
        > -->
        <a
          [craftRouterLink]="{ to: 'demo-send-context' }"
          routerLinkActive="active"
          >Demo Send Context</a
        >
        <a
          [craftRouterLink]="{
            to: 'guard-demo',
          }"
          routerLinkActive="active"
          >Guard demo</a
        >
      </nav>
      <main class="content">
        <craft-router-outlet></craft-router-outlet>
      </main>
      <button class="clear-cache-btn" (click)="clearCache()">
        🗑️ Clear Cache
      </button>
    </div>
  `,
  styles: `
    .app-container {
      display: flex;
      flex-direction: column;
      height: 100vh;
      background: #fafafa;
    }

    .tabs {
      display: flex;
      gap: 0.25rem;
      background: #ffffff;
      padding: 1rem 1.5rem 0;
      align-items: flex-end;
      border-bottom: 1px solid #e5e7eb;
      overflow-x: auto;
      overflow-y: hidden;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: thin;
      scrollbar-color: #d1d5db #f9fafb;
    }

    .tabs::-webkit-scrollbar {
      height: 4px;
    }

    .tabs::-webkit-scrollbar-track {
      background: #f9fafb;
    }

    .tabs::-webkit-scrollbar-thumb {
      background: #d1d5db;
      border-radius: 2px;
    }

    .tabs::-webkit-scrollbar-thumb:hover {
      background: #9ca3af;
    }

    .tabs a {
      padding: 0.875rem 1.75rem;
      text-decoration: none;
      color: #6b7280;
      background-color: transparent;
      border-radius: 8px 8px 0 0;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      white-space: nowrap;
      font-weight: 600;
      font-size: 0.95rem;
      letter-spacing: 0.2px;
      position: relative;
      flex-shrink: 0;
    }

    .tabs a::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%) scaleX(0);
      width: 80%;
      height: 2px;
      background: #1f2937;
      border-radius: 2px 2px 0 0;
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .tabs a:hover {
      background-color: #f9fafb;
      color: #1f2937;
    }

    .tabs a.active {
      color: #1f2937;
      background-color: #f9fafb;
    }

    .tabs a.active::after {
      transform: translateX(-50%) scaleX(1);
    }

    .clear-cache-btn {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      padding: 1rem 1.5rem;
      background: #374151;
      color: white;
      border: none;
      border-radius: 50px;
      cursor: pointer;
      font-size: 0.95rem;
      font-weight: 600;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      align-items: center;
      gap: 0.5rem;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 1000;
    }

    .clear-cache-btn:hover {
      background: #1f2937;
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
    }

    .clear-cache-btn:active {
      transform: translateY(0);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .content {
      flex: 1;
      overflow: auto;
      padding: 2rem;
      background: white;
      margin: 1.5rem;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
    }

    @media (max-width: 768px) {
      .tabs {
        padding: 0.75rem 1rem 0;
        gap: 0.125rem;
      }

      .tabs a {
        padding: 0.75rem 1.25rem;
        font-size: 0.875rem;
      }

      .clear-cache-btn {
        bottom: 1.5rem;
        right: 1.5rem;
        padding: 0.875rem 1.25rem;
        font-size: 0.875rem;
      }

      .content {
        margin: 1rem;
        padding: 1.5rem;
      }
    }

    @media (max-width: 480px) {
      .tabs {
        padding: 0.5rem 0.75rem 0;
      }

      .tabs a {
        padding: 0.625rem 1rem;
        font-size: 0.8rem;
      }

      .clear-cache-btn {
        bottom: 1rem;
        right: 1rem;
        padding: 0.75rem 1rem;
        font-size: 0.8rem;
        gap: 0.375rem;
      }

      .content {
        margin: 0.75rem;
        padding: 1rem;
        border-radius: 6px;
      }
    }
  `,
  providers: [provideHostName('component:App')],
})
export class App {
  private readonly _monitoring = componentMonitoring();
  clearCache = craftMethod('clearCache', function* () {
    const persister = yield* GlobalPersisterHandlerServiceToYield(
      undefined,
      ({ clearAllCache }) => ({ clearAllCache }),
    );
    persister.clearAllCache();
    yield* BrowserWindow.alert('Cache cleared! The page will reload.');
    yield* BrowserLocation.reload();
  });
}

export type GenDeps_App = GetDeps<{
  deps: {
    RouterLinkActive: RouterLinkActive;
    Router: Router;
    CraftRouterLink: CraftRouterLink;
    CraftRouterOutlet: CraftRouterOutlet;
  };
  propertiesDeps: {
    _monitoring: ExtractDeps<App['_monitoring']>;
    clearCache: ExtractDeps<App['clearCache']>;
  };
  provided: {
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: GetPublicComponentProperties<App>;
  missingProvider: {
    Router: Router;
  };
}>;
