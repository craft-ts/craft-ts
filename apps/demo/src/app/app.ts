import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  imports: [RouterModule],
  selector: 'app-root',
  template: `
    <div class="app-container">
      <nav class="tabs">
        <a
          routerLink="/"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: true }"
          >Test</a
        >
        <a routerLink="/query/1" routerLinkActive="active">Query</a>
        <a routerLink="/mutation/1" routerLinkActive="active">Mutation</a>
        <a routerLink="/list-with-pagination" routerLinkActive="active"
          >List with Pagination</a
        >
        <a routerLink="/granular-mutation" routerLinkActive="active"
          >Granular Mutation</a
        >
      </nav>
      <main class="content">
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
  styles: `
    .app-container {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }

    .tabs {
      display: flex;
      gap: 0;
      background-color: #f5f5f5;
      border-bottom: 2px solid #ddd;
      padding: 0;
    }

    .tabs a {
      padding: 1rem 1.5rem;
      text-decoration: none;
      color: #333;
      border-bottom: 3px solid transparent;
      transition: all 0.2s;
      white-space: nowrap;
    }

    .tabs a:hover {
      background-color: #e8e8e8;
    }

    .tabs a.active {
      color: #007bff;
      border-bottom-color: #007bff;
      background-color: white;
    }

    .content {
      flex: 1;
      overflow: auto;
      padding: 1rem;
    }
  `,
})
export class App {}
