import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { localStoragePersisterV2 } from './local-storage-persister-v2';
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest';

describe('localStoragePersister', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};

    const mockLocalStorage = {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        Object.keys(store).forEach((k) => delete store[k]);
      }),
    };
    vi.stubGlobal('localStorage', mockLocalStorage);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('1 Should persist state to localStorage when stable', async () => {
    await TestBed.runInInjectionContext(async () => {
      const stateSignal = signal({ id: 1, name: 'Romain' });
      const isStableSignal = signal(true);
      const persister = localStoragePersisterV2('state');

      persister.setState((data) => stateSignal.set(data));
      persister.addToPersist({
        key: 'user',
        state: stateSignal,
        isStable: isStableSignal,
        waitForParamsSrcToBeEqualToPreviousValue: false,
        cacheTime: 50000,
      });

      TestBed.flushEffects();

      expect(localStorage.setItem).toHaveBeenCalled();
      const setItemCalls = vi.mocked(localStorage.setItem).mock.calls;
      const userCall = setItemCalls.find(
        (call) => call[0] === 'ng-craft-state-state-user',
      );
      expect(userCall).toBeDefined();
      const storedData = JSON.parse(userCall![1]);
      expect(storedData.state).toEqual({ id: 1, name: 'Romain' });
      expect(typeof storedData.timestamp).toBe('number');
    });
  });

  it('2 Should remove state from localStorage when not stable', async () => {
    await TestBed.runInInjectionContext(async () => {
      const stateSignal = signal({ id: 1, name: 'Romain' });
      const isStableSignal = signal(false);
      const persister = localStoragePersisterV2('state');

      persister.setState((data) => stateSignal.set(data));
      persister.addToPersist({
        key: 'user',
        state: stateSignal,
        isStable: isStableSignal,
        waitForParamsSrcToBeEqualToPreviousValue: false,
        cacheTime: 50000,
      });

      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'ng-craft-state-state-user',
      );
    });
  });

  it('3 Should hydrate state from localStorage when cache is valid', async () => {
    await TestBed.runInInjectionContext(async () => {
      localStorage.setItem(
        'ng-craft-state-state-user',
        JSON.stringify({
          state: { id: 2, name: 'Jane' },
          timestamp: Date.now(),
        }),
      );

      const stateSignal = signal({ id: 1, name: 'Romain' });
      const isStableSignal = signal(true);
      const persister = localStoragePersisterV2('state');

      persister.setState((data) => stateSignal.set(data));
      persister.addToPersist({
        key: 'user',
        state: stateSignal,
        isStable: isStableSignal,
        waitForParamsSrcToBeEqualToPreviousValue: false,
        cacheTime: 50000,
      });

      expect(localStorage.getItem).toHaveBeenCalledWith(
        'ng-craft-state-state-user',
      );
      expect(stateSignal()).toEqual({ id: 2, name: 'Jane' });
    });
  });

  it('4 Should not hydrate expired state and remove it from localStorage', async () => {
    await TestBed.runInInjectionContext(async () => {
      const expiredTimestamp = Date.now() - 6000;
      localStorage.setItem(
        'ng-craft-state-state-user',
        JSON.stringify({
          state: { id: 2, name: 'Jane' },
          timestamp: expiredTimestamp,
        }),
      );

      const stateSignal = signal({ id: 1, name: 'Romain' });
      const isStableSignal = signal(true);
      const persister = localStoragePersisterV2('state');

      persister.setState((data) => stateSignal.set(data));
      persister.addToPersist({
        key: 'user',
        state: stateSignal,
        isStable: isStableSignal,
        waitForParamsSrcToBeEqualToPreviousValue: false,
        cacheTime: 5000,
      });

      expect(stateSignal()).toEqual({ id: 1, name: 'Romain' });
      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'ng-craft-state-state-user',
      );
    });
  });

  it('5 Should remove invalid cached state when JSON parsing fails', async () => {
    await TestBed.runInInjectionContext(async () => {
      localStorage.setItem('ng-craft-state-state-user', 'invalid-json');

      const stateSignal = signal({ id: 1, name: 'Romain' });
      const isStableSignal = signal(true);
      const persister = localStoragePersisterV2('state');

      persister.setState((data) => stateSignal.set(data));
      persister.addToPersist({
        key: 'user',
        state: stateSignal,
        isStable: isStableSignal,
        waitForParamsSrcToBeEqualToPreviousValue: false,
        cacheTime: 5000,
      });

      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'ng-craft-state-state-user',
      );
      expect(stateSignal()).toEqual({ id: 1, name: 'Romain' });
    });
  });

  it('6 Should clear a specific state from localStorage', async () => {
    await TestBed.runInInjectionContext(async () => {
      localStorage.setItem(
        'ng-craft-state-state-user',
        JSON.stringify({
          state: { id: 1, name: 'Romain' },
          timestamp: Date.now(),
        }),
      );

      const stateSignal = signal({ id: 1, name: 'Romain' });
      const isStableSignal = signal(true);
      const persister = localStoragePersisterV2('state');

      persister.setState((data) => stateSignal.set(data));
      persister.addToPersist({
        key: 'user',
        state: stateSignal,
        isStable: isStableSignal,
        waitForParamsSrcToBeEqualToPreviousValue: false,
        cacheTime: 50000,
      });

      persister.clearState('user');
      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'ng-craft-state-state-user',
      );
    });
  });

  it('7 Should clear all states from localStorage', async () => {
    await TestBed.runInInjectionContext(async () => {
      localStorage.setItem(
        'ng-craft-state-state-user',
        JSON.stringify({
          state: { id: 1, name: 'Romain' },
          timestamp: Date.now(),
        }),
      );
      localStorage.setItem(
        'ng-craft-state-state-settings',
        JSON.stringify({
          state: { theme: 'dark' },
          timestamp: Date.now(),
        }),
      );

      const stateSignal = signal({ id: 1, name: 'Romain' });
      const isStableSignal = signal(true);
      const persister = localStoragePersisterV2('state');

      persister.setState((data) => stateSignal.set(data));
      persister.addToPersist({
        key: 'user',
        state: stateSignal,
        isStable: isStableSignal,
        waitForParamsSrcToBeEqualToPreviousValue: false,
        cacheTime: 50000,
      });
      persister.addToPersist({
        key: 'settings',
        state: stateSignal,
        isStable: isStableSignal,
        waitForParamsSrcToBeEqualToPreviousValue: false,
        cacheTime: 50000,
      });

      persister.clearAllCache();
      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'ng-craft-state-state-user',
      );
      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'ng-craft-state-state-settings',
      );
    });
  });
});
