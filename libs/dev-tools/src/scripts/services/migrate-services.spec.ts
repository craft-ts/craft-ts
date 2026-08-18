import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadAngularBrandConfigFromFile } from '../angular-brand-codemod';
import { runServicesMigration } from './migrate-services';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'craft-services-'));
  temporaryDirectories.push(root);
  await Promise.all(
    Object.entries(files).map(async ([path, contents]) => {
      const fullPath = join(root, path);
      const { mkdir } = await import('node:fs/promises');
      await mkdir(join(fullPath, '..'), { recursive: true });
      await writeFile(fullPath, contents, 'utf8');
    }),
  );
  return root;
}

describe('services migration', () => {
  it('migrates a simple root service and its component consumer', async () => {
    const root = await fixture({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { experimentalDecorators: true },
      }),
      'counter.service.ts': `
        import { Injectable } from '@angular/core';
        @Injectable({ providedIn: 'root' })
        export class CounterService {
          count = 0;
          increment(): void { this.count += 1; }
        }
      `,
      'page.ts': `
        import { Component, inject } from '@angular/core';
        import { CounterService } from './counter.service';
        @Component({}) export class Page { counter = inject(CounterService); }
      `,
    });

    const first = await runServicesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });
    const service = await readFile(join(root, 'counter.service.ts'), 'utf8');
    const page = await readFile(join(root, 'page.ts'), 'utf8');

    expect(first.diagnostics).toEqual([]);
    expect(service).toContain(
      "craftService({ name: 'Counter', providedIn: 'global' }",
    );
    expect(service).toContain('function increment(): void');
    expect(page).toContain('injectCounter()');

    const second = await runServicesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });
    expect(second.changedFiles).toEqual([]);
  });

  it('keeps unsafe inheritance and generates a searchable companion', async () => {
    const root = await fixture({
      'tsconfig.json': '{}',
      'legacy.ts': `
        import { Injectable } from '@angular/core';
        class Base {}
        @Injectable() export class LegacyService extends Base {}
      `,
    });
    const result = await runServicesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });
    const companion = await readFile(join(root, 'legacy.craft.ts'), 'utf8');

    expect(result.diagnostics[0]?.code).toBe('NON_CONVERTIBLE_CLASS');
    expect(companion).toContain('CRAFT_IMPLEMENTATION_REQUIRED');
    expect(await readFile(join(root, 'legacy.ts'), 'utf8')).toContain(
      'class LegacyService extends Base',
    );

    const second = await runServicesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });
    expect(second.changedFiles).toEqual([]);
  });

  it('migrates constructor effect statements into the craft service factory', async () => {
    const root = await fixture({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { experimentalDecorators: true },
      }),
      'wizard.ts': `
        import { Service, effect, signal } from '@angular/core';
        @Service({ autoProvided: false })
        export class CheckoutWizard {
          readonly activeStep = signal('delivery');
          readonly visited = signal<string[]>([]);
          constructor() {
            effect(() => {
              this.visited.update((items) => [...items, this.activeStep()]);
            });
          }
        }
      `,
    });

    const result = await runServicesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });

    const output = await readFile(join(root, 'wizard.ts'), 'utf8');
    expect(result.diagnostics).toEqual([]);
    expect(output).toContain("craftService({ name: 'CheckoutWizard'");
    expect(output).toContain('effect(() =>');
    expect(output).toContain('_visited.update');
    expect(output).toContain('_activeStep()');
    expect(output).not.toContain('toCraftService');
  });

  it('imports service helpers for dependencies migrated from other files', async () => {
    const root = await fixture({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { experimentalDecorators: true },
      }),
      'cart.ts': `
        import { Injectable } from '@angular/core';
        @Injectable({ providedIn: 'root' })
        export class CartStore {
          clear(): void {}
        }
      `,
      'checkout/wizard.ts': `
        import { Injectable, inject } from '@angular/core';
        import { CartStore } from '../cart';
        @Injectable()
        export class CheckoutWizard {
          private readonly cartStore = inject(CartStore);
          clear(): void {
            this.cartStore.clear();
          }
        }
      `,
    });

    await runServicesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });

    const output = await readFile(join(root, 'checkout/wizard.ts'), 'utf8');
    expect(output).toContain("import { CartStore } from '../cart'");
    expect(output).toContain('const _cartStore = yield* CartStore();');
  });

  it('preserves imperative state comments while rebuilding service properties', async () => {
    const root = await fixture({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { experimentalDecorators: true },
      }),
      'wizard.ts': `
        import { Service } from '@angular/core';
        import { state } from '@craft-ts/core';
        @Service({ autoProvided: false })
        export class CheckoutWizard {
          // CRAFT_IMPERATIVE_CODE_DETECTED: imperative code detected, prefer a declarative approach.
          readonly activeStep = state('delivery', ({ set, update }) => ({ set, update }));
        }
      `,
    });

    await runServicesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });

    const output = await readFile(join(root, 'wizard.ts'), 'utf8');
    expect(output).toContain(
      '// CRAFT_IMPERATIVE_CODE_DETECTED: imperative code detected, prefer a declarative approach.',
    );
    expect(output).toContain("const _activeStep = yield* state('delivery'");
  });

  it('flags imperative form workflows for a reactive orchestration review', async () => {
    const root = await fixture({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { experimentalDecorators: true },
      }),
      'wizard.ts': `
        import { Service, signal } from '@angular/core';
        @Service({ autoProvided: false })
        export class CheckoutWizard {
          readonly activeStep = signal('delivery');
          readonly stepStatus = signal({ delivery: null });
          readonly checkoutForm = { form: { delivery: { submit: async () => true } } };
          readonly router = { navigate: async (_commands: unknown[]) => true };

          async validateStep(step: 'delivery'): Promise<void> {
            const success = await this.checkoutForm.form[step].submit();
            if (!success) return;
            this.stepStatus.update((status) => ({ ...status, [step]: 'success' }));
            this.activeStep.set('delivery');
            await this.router.navigate(['/checkout', step]);
          }
        }
      `,
    });

    const result = await runServicesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });

    const output = await readFile(join(root, 'wizard.ts'), 'utf8');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'IMPERATIVE_WORKFLOW_REQUIRES_REVIEW',
    );
    expect(output).toContain(
      '// CRAFT_REACTIVE_WORKFLOW_RECOMMENDED: workflow impératif détecté...',
    );
  });

  it('uses function scope for a service injected once by a single component', async () => {
    const root = await fixture({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { experimentalDecorators: true },
      }),
      'wizard.ts': `
        import { Service, signal } from '@angular/core';
        @Service({ autoProvided: false })
        export class CheckoutWizard {
          readonly activeStep = signal('delivery');
        }
      `,
      'page.ts': `
        import { Component, inject } from '@angular/core';
        import { CheckoutWizard } from './wizard';
        @Component({ providers: [CheckoutWizard] })
        export class Page {
          readonly wizard = inject(CheckoutWizard);
        }
      `,
      'page.spec.ts': `
        import { CheckoutWizard } from './wizard';
        const testOnlyReference: CheckoutWizard | undefined = undefined;
      `,
    });

    await runServicesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });

    const service = await readFile(join(root, 'wizard.ts'), 'utf8');
    const page = await readFile(join(root, 'page.ts'), 'utf8');
    expect(service).toContain(
      "craftService({ name: 'CheckoutWizard', providedIn: 'function' }",
    );
    expect(service).not.toContain('provideCheckoutWizard');
    expect(page).toContain('injectCheckoutWizard()');
    expect(page).not.toContain('import { CheckoutWizard }');
    expect(page).not.toContain('provideCheckoutWizard');
  });

  it('keeps toProvide scope when several components share the service', async () => {
    const root = await fixture({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { experimentalDecorators: true },
      }),
      'wizard.ts': `
        import { Service, signal } from '@angular/core';
        @Service({ autoProvided: false })
        export class CheckoutWizard {
          readonly activeStep = signal('delivery');
        }
      `,
      'page.ts': `
        import { Component, inject } from '@angular/core';
        import { CheckoutWizard } from './wizard';
        @Component({ providers: [CheckoutWizard] })
        export class Page {
          readonly wizard = inject(CheckoutWizard);
        }
      `,
      'step.ts': `
        import { Component, inject } from '@angular/core';
        import { CheckoutWizard } from './wizard';
        @Component({})
        export class Step {
          readonly wizard = inject(CheckoutWizard);
        }
      `,
    });

    await runServicesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });

    const service = await readFile(join(root, 'wizard.ts'), 'utf8');
    const page = await readFile(join(root, 'page.ts'), 'utf8');
    expect(service).toContain(
      "craftService({ name: 'CheckoutWizard', providedIn: 'toProvide' }",
    );
    expect(service).toContain('provideCheckoutWizard');
    expect(page).toContain('provideCheckoutWizard()');
  });

  it('keeps toProvide scope for a service injected from a route function', async () => {
    const root = await fixture({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { experimentalDecorators: true },
      }),
      'wizard.ts': `
        import { Service, signal } from '@angular/core';
        @Service({ autoProvided: false })
        export class CheckoutWizard {
          readonly activeStep = signal('delivery');
        }
      `,
      'guard.ts': `
        import { inject } from '@angular/core';
        import { CheckoutWizard } from './wizard';
        export const guard = () => inject(CheckoutWizard).activeStep();
      `,
    });

    await runServicesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });

    const service = await readFile(join(root, 'wizard.ts'), 'utf8');
    expect(service).toContain(
      "craftService({ name: 'CheckoutWizard', providedIn: 'toProvide' }",
    );
    expect(service).toContain('provideCheckoutWizard');
  });

  it('uses the built-in CraftRouter helper for Angular Router dependencies', async () => {
    const root = await fixture({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { experimentalDecorators: true },
      }),
      'wizard.ts': `
        import { Service, effect, inject, signal } from '@angular/core';
        import { Router } from '@angular/router';
        @Service({ autoProvided: false })
        export class CheckoutWizard {
          private readonly router = inject(Router);
          readonly activeStep = signal('delivery');
          constructor() {
            effect(() => {
              this.router.navigate(['/checkout', this.activeStep()]);
            });
          }
        }
      `,
    });

    const result = await runServicesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });

    const output = await readFile(join(root, 'wizard.ts'), 'utf8');
    expect(result.diagnostics).toEqual([]);
    expect(output).toContain('CraftRouter');
    expect(output).toContain('const _router = yield* CraftRouter();');
    expect(output).toContain("_router.navigate(['/checkout', _activeStep()])");
    expect(output).not.toContain('const { Router }');
    expect(output).not.toContain('yield* Router');
    expect(output).not.toContain('toCraftService');
    expect(output).not.toContain("from '@angular/router'");
  });

  it('loads unified config overrides while preserving brand config compatibility', async () => {
    const root = await fixture({
      'tsconfig.json': '{}',
      'craft-dev-tools.config.ts': `
        import { defineCraftDevToolsConfig } from '@craft-ts/dev-tools';
        export default defineCraftDevToolsConfig({
          brand: { importAugmentations: [{ match: { module: 'pkg' }, deps: [{ key: 'Box', symbol: 'Box', typeText: 'Box<string>' }] }] },
          serviceMigration: { overrides: [{ symbol: 'ApiService', name: 'Backend', providedIn: 'manuallyProvidedAtRoot' }] },
        });
      `,
      'api.ts': `
        import { Injectable } from '@angular/core';
        @Injectable() export class ApiService { ping() { return true; } }
      `,
    });
    await runServicesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });
    const output = await readFile(join(root, 'api.ts'), 'utf8');
    expect(output).toContain(
      "name: 'Backend', providedIn: 'manuallyProvidedAtRoot'",
    );
    expect(output).toContain('provideBackend');
    expect(
      loadAngularBrandConfigFromFile(join(root, 'craft-dev-tools.config.ts'))
        .importAugmentations?.[0]?.deps?.[0]?.typeText,
    ).toBe('Box<string>');
  });

  it('preserves generics, avoids property shadowing, and cleans replaced imports', async () => {
    const root = await fixture({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { experimentalDecorators: true },
      }),
      'api.ts': `
        import { Injectable, inject, signal } from '@angular/core';
        @Injectable({ providedIn: 'root' })
        export class ApiService {
          private readonly user = signal<string | null>(null);
          setUser(user: string): void { this.user.set(user); }
          load<T>(value: T): T { return value; }
        }
      `,
      'page.ts': `
        import { Component, inject } from '@angular/core';
        import { ApiService } from './api';
        @Component({}) export class Page { api = inject(ApiService); }
      `,
    });

    await runServicesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });

    const api = await readFile(join(root, 'api.ts'), 'utf8');
    const page = await readFile(join(root, 'page.ts'), 'utf8');
    expect(api).toContain('function setUser(user: string): void');
    expect(api).toContain('_user.set(user)');
    expect(api).toContain('function load<T>(value: T): T');
    expect(api).not.toMatch(/\binject\b.*from '@angular\/core'/);
    expect(page).toContain('injectApi()');
    expect(page).not.toContain('ApiService');
  });

  it('imports unsafe service helpers from the generated companion', async () => {
    const root = await fixture({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { experimentalDecorators: true },
      }),
      'legacy.ts': `
        import { Injectable } from '@angular/core';
        class Base {}
        @Injectable() export class LegacyService extends Base {}
      `,
      'page.ts': `
        import { Component, inject } from '@angular/core';
        import { LegacyService } from './legacy';
        @Component({ providers: [LegacyService] })
        export class Page { legacy = inject(LegacyService); }
      `,
    });

    await runServicesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });

    const companion = await readFile(join(root, 'legacy.craft.ts'), 'utf8');
    const page = await readFile(join(root, 'page.ts'), 'utf8');
    expect(companion).toContain("providedIn: 'toProvide'");
    expect(companion).toContain('provideLegacy');
    expect(page).toContain("from './legacy.craft'");
    expect(page).toContain('provideLegacy()');
  });

  it('converts simple httpResource calls to query and CraftHttpClient', async () => {
    const root = await fixture({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { experimentalDecorators: true },
      }),
      'catalog.ts': `
        import { Injectable, ResourceRef } from '@angular/core';
        import { httpResource } from '@angular/common/http';
        @Injectable({ providedIn: 'root' })
        export class CatalogService {
          products(): ResourceRef<string[]> {
            return httpResource<string[]>(() => '/api/products', { defaultValue: [] });
          }
        }
      `,
    });

    await runServicesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });

    const output = await readFile(join(root, 'catalog.ts'), 'utf8');
    expect(output).toContain('return query({');
    expect(output).toContain('yield* CraftHttpClient.request');
    expect(output).toContain('success: response<string[]>()');
    expect(output).not.toContain('httpResource');
    expect(output).not.toContain('ResourceRef');
  });

  it('yields a query created as a craftService property', async () => {
    const root = await fixture({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { experimentalDecorators: true },
      }),
      'catalog.ts': `
        import { Injectable, ResourceRef } from '@angular/core';
        import { httpResource } from '@angular/common/http';
        @Injectable({ providedIn: 'root' })
        export class CatalogService {
          readonly products = httpResource<string[]>(() => '/api/products', {
            defaultValue: [],
          });
        }
      `,
    });

    await runServicesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });

    const output = await readFile(join(root, 'catalog.ts'), 'utf8');
    expect(output).toContain('function* ()');
    expect(output).toContain('const _products = yield* query({');
    expect(output).toContain('yield* CraftHttpClient.request');
    expect(output).not.toMatch(
      /import\s*\{[^}]*\btrack\b[^}]*\}\s*from '@craft-ts\/core'/,
    );
  });

  it('converts simple writable HttpClient service methods to CraftHttpClient generator operations', async () => {
    const root = await fixture({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { experimentalDecorators: true },
      }),
      'orders.ts': `
        import { HttpClient } from '@angular/common/http';
        import { Injectable, inject } from '@angular/core';
        import { Observable } from 'rxjs';
        type Order = { id: string };
        type Payload = { notes: string };
        @Injectable({ providedIn: 'root' })
        export class OrderApiService {
          private readonly http = inject(HttpClient);
          createOrder(data: Payload): Observable<Order> {
            return this.http.post<Order>('/api/orders', data);
          }
        }
      `,
    });

    await runServicesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });

    const output = await readFile(join(root, 'orders.ts'), 'utf8');
    expect(output).toContain('function* createOrder(data: Payload)');
    expect(output).toContain('yield* CraftHttpClient.post');
    expect(output).toContain("url: '/api/orders'");
    expect(output).toContain('payload: data');
    expect(output).not.toContain('import { HttpClient');
    expect(output).not.toContain("from '@angular/common/http'");
    expect(output).not.toContain('inject(HttpClient)');
  });

  it('moves simple writable subscribe calls to a component-local mutation', async () => {
    const root = await fixture({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { experimentalDecorators: true },
      }),
      'orders.ts': `
        import { HttpClient } from '@angular/common/http';
        import { Injectable, inject } from '@angular/core';
        import { Observable } from 'rxjs';
        type Order = { id: string };
        type Payload = { notes: string };
        @Injectable({ providedIn: 'root' })
        export class OrderApiService {
          private readonly http = inject(HttpClient);
          createOrder(data: Payload): Observable<Order> {
            return this.http.post<Order>('/api/orders', data);
          }
        }
      `,
      'page.ts': `
        import { Component, inject } from '@angular/core';
        import { OrderApiService } from './orders';
        @Component({})
        export class Page {
          private readonly orderApi = inject(OrderApiService);
          save(data: { notes: string }): void {
            this.orderApi.createOrder(data).subscribe();
          }
        }
      `,
    });

    await runServicesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });

    const page = await readFile(join(root, 'page.ts'), 'utf8');
    expect(page).toContain('createOrderMutation = mutation({');
    expect(page).toContain('const orderApi = yield* OrderApi();');
    expect(page).toContain('return yield* orderApi.createOrder(params);');
    expect(page).toContain('this.createOrderMutation.mutate(data)');
    expect(page).toContain("from '@craft-ts/core'");
    expect(page).toContain("from './orders'");
  });

  it('keeps complex subscribe callbacks as manual mutation diagnostics', async () => {
    const root = await fixture({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { experimentalDecorators: true },
      }),
      'orders.ts': `
        import { HttpClient } from '@angular/common/http';
        import { Injectable, inject } from '@angular/core';
        import { Observable } from 'rxjs';
        type Order = { id: string };
        @Injectable({ providedIn: 'root' })
        export class OrderApiService {
          private readonly http = inject(HttpClient);
          cancelOrder(id: string): Observable<Order> {
            return this.http.patch<Order>('/api/orders/' + id + '/cancel', {});
          }
        }
      `,
      'page.ts': `
        import { Component, inject } from '@angular/core';
        import { OrderApiService } from './orders';
        @Component({})
        export class Page {
          private readonly orderApi = inject(OrderApiService);
          cancel(id: string): void {
            this.orderApi.cancelOrder(id).subscribe({ next: () => console.log('done') });
          }
        }
      `,
    });

    const result = await runServicesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'MUTATION_SUBSCRIBE_REQUIRES_REWRITE',
    );
    const page = await readFile(join(root, 'page.ts'), 'utf8');
    expect(page).toContain('subscribe({ next:');
    expect(page).toContain(
      '// CRAFT_EXPLICIT_SUBSCRIBE_REVIEW: subscribe explicite conservé; vérifier si query, mutation, asyncProcess ou le couple source$/on$ permet un workflow Craft déclaratif.',
    );
    expect(page).not.toContain('cancelOrderMutation = mutation');
  });

  it('annotates every explicit subscribe that remains after migration', async () => {
    const root = await fixture({
      'tsconfig.json': '{}',
      'page.ts': `
        export class Page {
          logout(): void {
            this.auth.logout().pipe(this.untilDestroyed()).subscribe({
              next: () => { window.location.href = '/'; },
            });
          }
          private readonly auth = { logout: () => ({ pipe: (..._args: unknown[]) => ({ subscribe: (_observer: unknown) => undefined }) }) };
          private readonly untilDestroyed = () => undefined;
        }
      `,
    });

    const first = await runServicesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });
    await runServicesMigration({
      rootDir: root,
      write: true,
      eslint: false,
      log: () => undefined,
    });

    const page = await readFile(join(root, 'page.ts'), 'utf8');
    expect(first.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'EXPLICIT_SUBSCRIBE_REQUIRES_REVIEW',
    );
    expect(page.match(/CRAFT_EXPLICIT_SUBSCRIBE_REVIEW/g)).toHaveLength(1);
    expect(page).toContain(
      'query, mutation, asyncProcess ou le couple source$/on$',
    );
  });
});
