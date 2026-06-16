import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
  componentMonitoring,
  CraftRouterLink,
  provideHostName,
  type ExtractDeps,
  type GetDeps,
  type GetPublicComponentProperties,
} from '@craft-ng/core';
import { PHOTOS } from './photos';

/**
 * Grid page of the view-transitions demo. Each tile links to
 * `view-transitions/:photoId` and carries a UNIQUE `view-transition-name`
 * (`photo-<id>`). When a tile is clicked, Angular's `withViewTransitions()`
 * wraps the navigation in `document.startViewTransition()`, the browser matches
 * the tile's name with the same name on the detail hero, and morphs the one
 * clicked element while the rest cross-fade.
 */
@Component({
  selector: 'app-view-transitions-gallery',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CraftRouterLink],
  template: `
    <header class="intro">
      <h2>View Transitions</h2>
      <p>
        Click any tile. The browser View Transitions API — wired through
        <code>withViewTransitions()</code> in <code>provideCraftRouter</code> —
        morphs the clicked tile into the detail hero. Each tile owns a unique
        <code>view-transition-name</code>, so only the one you click animates.
      </p>
    </header>

    <ul class="grid">
      @for (photo of photos; track photo.id) {
        <li>
          <a
            class="tile"
            [craftRouterLink]="{
              to: 'view-transitions/:photoId',
              params: { photoId: photo.id },
              viewTransition: { name: 'photo-' + photo.id, image: null },
            }"
          >
            <span
              class="art"
              [style.background]="photo.gradient"
              [style.view-transition-name]="'photo-' + photo.id"
            >
              <span class="emoji">{{ photo.emoji }}</span>
            </span>
            <span class="meta">
              <span class="title">{{ photo.title }}</span>
              <span class="subtitle">{{ photo.subtitle }}</span>
            </span>
          </a>
        </li>
      }
    </ul>
  `,
  styles: `
    .intro {
      margin-bottom: 1.75rem;
    }
    .intro h2 {
      margin: 0 0 0.5rem;
      font-size: 1.6rem;
      color: #0f172a;
    }
    .intro p {
      margin: 0;
      max-width: 60ch;
      color: #475569;
      line-height: 1.6;
    }
    code {
      padding: 0.1rem 0.35rem;
      border-radius: 0.35rem;
      background: rgba(15, 23, 42, 0.06);
      font-family: 'SFMono-Regular', Consolas, Menlo, monospace;
      font-size: 0.9em;
    }
    .grid {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 1.25rem;
    }
    .tile {
      display: grid;
      gap: 0.75rem;
      text-decoration: none;
      color: inherit;
    }
    .art {
      display: grid;
      place-items: center;
      aspect-ratio: 4 / 3;
      border-radius: 16px;
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .tile:hover .art {
      transform: translateY(-4px);
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.26);
    }
    .emoji {
      font-size: 3rem;
      filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.25));
    }
    .meta {
      display: grid;
      gap: 0.15rem;
    }
    .title {
      font-weight: 700;
      color: #0f172a;
    }
    .subtitle {
      font-size: 0.85rem;
      color: #64748b;
    }
  `,
  providers: [provideHostName('component:ViewTransitionsGalleryComponent')],
})
export default class ViewTransitionsGalleryComponent {
  private readonly _monitoring = componentMonitoring();
  protected readonly photos = PHOTOS;
}

// Brand auto-maintenance is intentionally disabled on this alias. This component
// is reachable from the route registry (`META_PATHS` folds `loadChildren`
// children), so listing `CraftRouterLink` in `deps` — as the brand autofix wants
// — pulls `CraftRouterLinkInput` (→ the route registry) back into a route's own
// `componentDeps`, re-creating the self-reference the `craft-router.ts` registry
// comment warns about (TS2456 / TS7022). The directive is still wired at runtime
// via the component's `imports`.
// eslint-disable-next-line craft-ng/brand-angular-deps-match
export type GenDeps_ViewTransitionsGalleryComponent = GetDeps<{
  deps: {};
  propertiesDeps: {
    _monitoring: ExtractDeps<ViewTransitionsGalleryComponent['_monitoring']>;
  };
  provided: {
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: GetPublicComponentProperties<ViewTransitionsGalleryComponent>;
}>;
