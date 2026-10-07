/**
 * The season, and the appearance: what the page remembers about how it is read, and
 * the few lines that restore it before the first paint.
 *
 * Plain functions, no sheet: the palettes and the drawings live in `*.style.ts`, this
 * is the part that decides *which* season a date is, what the reader chose, and how
 * the document is told.
 */
import type { Season } from '../decor/seasons.art.style.ts';

export type { Season };

export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];

/** What the reader can ask for: one season, or the one the date says. */
export type SeasonChoice = Season | 'auto';

export const SEASON_CHOICES: readonly SeasonChoice[] = ['auto', ...SEASONS];

export const SEASON_STORAGE_KEY = 'docs-season';
export const MODE_STORAGE_KEY = 'docs-mode';

/**
 * The season of a date, by the meteorological calendar of the northern hemisphere:
 * spring is March to May, summer June to August, autumn September to November,
 * winter December to February. Whole months, so the page does not change in the
 * middle of a week and a test can name every case.
 */
export const seasonOf = (date: Date): Season => {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
};

/** The season a choice stands for today. */
export const resolveSeason = (choice: SeasonChoice, now: Date = new Date()): Season =>
  choice === 'auto' ? seasonOf(now) : choice;

export const isSeasonChoice = (value: unknown): value is SeasonChoice =>
  typeof value === 'string' && (SEASON_CHOICES as readonly string[]).includes(value);

/** The words the season picker prints, so a translation changes one object. */
export interface SeasonNames {
  readonly auto: string;
  readonly spring: string;
  readonly summer: string;
  readonly autumn: string;
  readonly winter: string;
}

export const defaultSeasonNames: SeasonNames = {
  auto: 'Automatic',
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter',
};

export interface BootOptions {
  /**
   * Paths that are always read in the dark, whatever the reader chose, with the base in
   * front: `['/craft/learn-effect/']`. Nothing is stored for them, so leaving the path
   * gives the reader their own choice back.
   */
  readonly darkPaths?: readonly string[];
}

/**
 * The script a document runs in its `<head>`, before anything is painted: it writes
 * `data-mode` and `data-season` on the root from what the reader stored, and from the
 * date when they stored nothing. Without it the first paint is the classic palette and
 * the page changes colour a moment later.
 *
 * Self-contained text — it runs before any bundle — and kept in step with `seasonOf`
 * by `season.spec.ts`, which runs it against every month.
 */
export const bootScript = (options: BootOptions = {}): string =>
  `(function(){var d=document.documentElement;` +
  `var g=function(k){try{return localStorage.getItem(k)}catch(e){return null}};` +
  `var m=g(${JSON.stringify(MODE_STORAGE_KEY)});` +
  `if(m==='light'||m==='dark')d.setAttribute('data-mode',m);` +
  `var s=g(${JSON.stringify(SEASON_STORAGE_KEY)});` +
  `if(${JSON.stringify(SEASONS)}.indexOf(s)<0){var n=new Date().getMonth();` +
  `s=n>=2&&n<=4?'spring':n>=5&&n<=7?'summer':n>=8&&n<=10?'autumn':'winter'}` +
  `d.setAttribute('data-season',s);` +
  `var p=location.pathname,l=${JSON.stringify(options.darkPaths ?? [])};` +
  `for(var i=0;i<l.length;i++)if(p.indexOf(l[i])===0)d.setAttribute('data-mode','dark')` +
  `})()`;
