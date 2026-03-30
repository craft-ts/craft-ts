# injectService

Creates a typed facade over an injected Angular service.

## Overview

`injectService` is useful when a service is technically correct but too broad for the API you want to expose to a component, a store, or another feature boundary.

It lets you:

- expose only the service entries you explicitly return
- rename methods and signals to match the calling use case
- derive extra `computed(...)` values from service state
- bind hidden reactions with [`on$`](/utils/on$) or `afterRecomputation(...)`
- compose the facade in several steps through `insertions`

Nothing is exposed by default.

## Import

```ts
import { injectService } from '@craft-ng/core';
```

## Key Behaviors

### Explicit exposure

Only the entries returned by your insertion callbacks are exposed.

### Bound methods

Service methods are returned already bound to the service instance, so destructuring `({ submitOrder }) => ({ submit: submitOrder })` is safe.

### Hidden bindings

If you return a branded source produced by helpers like [`on$`](/utils/on$), the binding is applied but omitted from the final result.

### Progressive composition

Later insertion callbacks can build on previous outputs through `insertions`, which is useful when you want to separate raw service bindings from higher-level UI state.

## Example: Router Facade

This example keeps `Router` imperative details hidden behind a smaller navigation API.

```ts
import { Component, computed } from '@angular/core';
import { Router } from '@angular/router';
import { injectService, on$, source$ } from '@craft-ng/core';

@Component({
  selector: 'app-terms-page',
  template: '',
  standalone: true,
})
export class TermsPageComponent {
  private readonly userAccept = source$<void>();

  readonly navigation = injectService(
    Router,
    ({ navigateByUrl, currentNavigation }) => ({
      decline: () => navigateByUrl('/terms/declined'),
      navigateOnAccept: on$(this.userAccept, () =>
        navigateByUrl('/checkout/shipping', { replaceUrl: true }),
      ),
      isNavigating: computed(() => currentNavigation() !== null),
    }),
  );

  decline() {
    this.navigation.decline();
  }

  accept() {
    this.userAccept.emit();
  }
}
```

In this example:

- `decline` is exposed as a public action
- `navigateOnAccept` is wired internally through `on$`
- `navigation.navigateOnAccept` is not available on the returned API
- `isNavigating` gives the component a small reactive view over router activity

## Example: Checkout Facade

This example turns a broad service into a checkout-oriented API that is easier to consume from a component or a store.

```ts
import { Component, computed, Injectable, signal } from '@angular/core';
import { injectService } from '@craft-ng/core';

type CartItem = {
  sku: string;
  quantity: number;
  price: number;
};

@Injectable({ providedIn: 'root' })
class CheckoutService {
  cart = signal<CartItem[]>([]);
  coupon = signal<string | null>(null);
  status = signal<'editing' | 'submitting' | 'submitted'>('editing');

  total = computed(() =>
    this.cart().reduce((sum, item) => sum + item.quantity * item.price, 0),
  );

  submitOrder() {
    this.status.set('submitting');
  }

  resetOrder() {
    this.cart.set([]);
    this.coupon.set(null);
    this.status.set('editing');
  }
}

@Component({
  selector: 'app-checkout-summary',
  template: '',
  standalone: true,
})
export class CheckoutSummaryComponent {
  readonly checkout = injectService(
    CheckoutService,
    ({ cart, coupon, status, total, submitOrder, resetOrder }) => ({
      total,
      status,
      itemCount: computed(() =>
        cart().reduce((count, item) => count + item.quantity, 0),
      ),
      hasCoupon: computed(() => coupon() !== null),
      clear: resetOrder,
      submit: submitOrder,
    }),
    ({ insertions: { itemCount, status, total } }) => ({
      canSubmit: computed(() => itemCount() > 0 && status() === 'editing'),
      summaryLabel: computed(() => `${itemCount()} items - ${total()} EUR`),
    }),
  );
}
```

This keeps the public API focused on checkout usage:

- `submit` and `clear` are renamed from service methods
- `itemCount`, `hasCoupon`, `canSubmit`, and `summaryLabel` are derived values
- `insertions` makes it possible to separate low-level bindings from UI-oriented computed state

## When To Use It

`injectService` is a good fit when:

- a service exposes too many details for the caller
- you want to create a view-model-like API from a service
- you need internal event wiring without exposing extra methods
- you want to layer a facade progressively with several insertion callbacks

## Related

- [on$](/utils/on$)
- [afterRecomputation](/utils/after-recomputation)
- [source$](/utils/source$)
