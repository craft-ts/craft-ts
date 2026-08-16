import { Directive, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  createCraftRouterCommands,
  type CraftRouterLinkInput,
  type GenDeps_LegacyCraftRouterLink,
} from '@craft-ng/core';
import { CRAFT_VIEW_TRANSITION_STATE_KEY } from '@craft-ng/core';

export type { GenDeps_LegacyCraftRouterLink };

/**
 * @deprecated Use the functional `CraftRouterLink` on Craft nodes.
 * Moved from `@craft-ng/core` for Angular-island templates.
 */
@Directive({
  selector: '[craftRouterLink]',
  standalone: true,
  hostDirectives: [
    {
      directive: RouterLink,
      inputs: ['target'],
    },
  ],
})
export class LegacyCraftRouterLink {
  private readonly routerLink = inject(RouterLink, { self: true });

  readonly craftRouterLink = input<CraftRouterLinkInput | null | undefined>(
    undefined,
    { alias: 'craftRouterLink' },
  );

  constructor() {
    effect(() => {
      const value = this.craftRouterLink();

      if (!value) {
        this.routerLink.routerLink = null;
        this.routerLink.queryParams = undefined;
        this.routerLink.fragment = undefined;
        this.routerLink.queryParamsHandling = undefined;
        this.routerLink.preserveFragment = false;
        this.routerLink.skipLocationChange = false;
        this.routerLink.replaceUrl = false;
        this.routerLink.state = undefined;
        this.routerLink.info = undefined;
        this.routerLink.ngOnChanges();
        return;
      }

      this.routerLink.routerLink = [...createCraftRouterCommands(value)];
      this.routerLink.queryParams = value.queryParams;
      this.routerLink.fragment = value.fragment ?? undefined;
      this.routerLink.queryParamsHandling = value.queryParamsHandling as
        | ''
        | 'merge'
        | 'preserve'
        | undefined;
      this.routerLink.preserveFragment = value.preserveFragment ?? false;
      this.routerLink.skipLocationChange = value.skipLocationChange ?? false;
      this.routerLink.replaceUrl = value.replaceUrl ?? false;
      this.routerLink.state =
        value.viewTransition === undefined
          ? value.state
          : {
              ...(value.state ?? {}),
              [CRAFT_VIEW_TRANSITION_STATE_KEY]: value.viewTransition,
            };
      this.routerLink.info = undefined;
      this.routerLink.relativeTo = null;
      this.routerLink.ngOnChanges();
    });
  }
}
