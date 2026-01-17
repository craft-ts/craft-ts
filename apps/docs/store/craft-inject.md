# craftInject

Inject Angular services and tokens into craft stores.

## Import

```typescript
import { craft, craftInject } from '@ngcraft/core';
```

## Basic Pattern

```typescript
@Injectable({ providedIn: 'root' })
class UserApiService {
  constructor(private http: HttpClient) {}

  getUser(id: string) {
    return this.http.get<User>(`/api/users/${id}`);
  }

  updateUser(user: User) {
    return this.http.patch<User>(`/api/users/${user.id}`, user);
  }
}

const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftInject(() => ({
    UserApiService, // Inject the service
  })),
  craftQuery('user', ({ userApiService }) =>
    query({
      params: () => 'user-123',
      loader: async ({ params }) => {
        // Use the injected service
        return firstValueFrom(userApiService.getUser(params));
      },
    }),
  ),
  craftMutations(({ userApiService }) => ({
    updateUser: mutation({
      method: (user: User) => user,
      loader: async ({ params }) => {
        // Use the injected service in mutation
        return firstValueFrom(userApiService.updateUser(params));
      },
    }),
  })),
);

const store = injectCraft();
// Service is used internally by queries and mutations
```

## Multiple Services

```typescript
@Injectable({ providedIn: 'root' })
class AuthService {
  currentUser = signal<User | null>(null);

  isAuthenticated() {
    return this.currentUser() !== null;
  }
}

@Injectable({ providedIn: 'root' })
class ApiClient {
  constructor(private http: HttpClient) {}

  get<T>(url: string) {
    return this.http.get<T>(url);
  }
}

const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftInject(() => ({
    AuthService,
    ApiClient,
    Router, // Can inject Angular services too
  })),
  craftQuery('protectedData', ({ authService, apiClient }) =>
    query({
      params: () => authService.currentUser()?.id,
      loader: async ({ params }) => {
        if (!params) return null;
        return firstValueFrom(apiClient.get(`/api/protected/${params}`));
      },
    }),
  ),
);

const store = injectCraft();
// Queries automatically react to authService.currentUser changes
```

## Injection Tokens

```typescript
interface AppConfig {
  apiUrl: string;
  timeout: number;
}

const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG', {
  providedIn: 'root',
  factory: () => ({
    apiUrl: 'https://api.example.com',
    timeout: 5000,
  }),
});

const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftInject(() => ({
    AppConfig: APP_CONFIG, // Inject token
  })),
  craftQuery('data', ({ appConfig }) =>
    query({
      params: () => ({}),
      loader: async () => {
        // Use configuration
        const response = await fetch(`${appConfig.apiUrl}/data`, {
          signal: AbortSignal.timeout(appConfig.timeout),
        });
        return response.json();
      },
    }),
  ),
);

const store = injectCraft();
```

## Generic Services

```typescript
@Injectable({ providedIn: 'root' })
class Repository<T> {
  private data = signal<T[]>([]);

  getAll(): T[] {
    return this.data();
  }

  add(item: T) {
    this.data.update((items) => [...items, item]);
  }
}

const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftInject(() => ({
    UserRepository: Repository<User>, // Inject with type parameter
  })),
  craftState('users', ({ userRepository }) =>
    state(userRepository.getAll(), ({ set, state }) => ({
      addUser: (user: User) => {
        userRepository.add(user);
        set(userRepository.getAll());
      },
    })),
  ),
);

const store = injectCraft();
```

## Key Features

- **Service integration**: Access Angular services in queries and mutations
- **Type safety**: Full TypeScript support for injected services
- **Naming convention**: PascalCase keys → camelCase context access
- **Reactive**: Services can expose signals for reactive updates
- **Testing**: Easy to mock services for testing

## Naming Convention

- Define with PascalCase: `{ MyService, UserRepository }`
- Access with camelCase: `context.myService`, `context.userRepository`

## See Also

- [craftQuery](/store/craft-query) - Use services in queries
- [craftMutations](/store/craft-mutations) - Use services in mutations
- [craft](/store/craft) - Base store creation
