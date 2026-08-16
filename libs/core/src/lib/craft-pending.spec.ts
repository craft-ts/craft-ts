import '@angular/compiler';
import { Component, inject, LOCALE_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CRAFT_BLANK_MS,
  CRAFT_ERROR_COMPONENT,
  CRAFT_LOADING_TEXT,
  CRAFT_PENDING_COMPONENT,
  CRAFT_PENDING_MIN_MS,
  CRAFT_STAY_MS,
  provideCraftLoading,
  withErrorComponent,
  withLoadingText,
  withPendingComponent,
  withTransitionTimings,
} from './craft-pending';
import { DefaultCraftPendingComponent } from '@craft-ng/angular';

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes(
        'Cannot set base providers because it has already been called',
      )
    ) {
      throw error;
    }
  }
});

@Component({ selector: 'spec-spinner', standalone: true, template: `spin` })
class SpecSpinner {}

@Component({ selector: 'spec-error', standalone: true, template: `err` })
class SpecError {}

describe('craft-pending', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('defaults', () => {
    it('defaults the pending component to DefaultCraftPendingComponent', () => {
      TestBed.configureTestingModule({});
      expect(
        TestBed.runInInjectionContext(() => inject(CRAFT_PENDING_COMPONENT)),
      ).toBe(DefaultCraftPendingComponent);
    });

    it('defaults the phase timings and global error component', () => {
      TestBed.configureTestingModule({});
      const [stayMs, blankMs, pendingMinMs, errorComponent] =
        TestBed.runInInjectionContext(() => [
          inject(CRAFT_STAY_MS),
          inject(CRAFT_BLANK_MS),
          inject(CRAFT_PENDING_MIN_MS),
          inject(CRAFT_ERROR_COMPONENT),
        ]);
      expect(stayMs).toBe(300);
      expect(blankMs).toBe(300);
      expect(pendingMinMs).toBe(0);
      expect(errorComponent).toBeNull();
    });
  });

  describe('CRAFT_LOADING_TEXT follows LOCALE_ID', () => {
    function loadingTextForLocale(locale: string): string {
      TestBed.configureTestingModule({
        providers: [{ provide: LOCALE_ID, useValue: locale }],
      });
      return TestBed.runInInjectionContext(() => inject(CRAFT_LOADING_TEXT)());
    }

    it('uses English by default', () => {
      expect(loadingTextForLocale('en-US')).toBe('Loading…');
    });

    it('uses French for fr locales', () => {
      expect(loadingTextForLocale('fr-FR')).toBe('Chargement…');
    });

    it('falls back to English for an unknown locale', () => {
      expect(loadingTextForLocale('de-DE')).toBe('Loading…');
    });
  });

  describe('provideCraftLoading features', () => {
    it('withPendingComponent overrides the pending component', () => {
      TestBed.configureTestingModule({
        providers: [provideCraftLoading(withPendingComponent(SpecSpinner))],
      });
      expect(
        TestBed.runInInjectionContext(() => inject(CRAFT_PENDING_COMPONENT)),
      ).toBe(SpecSpinner);
    });

    it('withErrorComponent registers the global error component', () => {
      TestBed.configureTestingModule({
        providers: [
          provideCraftLoading(
            withErrorComponent({ component: SpecError, componentDeps: {} }),
          ),
        ],
      });
      expect(
        TestBed.runInInjectionContext(() => inject(CRAFT_ERROR_COMPONENT)),
      ).toEqual({ component: SpecError, componentDeps: {} });
    });

    it('withLoadingText overrides the loading signal', () => {
      TestBed.configureTestingModule({
        providers: [
          provideCraftLoading(withLoadingText(() => signal('custom text'))),
        ],
      });
      expect(
        TestBed.runInInjectionContext(() => inject(CRAFT_LOADING_TEXT)()),
      ).toBe('custom text');
    });

    it('withTransitionTimings overrides only the provided thresholds', () => {
      TestBed.configureTestingModule({
        providers: [
          provideCraftLoading(withTransitionTimings({ stayMs: 200 })),
        ],
      });
      const [stayMs, blankMs, pendingMinMs] = TestBed.runInInjectionContext(
        () => [
          inject(CRAFT_STAY_MS),
          inject(CRAFT_BLANK_MS),
          inject(CRAFT_PENDING_MIN_MS),
        ],
      );
      expect(stayMs).toBe(200);
      // blankMs / pendingMinMs were not supplied — keep their defaults.
      expect(blankMs).toBe(300);
      expect(pendingMinMs).toBe(0);
    });

    it('combines multiple features', () => {
      TestBed.configureTestingModule({
        providers: [
          provideCraftLoading(
            withPendingComponent(SpecSpinner),
            withErrorComponent({ component: SpecError, componentDeps: {} }),
            withTransitionTimings({
              stayMs: 250,
              blankMs: 100,
              pendingMinMs: 400,
            }),
          ),
        ],
      });
      const result = TestBed.runInInjectionContext(() => ({
        pending: inject(CRAFT_PENDING_COMPONENT),
        error: inject(CRAFT_ERROR_COMPONENT),
        stayMs: inject(CRAFT_STAY_MS),
        blankMs: inject(CRAFT_BLANK_MS),
        pendingMinMs: inject(CRAFT_PENDING_MIN_MS),
      }));
      expect(result.pending).toBe(SpecSpinner);
      expect(result.error).toEqual({ component: SpecError, componentDeps: {} });
      expect(result.stayMs).toBe(250);
      expect(result.blankMs).toBe(100);
      expect(result.pendingMinMs).toBe(400);
    });
  });

  describe('DefaultCraftPendingComponent', () => {
    it('renders the loading text', () => {
      TestBed.configureTestingModule({
        providers: [{ provide: LOCALE_ID, useValue: 'fr-FR' }],
      });
      const fixture = TestBed.createComponent(DefaultCraftPendingComponent);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Chargement…');
    });
  });
});
