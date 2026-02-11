import { TestBed } from '@angular/core/testing';
import { on$ } from './on$';
import { source$ } from './source$';
import { Subject } from 'rxjs';
import { Component, EventEmitter } from '@angular/core';
import { SourceBranded } from './util/util';

describe('on$', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should call the callback when the source emits a value', () => {
    TestBed.runInInjectionContext(() => {
      const mySource = source$<string>();
      const callbackResults: string[] = [];

      on$(mySource, (value) => {
        callbackResults.push(value);
        return value;
      });

      expect(callbackResults).toEqual([]);

      mySource.emit('Hello World');
      expect(callbackResults).toEqual(['Hello World']);

      mySource.emit('Hello Ng-Craft');
      expect(callbackResults).toEqual(['Hello World', 'Hello Ng-Craft']);
    });
  });

  it('should return a branded source', () => {
    TestBed.runInInjectionContext(() => {
      const mySource = source$<number>();

      const brandedSource = on$(mySource, (value) => value * 2);

      // Le readonly source ne devrait pas avoir de méthode emit
      expect(brandedSource).not.toHaveProperty('emit');

      expectTypeOf(brandedSource).toEqualTypeOf<SourceBranded>();
    });
  });

  it('should unsubscribe when the injection context is destroyed', () => {
    const callbackResults: string[] = [];
    let mySource: ReturnType<typeof source$<string>>;

    @Component({ template: '', standalone: true })
    class TestComponent {
      constructor() {
        mySource = source$<string>();
        on$(mySource, (value) => {
          callbackResults.push(value);
          return value;
        });
      }
    }

    const fixture = TestBed.createComponent(TestComponent);

    mySource!.emit('before destroy');
    expect(callbackResults).toEqual(['before destroy']);

    fixture.destroy();

    mySource!.emit('after destroy');
    // Le callback ne devrait plus être appelé après destruction
    expect(callbackResults).toEqual(['before destroy']);
  });

  it('should work with complex objects', () => {
    TestBed.runInInjectionContext(() => {
      interface User {
        id: number;
        name: string;
      }

      const userSource = source$<User>();
      const receivedUsers: User[] = [];

      on$(userSource, (user) => {
        receivedUsers.push(user);
        return user;
      });

      userSource.emit({ id: 1, name: 'Alice' });
      userSource.emit({ id: 2, name: 'Bob' });

      expect(receivedUsers).toEqual([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]);
    });
  });

  it('should allow the callback to perform side effects', () => {
    TestBed.runInInjectionContext(() => {
      const mySource = source$<number>();
      let total = 0;

      on$(mySource, (value) => {
        total += value;
        return total;
      });

      mySource.emit(10);
      expect(total).toBe(10);

      mySource.emit(5);
      expect(total).toBe(15);

      mySource.emit(25);
      expect(total).toBe(40);
    });
  });

  it('should allow to pass an EventEmitter as source', () => {
    TestBed.runInInjectionContext(() => {
      const mySourceEventEmitter = new EventEmitter<number>();

      const callbackResults: number[] = [];
      mySourceEventEmitter.subscribe((v) => v);
      on$(mySourceEventEmitter, (value) => {
        callbackResults.push(value);
        return value;
      });

      mySourceEventEmitter.emit(1);
      mySourceEventEmitter.emit(2);
      mySourceEventEmitter.emit(3);

      expect(callbackResults).toEqual([1, 2, 3]);
    });
  });
  it('should allow to pass an Observable as source', () => {
    TestBed.runInInjectionContext(() => {
      const mySourceEventEmitter = new Subject<number>();

      const callbackResults: number[] = [];
      mySourceEventEmitter.subscribe((v) => v);
      on$(mySourceEventEmitter, (value) => {
        callbackResults.push(value);
        return value;
      });

      mySourceEventEmitter.next(1);
      mySourceEventEmitter.next(2);
      mySourceEventEmitter.next(3);

      expect(callbackResults).toEqual([1, 2, 3]);
    });
  });
});
