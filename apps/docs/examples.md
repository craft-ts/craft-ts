# Examples

Practical examples demonstrating @ng-craft features and patterns.

## Todo Application

Full-featured todo app with filtering, persistence, and async operations.

```typescript
import { Component, inject } from '@angular/core';
import { craft, insertLocalStorage } from '@ng-craft/core';

interface Todo {
  id: number;
  title: string;
  completed: boolean;
  createdAt: Date;
}

const TodoStore = craft((store) => ({
  ...store.state(
    {
      todos: [] as Todo[],
      filter: 'all' as 'all' | 'active' | 'completed',
    },
    {
      insertions: [insertLocalStorage('todos-app')],
    },
  ),

  ...store.computed({
    filteredTodos: (state) => {
      const todos = state.todos();
      const filter = state.filter();
      if (filter === 'all') return todos;
      return todos.filter((t) =>
        filter === 'active' ? !t.completed : t.completed,
      );
    },
    stats: (state) => {
      const todos = state.todos();
      return {
        total: todos.length,
        active: todos.filter((t) => !t.completed).length,
        completed: todos.filter((t) => t.completed).length,
      };
    },
  }),

  ...store.methods({
    addTodo: (state, title: string) => {
      const todo: Todo = {
        id: Date.now(),
        title,
        completed: false,
        createdAt: new Date(),
      };
      state.todos.update((todos) => [...todos, todo]);
    },
    toggleTodo: (state, id: number) => {
      state.todos.update((todos) =>
        todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
      );
    },
    removeTodo: (state, id: number) => {
      state.todos.update((todos) => todos.filter((t) => t.id !== id));
    },
    clearCompleted: (state) => {
      state.todos.update((todos) => todos.filter((t) => !t.completed));
    },
    setFilter: (state, filter: 'all' | 'active' | 'completed') => {
      state.filter.set(filter);
    },
  }),
}));

@Component({
  selector: 'app-todos',
  template: `
    <div class="todo-app">
      <h1>Todos</h1>

      <form (submit)="addTodo($event)">
        <input #input placeholder="What needs to be done?" autocomplete="off" />
      </form>

      <div class="filters">
        <button
          [class.active]="store.filter() === 'all'"
          (click)="store.setFilter('all')"
        >
          All ({{ store.stats().total }})
        </button>
        <button
          [class.active]="store.filter() === 'active'"
          (click)="store.setFilter('active')"
        >
          Active ({{ store.stats().active }})
        </button>
        <button
          [class.active]="store.filter() === 'completed'"
          (click)="store.setFilter('completed')"
        >
          Completed ({{ store.stats().completed }})
        </button>
      </div>

      <ul class="todo-list">
        @for (todo of store.filteredTodos(); track todo.id) {
          <li [class.completed]="todo.completed">
            <input
              type="checkbox"
              [checked]="todo.completed"
              (change)="store.toggleTodo(todo.id)"
            />
            <span>{{ todo.title }}</span>
            <button (click)="store.removeTodo(todo.id)">×</button>
          </li>
        }
      </ul>

      @if (store.stats().completed > 0) {
        <button (click)="store.clearCompleted()">Clear completed</button>
      }
    </div>
  `,
  providers: [TodoStore],
})
export class TodoAppComponent {
  store = inject(TodoStore);

  addTodo(event: Event) {
    event.preventDefault();
    const input = (event.target as HTMLFormElement).querySelector('input')!;
    const title = input.value.trim();
    if (title) {
      this.store.addTodo(title);
      input.value = '';
    }
  }
}
```

## User Authentication

Authentication flow with login, logout, and protected routes.

```typescript
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { craft, insertLocalStorage } from '@ng-craft/core';

interface User {
  id: number;
  name: string;
  email: string;
}

@Injectable({ providedIn: 'root' })
export class AuthStore extends craft((store) => ({
  ...store.state(
    {
      user: null as User | null,
      token: '',
    },
    {
      insertions: [insertLocalStorage('auth-state')],
    },
  ),

  ...store.computed({
    isAuthenticated: (state) => !!state.user() && !!state.token(),
  }),

  ...store.asyncMethod(
    'login',
    async (credentials: { email: string; password: string }) => {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      return response.json();
    },
  ),

  ...store.asyncMethod('logout', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
  }),

  ...store.methods({
    setAuth: (state, data: { user: User; token: string }) => {
      state.user.set(data.user);
      state.token.set(data.token);
    },
    clearAuth: (state) => {
      state.user.set(null);
      state.token.set('');
    },
  }),
})) {
  private router = inject(Router);

  constructor() {
    super();

    // Handle login success
    this.login.onSuccess((data) => {
      this.setAuth(data);
      this.router.navigate(['/dashboard']);
    });

    // Handle logout
    this.logout.onSuccess(() => {
      this.clearAuth();
      this.router.navigate(['/login']);
    });
  }
}

@Component({
  selector: 'app-login',
  template: `
    <form [formGroup]="form" (submit)="handleLogin()">
      <input formControlName="email" type="email" placeholder="Email" />
      <input
        formControlName="password"
        type="password"
        placeholder="Password"
      />

      @if (authStore.login.error()) {
        <p class="error">{{ authStore.login.error()?.message }}</p>
      }

      <button
        type="submit"
        [disabled]="form.invalid || authStore.login.loading()"
      >
        {{ authStore.login.loading() ? 'Logging in...' : 'Login' }}
      </button>
    </form>
  `,
})
export class LoginComponent {
  authStore = inject(AuthStore);

  form = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', Validators.required),
  });

  handleLogin() {
    if (this.form.valid) {
      this.authStore.login.execute(this.form.value as any);
    }
  }
}
```

## More Examples

- **Shopping Cart** - Cart management with persistence
- **Real-time Chat** - WebSocket integration
- **Data Table** - Sorting, filtering, pagination
- **File Upload** - Progress tracking and preview
- **Dashboard** - Multiple data sources
- **Form Wizard** - Multi-step forms
- **Infinite Scroll** - Paginated data loading

Check the [GitHub repository](https://github.com/ng-angular-stack/ng-craft) for complete examples!
