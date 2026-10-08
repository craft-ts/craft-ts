import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  bootScript,
  isSeasonChoice,
  resolveSeason,
  SEASON_STORAGE_KEY,
  seasonOf,
  type Season,
} from './season.ts';

const monthToSeason: readonly Season[] = [
  'winter', // January
  'winter',
  'spring',
  'spring',
  'spring',
  'summer',
  'summer',
  'summer',
  'autumn',
  'autumn',
  'autumn',
  'winter', // December
];

describe('seasonOf', () => {
  it.each(monthToSeason.map((season, month) => [month, season] as const))(
    'puts month %i in %s',
    (month, season) => {
      expect(seasonOf(new Date(2026, month, 15))).toBe(season);
    },
  );

  it('changes on the first of the month, not in the middle', () => {
    expect(seasonOf(new Date(2026, 1, 28, 23, 59))).toBe('winter');
    expect(seasonOf(new Date(2026, 2, 1))).toBe('spring');
    expect(seasonOf(new Date(2026, 10, 30, 23, 59))).toBe('autumn');
    expect(seasonOf(new Date(2026, 11, 1))).toBe('winter');
  });
});

describe('resolveSeason and isSeasonChoice', () => {
  it('answers "auto" with the season of the date and a season with itself', () => {
    expect(resolveSeason('auto', new Date(2026, 6, 1))).toBe('summer');
    expect(resolveSeason('winter', new Date(2026, 6, 1))).toBe('winter');
  });

  it('accepts the four seasons and auto, nothing else', () => {
    for (const value of ['auto', 'spring', 'summer', 'autumn', 'winter']) {
      expect(isSeasonChoice(value)).toBe(true);
    }
    for (const value of ['fall', '', 'Spring', null, undefined, 3]) {
      expect(isSeasonChoice(value)).toBe(false);
    }
  });
});

/** Runs the boot script against a fake document, the way a browser would at `<head>`. */
const boot = (options: {
  readonly month: number;
  readonly storage?: Record<string, string>;
  readonly path?: string;
  readonly darkPaths?: readonly string[];
  readonly storageThrows?: boolean;
  readonly mode?: string;
}) => {
  const attributes: Record<string, string> = {};
  if (options.mode) attributes['data-mode'] = options.mode;
  const store = options.storage ?? {};
  const context = {
    document: {
      documentElement: {
        setAttribute: (name: string, value: string) => {
          attributes[name] = value;
        },
      },
    },
    localStorage: {
      getItem: (key: string) => {
        if (options.storageThrows) throw new Error('blocked');
        return key in store ? store[key] : null;
      },
    },
    location: { pathname: options.path ?? '/guide/' },
    Date: class extends Date {
      constructor() {
        super(2026, options.month, 15);
      }
    },
  };
  runInNewContext(bootScript({ darkPaths: options.darkPaths }), context);
  return attributes;
};

describe('bootScript', () => {
  it.each(monthToSeason.map((season, month) => [month, season] as const))(
    'agrees with seasonOf for month %i (%s) when nothing is stored',
    (month, season) => {
      expect(boot({ month })['data-season']).toBe(season);
    },
  );

  it('restores the stored season over the date', () => {
    const attributes = boot({ month: 0, storage: { [SEASON_STORAGE_KEY]: 'summer' } });
    expect(attributes['data-season']).toBe('summer');
  });

  it('ignores a stored value that is not a season, and the "auto" sentinel', () => {
    expect(boot({ month: 6, storage: { [SEASON_STORAGE_KEY]: 'fall' } })['data-season']).toBe(
      'summer',
    );
    expect(boot({ month: 6, storage: { [SEASON_STORAGE_KEY]: 'auto' } })['data-season']).toBe(
      'summer',
    );
  });

  it('restores a stored mode, and only a valid one', () => {
    expect(boot({ month: 0, storage: { 'docs-mode': 'dark' } })['data-mode']).toBe('dark');
    expect(boot({ month: 0, storage: { 'docs-mode': 'light' } })['data-mode']).toBe('light');
    expect(boot({ month: 0, storage: { 'docs-mode': 'sepia' } })['data-mode']).toBeUndefined();
  });

  it('still sets the season of the date when storage is refused', () => {
    const attributes = boot({ month: 9, storageThrows: true });
    expect(attributes['data-season']).toBe('autumn');
    expect(attributes['data-mode']).toBeUndefined();
  });

  it('forces the dark on the paths it is told, whatever the reader stored', () => {
    const darkPaths = ['/craft/learn-effect/'];
    const lesson = boot({
      month: 3,
      storage: { 'docs-mode': 'light' },
      path: '/craft/learn-effect/intro.html',
      darkPaths,
    });
    expect(lesson['data-mode']).toBe('dark');
    // The season is still the reader's: only the appearance is imposed.
    expect(lesson['data-season']).toBe('spring');

    const elsewhere = boot({
      month: 3,
      storage: { 'docs-mode': 'light' },
      path: '/craft/guide/',
      darkPaths,
    });
    expect(elsewhere['data-mode']).toBe('light');
  });
});
