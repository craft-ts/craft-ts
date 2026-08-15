import '@angular/compiler';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { provideRouter, Router, TitleStrategy } from '@angular/router';
import { beforeAll, describe, expect, it } from 'vitest';
import { isCraftLoadingFeature } from './craft-pending';
import {
  CRAFT_A11Y_NAVIGATION_FOCUS,
  createCraftTitleStrategy,
  withA11yNavigationFocus,
} from './craft-a11y';

@Component({
  standalone: true,
  template: '',
})
class TitleProbeComponent {}

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

describe('craft a11y navigation', () => {
  it('exposes withA11yNavigationFocus as a loading feature', () => {
    const feature = withA11yNavigationFocus();
    expect(isCraftLoadingFeature(feature)).toBe(true);
    expect(
      feature.providers.some(
        (provider) =>
          typeof provider === 'object' &&
          provider !== null &&
          'provide' in provider &&
          provider.provide === CRAFT_A11Y_NAVIGATION_FOCUS,
      ),
    ).toBe(true);
  });

  it('writes the Angular route title through BrowserDocument', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'hello',
            title: 'Hello page',
            component: TitleProbeComponent,
          },
        ]),
        { provide: TitleStrategy, useFactory: createCraftTitleStrategy },
      ],
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/hello');
    expect(document.title).toBe('Hello page');
  });
});
