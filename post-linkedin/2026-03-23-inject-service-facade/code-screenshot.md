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
}
```