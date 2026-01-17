import { InjectionToken, Type } from '@angular/core';
import {
  ContextConstraints,
  craftFactoryEntries,
  CraftFactoryEntries,
  CraftFactoryUtility,
  partialContext,
  PartialContext,
  StoreConfigConstraints,
} from './craft';

type ProviderTokenWithoutAbstract<T> = Type<T> | InjectionToken<T>;

type InferProvidedType<T> =
  T extends ProviderTokenWithoutAbstract<infer U> ? U : never;

type SpecificCraftInjectionsOutputs<Injections extends {}> = PartialContext<{
  _injections: {
    [key in keyof Injections as Uncapitalize<key & string>]: InferProvidedType<
      Injections[key]
    >;
  };
}>;

type CraftInputsOutputs<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  Injections extends {},
> = CraftFactoryUtility<
  Context,
  StoreConfig,
  SpecificCraftInjectionsOutputs<Injections>
>;

// todo checker si ok avec les token si valeur bien infer / service / token et générics

/**
 * Injects Angular services and tokens into a craft store, making them accessible to all craft entries.
 *
 * This function integrates Angular's dependency injection system into craft stores by:
 * - Injecting services, injection tokens, and providers
 * - Making injected dependencies accessible in all craft entries (queries, mutations, states)
 * - Supporting generic services with type parameters
 * - Automatically converting injection keys to camelCase for context access
 * - Providing full type safety for injected dependencies
 * - Accessing services outside of direct injection context
 *
 * @remarks
 * **Naming Convention:**
 * - Define injections with PascalCase keys: `{ MyService, UserRepository }`
 * - Access in context with camelCase: `context.myService`, `context.userRepository`
 * - Automatic conversion preserves type information
 *
 * **Use Cases:**
 * - **Service integration**: Access Angular services (HttpClient, Router, etc.) in queries/mutations
 * - **API clients**: Inject custom API service classes for data fetching
 * - **State services**: Access existing Angular services that manage state
 * - **Configuration**: Inject configuration tokens and environment settings
 * - **Third-party libraries**: Access library services and utilities
 * - **Testing**: Mock services by providing test implementations
 *
 * **Injection Types:**
 * - **Services**: Injectable classes marked with `@Injectable()`
 * - **Injection Tokens**: `InjectionToken<T>` for non-class dependencies
 * - **Generic Services**: Services with type parameters `Service<T>`
 * - **Abstract Classes**: Base classes with implementations provided elsewhere
 *
 * **Context Access:**
 * - Injections available in all craft entries via context parameter
 * - Access pattern: `context.serviceName` (lowercase first letter)
 * - Can access other context entries in the injection factory function
 *
 * **Reactive Integration:**
 * - Services can expose signals that queries/mutations react to
 * - Service methods can be called from query loaders or mutation handlers
 * - Injected services maintain their own lifecycle and state
 *
 * @template Context - The craft store context type
 * @template StoreConfig - The craft store configuration type
 * @template Injections - Record of injection keys to provider types
 *
 * @param injections - Factory function that receives the craft context and returns a record of injections.
 *   Keys should be PascalCase (matching service/token names), values should be service classes or injection tokens.
 *   Has access to all other craft entries defined before it.
 *
 * @returns A craft factory utility that:
 *   - Injects all specified dependencies using Angular's injector
 *   - Makes them accessible in camelCase in the craft context
 *   - Provides full type safety for injected services
 *
 * @example
 * Basic service injection
 * ```ts
 * @Injectable({ providedIn: 'root' })
 * class UserApiService {
 *   constructor(private http: HttpClient) {}
 *
 *   getUser(id: string) {
 *     return this.http.get<User>(`/api/users/${id}`);
 *   }
 *
 *   updateUser(user: User) {
 *     return this.http.patch<User>(`/api/users/${user.id}`, user);
 *   }
 * }
 *
 * const { injectCraft } = craft(
 *   { name: '', providedIn: 'root' },
 *   craftInject(() => ({
 *     UserApiService, // Inject the service
 *   })),
 *   craftQuery('user', ({ userApiService }) =>
 *     query({
 *       params: () => 'user-123',
 *       loader: async ({ params }) => {
 *         // Use the injected service
 *         return firstValueFrom(userApiService.getUser(params));
 *       },
 *     })
 *   ),
 *   craftMutations(({ userApiService }) => ({
 *     updateUser: mutation({
 *       method: (user: User) => user,
 *       loader: async ({ params }) => {
 *         // Use the injected service in mutation
 *         return firstValueFrom(userApiService.updateUser(params));
 *       },
 *     }),
 *   }))
 * );
 *
 * const store = injectCraft();
 * // Service is used internally by queries and mutations
 * ```
 *
 * @example
 * Multiple service injections
 * ```ts
 * @Injectable({ providedIn: 'root' })
 * class AuthService {
 *   currentUser = signal<User | null>(null);
 *
 *   isAuthenticated() {
 *     return this.currentUser() !== null;
 *   }
 * }
 *
 * @Injectable({ providedIn: 'root' })
 * class ApiClient {
 *   constructor(private http: HttpClient) {}
 *
 *   get<T>(url: string) {
 *     return this.http.get<T>(url);
 *   }
 * }
 *
 * const { injectCraft } = craft(
 *   { name: '', providedIn: 'root' },
 *   craftInject(() => ({
 *     AuthService,
 *     ApiClient,
 *     Router, // Can inject Angular services too
 *   })),
 *   craftQuery('protectedData', ({ authService, apiClient }) =>
 *     query({
 *       params: () => authService.currentUser()?.id,
 *       loader: async ({ params }) => {
 *         if (!params) return null;
 *         return firstValueFrom(apiClient.get(`/api/protected/${params}`));
 *       },
 *     })
 *   )
 * );
 *
 * const store = injectCraft();
 * // Queries automatically react to authService.currentUser changes
 * ```
 *
 * @example
 * Injection tokens for configuration
 * ```ts
 * interface AppConfig {
 *   apiUrl: string;
 *   timeout: number;
 * }
 *
 * const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG', {
 *   providedIn: 'root',
 *   factory: () => ({
 *     apiUrl: 'https://api.example.com',
 *     timeout: 5000,
 *   }),
 * });
 *
 * const { injectCraft } = craft(
 *   { name: '', providedIn: 'root' },
 *   craftInject(() => ({
 *     AppConfig: APP_CONFIG, // Inject token
 *   })),
 *   craftQuery('data', ({ appConfig }) =>
 *     query({
 *       params: () => ({}),
 *       loader: async () => {
 *         // Use config from token
 *         const response = await fetch(`${appConfig.apiUrl}/data`, {
 *           signal: AbortSignal.timeout(appConfig.timeout),
 *         });
 *         return response.json();
 *       },
 *     })
 *   )
 * );
 *
 * const store = injectCraft();
 * // Queries use configuration from injection token
 * ```
 *
 * @example
 * Generic service injection
 * ```ts
 * @Injectable({ providedIn: 'root' })
 * class Repository<T> {
 *   private cache = new Map<string, T>();
 *
 *   get(id: string): T | undefined {
 *     return this.cache.get(id);
 *   }
 *
 *   set(id: string, value: T): void {
 *     this.cache.set(id, value);
 *   }
 * }
 *
 * type Product = { id: string; name: string; price: number };
 *
 * const { injectCraft } = craft(
 *   { name: '', providedIn: 'root' },
 *   craftInject(() => ({
 *     ProductRepository: Repository<Product>, // Specify generic type
 *   })),
 *   craftQuery('product', ({ productRepository }) =>
 *     query({
 *       params: () => 'product-1',
 *       loader: async ({ params }) => {
 *         // Check cache first
 *         const cached = productRepository.get(params);
 *         if (cached) return cached;
 *
 *         // Fetch and cache
 *         const response = await fetch(`/api/products/${params}`);
 *         const product = await response.json();
 *         productRepository.set(params, product);
 *         return product;
 *       },
 *     })
 *   )
 * );
 *
 * const store = injectCraft();
 * // productRepository is typed as Repository<Product>
 * ```
 *
 * @example
 * Service with signals for reactive state
 * ```ts
 * @Injectable({ providedIn: 'root' })
 * class FilterService {
 *   searchTerm = signal('');
 *   selectedCategory = signal<string | null>(null);
 *
 *   setSearch(term: string) {
 *     this.searchTerm.set(term);
 *   }
 *
 *   setCategory(category: string | null) {
 *     this.selectedCategory.set(category);
 *   }
 * }
 *
 * const { injectCraft } = craft(
 *   { name: '', providedIn: 'root' },
 *   craftInject(() => ({
 *     FilterService,
 *   })),
 *   craftQuery('products', ({ filterService }) =>
 *     query({
 *       params: () => ({
 *         search: filterService.searchTerm(),
 *         category: filterService.selectedCategory(),
 *       }),
 *       loader: async ({ params }) => {
 *         const query = new URLSearchParams({
 *           search: params.search,
 *           category: params.category ?? '',
 *         });
 *         const response = await fetch(`/api/products?${query}`);
 *         return response.json();
 *       },
 *     })
 *   )
 * );
 *
 * const store = injectCraft();
 * // Query automatically re-executes when filter signals change
 *
 * // In a component
 * export class FilterComponent {
 *   filterService = inject(FilterService);
 *
 *   onSearch(term: string) {
 *     this.filterService.setSearch(term);
 *     // Store query reacts automatically
 *   }
 * }
 * ```
 *
 * @example
 * Accessing context entries in injection factory
 * ```ts
 * @Injectable({ providedIn: 'root' })
 * class LoggingService {
 *   log(message: string) {
 *     console.log(`[LOG] ${message}`);
 *   }
 * }
 *
 * const { injectCraft } = craft(
 *   { name: '', providedIn: 'root' },
 *   craftSources({
 *     error: source<Error>(),
 *   }),
 *   craftInject(({ error }) => {
 *     // Can access previous context entries
 *     return {
 *       LoggingService,
 *     };
 *   }),
 *   craftState('errorLog', ({ error, loggingService }) =>
 *     state([] as string[], {
 *       bindSources: {
 *         error: (errors, err) => {
 *           // Use injected service
 *           loggingService.log(`Error occurred: ${err.message}`);
 *           return [...errors, err.message];
 *         },
 *       },
 *     })
 *   )
 * );
 *
 * const store = injectCraft();
 * store.setError(new Error('Something went wrong'));
 * // Logging service is used to log the error
 * ```
 *
 * @example
 * Complex service composition
 * ```ts
 * @Injectable({ providedIn: 'root' })
 * class CacheService {
 *   private cache = new Map<string, { data: unknown; timestamp: number }>();
 *
 *   get<T>(key: string, maxAge: number): T | null {
 *     const entry = this.cache.get(key);
 *     if (!entry) return null;
 *
 *     if (Date.now() - entry.timestamp > maxAge) {
 *       this.cache.delete(key);
 *       return null;
 *     }
 *
 *     return entry.data as T;
 *   }
 *
 *   set(key: string, data: unknown): void {
 *     this.cache.set(key, { data, timestamp: Date.now() });
 *   }
 * }
 *
 * @Injectable({ providedIn: 'root' })
 * class HttpService {
 *   constructor(
 *     private http: HttpClient,
 *     private cache: CacheService
 *   ) {}
 *
 *   async fetchWithCache<T>(url: string, cacheKey: string): Promise<T> {
 *     // Check cache (5 minute expiry)
 *     const cached = this.cache.get<T>(cacheKey, 5 * 60 * 1000);
 *     if (cached) return cached;
 *
 *     // Fetch and cache
 *     const data = await firstValueFrom(this.http.get<T>(url));
 *     this.cache.set(cacheKey, data);
 *     return data;
 *   }
 * }
 *
 * const { injectCraft } = craft(
 *   { name: '', providedIn: 'root' },
 *   craftInject(() => ({
 *     HttpService,
 *   })),
 *   craftQuery('userData', ({ httpService }) =>
 *     query({
 *       params: () => 'user-123',
 *       loader: async ({ params }) => {
 *         // Service handles caching internally
 *         return httpService.fetchWithCache(
 *           `/api/users/${params}`,
 *           `user-${params}`
 *         );
 *       },
 *     })
 *   )
 * );
 *
 * const store = injectCraft();
 * // Queries benefit from service's internal caching
 * ```
 */
export function craftInject<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  Injections extends {},
>(
  injections: (entries: CraftFactoryEntries<Context>) => Injections,
): CraftInputsOutputs<Context, StoreConfig, Injections> {
  return () => (contextData, injector) => {
    const injectedInjections = Object.entries(
      injections(craftFactoryEntries(contextData)),
    ).reduce(
      (acc, [key, injection]) => ({
        ...acc,
        [uncapitalize(key)]: injector.get(injection as any),
      }),
      {},
    );
    return partialContext({
      _injections: injectedInjections,
    }) as SpecificCraftInjectionsOutputs<Injections>;
  };
}

function uncapitalize(str: string) {
  return str.charAt(0).toLowerCase() + str.slice(1);
}
