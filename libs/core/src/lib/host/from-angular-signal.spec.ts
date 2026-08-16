import '@angular/compiler';
import { fromAngularSignal } from '@craft-ng/angular';
import {
  createEnvironmentInjector,
  EnvironmentInjector,
  provideZonelessChangeDetection,
  signal as angularSignal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { ɵcraftInjectorFromHost } from './craft-compat';
import { craftComputed, craftWatch } from './craft-signal';

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(
      BrowserTestingModule,
      platformBrowserTesting(),
    );
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

function bootAngularHostInjector(): EnvironmentInjector {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  });
  return createEnvironmentInjector(
    [],
    TestBed.inject(EnvironmentInjector),
  );
}

describe('fromAngularSignal', () => {
  it('invalidates a Craft computed when the Angular signal changes', () => {
    const host = bootAngularHostInjector();
    const count = angularSignal(0);
    const doubled = ɵcraftInjectorFromHost(host).run(() => {
      const source = fromAngularSignal(count);
      return craftComputed(() => source() * 2);
    });

    expect(doubled()).toBe(0);
    count.set(1);
    TestBed.flushEffects();
    expect(doubled()).toBe(2);
    host.destroy();
  });

  it('invalidates a Craft watch when the Angular signal changes', () => {
    const host = bootAngularHostInjector();
    const count = angularSignal(0);
    const seen: number[] = [];

    ɵcraftInjectorFromHost(host).run(() => {
      const source = fromAngularSignal(count);
      craftWatch(() => {
        seen.push(source());
      });
    });

    expect(seen).toEqual([0]);
    count.set(4);
    TestBed.flushEffects();
    expect(seen).toEqual([0, 4]);
    host.destroy();
  });
});
