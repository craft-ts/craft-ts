import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import {
  componentMonitoring,
  provideHostName,
  type ExtractDeps,
  type GetDeps,
  type GetPublicComponentProperties,
} from '@craft-ng/core';
import { findPhoto } from './photos';
import {
  injectViewTransitionsPhotoIdParams,
  injectViewTransitionsPhotoIdViewTransition,
} from './view-transitions.routes';

/**
 * Pending skeleton for `view-transitions/:photoId`, shown by the non-blocking
 * outlet while the slow (~3s) guard settles. It wears the SAME
 * `view-transition-name` (`photo-<id>`) as the tile that linked here, so the
 * shared-element morph bridges `tile → skeleton → detail hero` even though the
 * real detail page only mounts once the chain succeeds.
 *
 * The hero visual comes from the navigation's `viewTransition` payload — read
 * through the route-generated, fully-typed
 * `injectViewTransitionsPhotoIdViewTransition()` helper (the route declared its
 * shape via `viewTransitionPayload<{ name; image }>()`) — when present, else
 * falls back to the static artwork keyed by `:photoId`. The body is greyed bars.
 */
@Component({
  selector: 'app-view-transitions-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="back-placeholder">← Back to gallery</span>

    <article class="detail">
      <span
        class="hero"
        [style.background]="heroBackground()"
        [style.view-transition-name]="'photo-' + photoId()"
      >
        @if (heroImage(); as image) {
          <img class="hero-image" [src]="image" alt="" />
        } @else if (emoji(); as emoji) {
          <span class="emoji">{{ emoji }}</span>
        }
      </span>
      <div class="body">
        <span class="bar eyebrow"></span>
        <span class="bar title"></span>
        <span class="bar line"></span>
        <span class="bar line short"></span>
      </div>
    </article>
  `,
  styles: `
    .back-placeholder {
      display: inline-block;
      margin-bottom: 1.5rem;
      color: #94a3b8;
      font-weight: 600;
    }
    .detail {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 1.75rem;
    }
    @media (min-width: 720px) {
      .detail {
        grid-template-columns: minmax(0, 380px) 1fr;
        align-items: center;
      }
    }
    .hero {
      display: grid;
      place-items: center;
      aspect-ratio: 4 / 3;
      border-radius: 24px;
      overflow: hidden;
      background: #e2e8f0;
      box-shadow: 0 24px 60px rgba(15, 23, 42, 0.25);
    }
    .hero-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .emoji {
      font-size: 6rem;
      filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.3));
    }
    .body {
      display: grid;
      gap: 0.85rem;
      align-content: center;
    }
    .bar {
      display: block;
      border-radius: 0.5rem;
      background: linear-gradient(90deg, #e2e8f0, #f1f5f9, #e2e8f0);
      background-size: 200% 100%;
      animation: shimmer 1.4s ease-in-out infinite;
    }
    .bar.eyebrow {
      width: 30%;
      height: 0.8rem;
    }
    .bar.title {
      width: 60%;
      height: 2rem;
    }
    .bar.line {
      width: 100%;
      height: 1rem;
    }
    .bar.line.short {
      width: 75%;
    }
    @keyframes shimmer {
      0% {
        background-position: 200% 0;
      }
      100% {
        background-position: -200% 0;
      }
    }
  `,
  providers: [provideHostName('component:ViewTransitionsSkeletonComponent')],
})
export default class ViewTransitionsSkeletonComponent {
  private readonly _monitoring = componentMonitoring();
  protected readonly photoId = injectViewTransitionsPhotoIdParams();
  // Signal<{ name; image } | null> — typed by the route via viewTransitionPayload<T>().
  private readonly viewTransition = injectViewTransitionsPhotoIdViewTransition();
  private readonly photo = computed(() => findPhoto(this.photoId()));

  protected readonly heroImage = computed(
    () => this.viewTransition()?.image ?? null,
  );
  protected readonly heroBackground = computed(
    () => this.photo()?.gradient ?? '#e2e8f0',
  );
  protected readonly emoji = computed(() => this.photo()?.emoji ?? null);
}

// Brand auto-maintenance is intentionally disabled on this alias — see the note
// on the detail's GenDeps: listing route-registry directives in `deps` would
// fold the route registry back into a route's own `componentDeps` and re-create
// the self-reference (TS2456 / TS7022).
// eslint-disable-next-line craft-ng/brand-angular-deps-match
export type GenDeps_ViewTransitionsSkeletonComponent = GetDeps<{
  deps: {};
  propertiesDeps: {
    _monitoring: ExtractDeps<ViewTransitionsSkeletonComponent['_monitoring']>;
    photoId: {
      ViewTransitionsPhotoIdParams: ReturnType<
        typeof injectViewTransitionsPhotoIdParams
      >;
    };
    // Route-auto-provided (the route declares the payload via viewTransitionPayload<T>()).
    viewTransition: {
      ViewTransitionsPhotoIdViewTransition: ReturnType<
        typeof injectViewTransitionsPhotoIdViewTransition
      >;
    };
  };
  provided: {
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: GetPublicComponentProperties<ViewTransitionsSkeletonComponent>;
}>;
