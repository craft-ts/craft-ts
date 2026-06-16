import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import {
  componentMonitoring,
  CraftRouterLink,
  provideHostName,
  type ExtractDeps,
  type GetDeps,
  type GetPublicComponentProperties,
} from '@craft-ng/core';
import { findPhoto, PHOTOS } from './photos';
import { injectViewTransitionsPhotoIdParams } from './view-transitions.routes';

/**
 * Detail page of the view-transitions demo, reached via
 * `view-transitions/:photoId`. The hero carries the SAME `view-transition-name`
 * (`photo-<id>`) as the tile that linked here, so the browser morphs that tile
 * into this hero on the way in — and back into the grid tile on the way out.
 * The `:photoId` route param is read through the generated, fully-typed
 * `injectViewTransitionsPhotoIdParams()` helper.
 */
@Component({
  selector: 'app-view-transitions-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CraftRouterLink],
  template: `
    <a class="back" [craftRouterLink]="{ to: 'view-transitions' }">
      ← Back to gallery
    </a>

    @if (photo(); as photo) {
      <article class="detail">
        <span
          class="hero"
          [style.background]="photo.gradient"
          [style.view-transition-name]="'photo-' + photo.id"
        >
          <span class="emoji">{{ photo.emoji }}</span>
        </span>
        <div class="body">
          <p class="eyebrow">{{ photo.subtitle }}</p>
          <h2>{{ photo.title }}</h2>
          <p class="description">{{ photo.description }}</p>
        </div>
      </article>
    } @else {
      <p class="missing">No artwork matches “{{ photoId() }}”.</p>
    }
  `,
  styles: `
    .back {
      display: inline-block;
      margin-bottom: 1.5rem;
      color: #2563eb;
      text-decoration: none;
      font-weight: 600;
    }
    .back:hover {
      text-decoration: underline;
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
      box-shadow: 0 24px 60px rgba(15, 23, 42, 0.25);
    }
    .emoji {
      font-size: 6rem;
      filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.3));
    }
    .eyebrow {
      margin: 0 0 0.5rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 0.8rem;
      font-weight: 700;
      color: #64748b;
    }
    h2 {
      margin: 0 0 1rem;
      font-size: 2.25rem;
      color: #0f172a;
    }
    .description {
      margin: 0;
      max-width: 52ch;
      color: #334155;
      line-height: 1.7;
    }
    .missing {
      color: #b91c1c;
    }
  `,
  providers: [provideHostName('component:ViewTransitionsDetailComponent')],
})
export default class ViewTransitionsDetailComponent {
  private readonly _monitoring = componentMonitoring();
  protected readonly photoId = injectViewTransitionsPhotoIdParams();
  protected readonly photo = computed(() => findPhoto(this.photoId()));
  protected readonly photos = PHOTOS;
}

// Brand auto-maintenance is intentionally disabled on this alias — see the note
// on the gallery's GenDeps: listing `CraftRouterLink` in `deps` would fold the
// route registry back into a route's own `componentDeps` and re-create the
// self-reference (TS2456 / TS7022). The directive is still wired at runtime via
// the component's `imports`.
// eslint-disable-next-line craft-ng/brand-angular-deps-match
export type GenDeps_ViewTransitionsDetailComponent = GetDeps<{
  deps: {};
  propertiesDeps: {
    _monitoring: ExtractDeps<ViewTransitionsDetailComponent['_monitoring']>;
    photoId: {
      ViewTransitionsPhotoIdParams: ReturnType<
        typeof injectViewTransitionsPhotoIdParams
      >;
    };
  };
  provided: {
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: GetPublicComponentProperties<ViewTransitionsDetailComponent>;
}>;
