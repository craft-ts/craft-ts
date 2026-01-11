import { CommonModule } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { ApiService, User } from './api.service';
import { Router } from '@angular/router';
import { StatusComponent } from '../../../ui/status.component';
import { query, mutation } from '@ng-craft/core';

@Component({
  selector: 'app-no-store',
  imports: [CommonModule, StatusComponent],
  styleUrls: ['mutation.css'],
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

    <input #nameInput type="text" placeholder="New name" />
    <button (click)="updateUserName.mutate(nameInput.value)">
      Update name
    </button>
  `,
})
export default class GlobalQuery {
  public readonly userId = input<string>();
  private readonly apiService = inject(ApiService);

  protected readonly userQuery = query({
    params: this.userId,
    loader: ({ params: userId }) => this.apiService.getItemById(userId),
    preservePreviousValue: () => true, // keep the previous user display while the new one fetching
  });

  protected readonly updateUserName = mutation({
    method: (userName: string) =>
      this.userQuery.hasValue()
        ? {
            ...(this.userQuery.value() as User),
            name: userName,
          }
        : undefined,
    loader: ({ params: user }) => this.apiService.updateItem(user),
  });

  private readonly router = inject(Router);

  protected nextPage() {
    this.router.navigate(['no-store', parseInt(this.userId() ?? '0') + 1]);
  }

  protected previousPage() {
    this.router.navigate(['no-store', parseInt(this.userId() ?? '10') - 1]);
  }
}
