# insertLocalStorage

The `insertLocalStorage` insertion automatically synchronizes state with browser localStorage, persisting data across sessions.

## Import

```typescript
import { state, insertLocalStorage } from '@ngcraft/core';
```

## Basic Usage

```typescript
import { Component } from '@angular/core';
import { state, insertLocalStorage } from '@ngcraft/core';

@Component({
  selector: 'app-theme-selector',
  template: `
    <div>
      <p>Current theme: {{ theme() }}</p>
      <button (click)="theme.set('light')">Light</button>
      <button (click)="theme.set('dark')">Dark</button>
    </div>
  `,
})
export class ThemeSelectorComponent {
  // State persisted to localStorage
  theme = state('light', {
    insertions: [insertLocalStorage('app-theme')],
  });
}
```

## API

### Basic Insertion

```typescript
// Simple storage key
const preferences = state(
  { fontSize: 14 },
  {
    insertions: [insertLocalStorage('user-preferences')],
  },
);

// With custom serialization
const complexState = state(
  { data: [] },
  {
    insertions: [
      insertLocalStorage('complex-state', {
        serialize: (value) => JSON.stringify(value),
        deserialize: (value) => JSON.parse(value),
      }),
    ],
  },
);
```

## Advanced Usage

### User Preferences

```typescript
interface UserPreferences {
  theme: 'light' | 'dark';
  fontSize: number;
  sidebarCollapsed: boolean;
  language: string;
}

@Component({
  selector: 'app-root',
  template: `
    <div [attr.data-theme]="preferences().theme">
      <button (click)="toggleTheme()">Theme: {{ preferences().theme }}</button>
      <button (click)="toggleSidebar()">
        Sidebar: {{ preferences().sidebarCollapsed ? 'Collapsed' : 'Expanded' }}
      </button>
    </div>
  `,
})
export class AppComponent {
  preferences = state<UserPreferences>(
    {
      theme: 'light',
      fontSize: 14,
      sidebarCollapsed: false,
      language: 'en',
    },
    {
      insertions: [insertLocalStorage('app-preferences')],
    },
  );

  toggleTheme() {
    this.preferences.update((p) => ({
      ...p,
      theme: p.theme === 'light' ? 'dark' : 'light',
    }));
  }

  toggleSidebar() {
    this.preferences.update((p) => ({
      ...p,
      sidebarCollapsed: !p.sidebarCollapsed,
    }));
  }
}
```

### Form Draft Persistence

```typescript
@Component({
  selector: 'app-post-editor',
  template: `
    <form>
      <input
        [value]="draft().title"
        (input)="updateTitle($any($event.target).value)"
        placeholder="Title"
      />
      <textarea
        [value]="draft().content"
        (input)="updateContent($any($event.target).value)"
        placeholder="Content"
      ></textarea>
      <button (click)="clearDraft()">Clear Draft</button>
    </form>
  `,
})
export class PostEditorComponent {
  draft = state(
    { title: '', content: '' },
    {
      insertions: [insertLocalStorage('post-draft')],
    },
  );

  updateTitle(title: string) {
    this.draft.update((d) => ({ ...d, title }));
  }

  updateContent(content: string) {
    this.draft.update((d) => ({ ...d, content }));
  }

  clearDraft() {
    this.draft.set({ title: '', content: '' });
  }
}
```

### Shopping Cart

```typescript
interface CartItem {
  id: number;
  name: string;
  quantity: number;
  price: number;
}

@Component({
  selector: 'app-shopping-cart',
  template: `
    <div>
      <h2>Shopping Cart ({{ cart().length }} items)</h2>
      @for (item of cart(); track item.id) {
        <div class="cart-item">
          <span>{{ item.name }}</span>
          <span>{{ item.quantity }} x ${{ item.price }}</span>
          <button (click)="removeItem(item.id)">Remove</button>
        </div>
      }
      <button (click)="clearCart()">Clear Cart</button>
    </div>
  `,
})
export class ShoppingCartComponent {
  cart = state<CartItem[]>([], {
    insertions: [insertLocalStorage('shopping-cart')]
  });

  addItem(item: CartItem) {
    this.cart.update(cart => [...cart, item]);
  }

  removeItem(id: number) {
    this.cart.update(cart => cart.filter(item => item.id !== id));
  }

  clearCart() {
    this.cart.set([]);
  }
}
```

### Recent Searches

```typescript
@Component({
  selector: 'app-search',
  template: `
    <div>
      <input
        [value]="searchQuery()"
        (input)="searchQuery.set($any($event.target).value)"
        (keyup.enter)="addToRecent()"
        placeholder="Search..."
      />

      @if (recentSearches().length > 0) {
        <div class="recent">
          <h4>Recent Searches</h4>
          @for (search of recentSearches(); track search) {
            <button (click)="searchQuery.set(search)">
              {{ search }}
            </button>
          }
          <button (click)="clearRecent()">Clear</button>
        </div>
      }
    </div>
  `,
})
export class SearchComponent {
  searchQuery = state('');

  recentSearches = state<string[]>([], {
    insertions: [insertLocalStorage('recent-searches')],
  });

  addToRecent() {
    const query = this.searchQuery();
    if (query.trim()) {
      this.recentSearches.update((recent) => {
        const filtered = recent.filter((s) => s !== query);
        return [query, ...filtered].slice(0, 5); // Keep last 5
      });
    }
  }

  clearRecent() {
    this.recentSearches.set([]);
  }
}
```

## Options

### Custom Storage Key

```typescript
const settings = state(
  { volume: 50 },
  {
    insertions: [insertLocalStorage('app-settings-v2')],
  },
);
```

### Custom Serialization

```typescript
const dateState = state(new Date(), {
  insertions: [
    insertLocalStorage('last-visit', {
      serialize: (date) => date.toISOString(),
      deserialize: (str) => new Date(str),
    }),
  ],
});
```

### Versioned Storage

```typescript
interface Settings {
  version: number;
  data: any;
}

const settings = state<Settings>(
  { version: 1, data: {} },
  {
    insertions: [
      insertLocalStorage('app-settings', {
        deserialize: (str) => {
          const parsed = JSON.parse(str);
          // Handle version migrations
          if (parsed.version < 1) {
            return { version: 1, data: migrate(parsed) };
          }
          return parsed;
        },
      }),
    ],
  },
);
```

## Storage Events

LocalStorage changes from other tabs/windows automatically sync:

```typescript
// In Tab 1
const theme = state('light', {
  insertions: [insertLocalStorage('theme')],
});
theme.set('dark'); // Updates localStorage

// In Tab 2 - automatically receives the update!
const theme = state('light', {
  insertions: [insertLocalStorage('theme')],
});
// theme() === 'dark' (synced automatically)
```

## Best Practices

✅ **Use meaningful keys** - Prefix with app name to avoid collisions
✅ **Keep data size reasonable** - localStorage has ~5-10MB limit
✅ **Handle deserialization errors** - Gracefully fallback to defaults
✅ **Version your data** - Support migrations as structure changes
✅ **Don't store sensitive data** - localStorage is not secure
✅ **Consider TTL** - Add timestamps for data expiration

## Common Patterns

### With TTL (Time To Live)

```typescript
interface CachedData<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

function createCachedState<T>(key: string, initialValue: T, ttlMs: number) {
  return state<T>(initialValue, {
    insertions: [
      insertLocalStorage(key, {
        serialize: (value) =>
          JSON.stringify({
            data: value,
            timestamp: Date.now(),
            ttl: ttlMs,
          }),
        deserialize: (str) => {
          const cached: CachedData<T> = JSON.parse(str);
          const age = Date.now() - cached.timestamp;
          return age < cached.ttl ? cached.data : initialValue;
        },
      }),
    ],
  });
}

// Usage
const cachedData = createCachedState('api-data', null, 60000); // 1 min TTL
```

## See Also

- [state](/primitives/state) - Base primitive for state
- [insertReactOnMutation](/insertions/insert-react-on-mutation) - React to mutations
- [Store](/store/craft) - Compose insertions in stores
