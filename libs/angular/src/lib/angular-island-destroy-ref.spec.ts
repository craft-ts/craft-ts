import '@angular/compiler';
import '@craft-ng/angular';
import {
  createEnvironmentInjector,
  EnvironmentInjector,
  provideZonelessChangeDetection,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  source$,
  ɵcraftInjectorFromHost,
  ɵDestroyRef as DestroyRef,
  ɵeffect as effect,
  ɵinject as inject,
  ɵsignal as signal,
} from '@craft-ng/core';

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

describe('DestroyRef on the Angular island', () => {
  it('resolves inject(DestroyRef) on an Angular host injector', () => {
    const host = bootAngularHostInjector();
    const destroyRef = ɵcraftInjectorFromHost(host).run(() =>
      inject(DestroyRef),
    );

    expect(destroyRef).toBeTruthy();
    expect(typeof destroyRef.onDestroy).toBe('function');
    host.destroy();
  });

  it('tears down effect after the Angular host is destroyed', () => {
    const host = bootAngularHostInjector();
    const count = signal(0);
    const seen: number[] = [];

    ɵcraftInjectorFromHost(host).run(() => {
      effect(() => {
        seen.push(count());
      });
    });

    expect(seen).toEqual([0]);
    count.set(1);
    expect(seen).toEqual([0, 1]);

    host.destroy();
    count.set(2);
    expect(seen).toEqual([0, 1]);
  });

  it('does not throw NG0205 when running after the Angular host is destroyed', () => {
    const host = bootAngularHostInjector();
    const craft = ɵcraftInjectorFromHost(host);

    host.destroy();

    expect(host.destroyed).toBe(true);
    expect(() => craft.run(() => 'ok')).not.toThrow();
    expect(craft.run(() => 'ok')).toBe('ok');
  });

  it('constructs source$ on an Angular host injector', () => {
    const host = bootAngularHostInjector();
    const source = ɵcraftInjectorFromHost(host).run(() =>
      source$<number>('count'),
    );

    expect(typeof source.emit).toBe('function');
    source.emit(1);
    expect(source.value()).toBe(1);
    host.destroy();
  });
});
