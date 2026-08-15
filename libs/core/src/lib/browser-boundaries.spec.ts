import { craftUse } from './craft-use';
import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import {
  BrowserCrypto,
  BrowserDocument,
  BrowserHistory,
  BrowserLocation,
  BrowserNavigator,
  BrowserPerformance,
  BrowserWindow,
  Console,
  ConsoleService,
  Cookies,
  LocalStorage,
  SessionStorage,
  BrowserLocationService,
  LocalStorageService,
  SessionStorageService,
} from './browser-boundaries';
import { craftService, getServiceMetaData } from './craft-service';

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

function clearCookies() {
  for (const cookie of document.cookie.split(';')) {
    const [name] = cookie.trim().split('=');

    if (!name) {
      continue;
    }

    document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
}

describe('browser boundaries', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.runInInjectionContext(() => {
      craftUse(LocalStorageService()).clear();
      craftUse(SessionStorageService()).clear();
    });
    clearCookies();
    document.title = 'Spec';
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('should expose browserBoundary metadata and support Console DSL plus derivation', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { BootLogger } = craftService(
      { name: 'BootLogger', scope: 'global' },
      function* () {
        yield* Console.log('boot', { ready: true });

        const consoleService = yield* ConsoleService(undefined, ({ log }) => ({
          log,
        }));

        return {
          track: (message: string) => consoleService.log(message),
        };
      },
    );

    expect(getServiceMetaData(ConsoleService).browserBoundary).toBe(true);
    expect(getServiceMetaData(BrowserLocationService).browserBoundary).toBe(
      true,
    );

    expectTypeOf(
      getServiceMetaData(ConsoleService).browserBoundary,
    ).toEqualTypeOf<boolean>();

    TestBed.runInInjectionContext(() => {
      const bootLogger = craftUse(BootLogger());

      bootLogger.track('runtime');
    });

    expect(consoleLogSpy).toHaveBeenNthCalledWith(
      1,
      'boot',
      { ready: true },
      expect.objectContaining({
        from: ['service:BootLogger'],
        trace: expect.any(String),
      }),
    );
    expect(consoleLogSpy).toHaveBeenNthCalledWith(2, 'runtime');
  });

  it('should support LocalStorage, SessionStorage, and Cookies through the DSL', () => {
    const { BrowserPersistence } = craftService(
      { name: 'BrowserPersistence', scope: 'global' },
      function* () {
        yield* LocalStorage.setItem('token', 'abc');
        yield* SessionStorage.setItem('active-tab', 'settings');
        yield* Cookies.set('session', 'xyz', {
          path: '/',
          sameSite: 'strict',
        });

        const token = yield* LocalStorage.getItem('token');
        const localLength = yield* LocalStorage.length();
        const tab = yield* SessionStorage.getItem('active-tab');
        const session = yield* Cookies.get('session');
        const hasSession = yield* Cookies.has('session');
        const cookieMap = yield* Cookies.getAll();

        yield* Cookies.remove('session', { path: '/' });

        return {
          token,
          localLength,
          tab,
          session,
          hasSession,
          cookieMap,
          removedSession: yield* Cookies.get('session'),
        };
      },
    );

    TestBed.runInInjectionContext(() => {
      expect(craftUse(BrowserPersistence())).toEqual({
        token: 'abc',
        localLength: 1,
        tab: 'settings',
        session: 'xyz',
        hasSession: true,
        cookieMap: {
          session: 'xyz',
        },
        removedSession: undefined,
      });
    });
  });

  it('should support location, history, document, window, and navigator boundaries', () => {
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => {});
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const { BrowserSnapshot } = craftService(
      { name: 'BrowserSnapshot', scope: 'global' },
      function* () {
        yield* BrowserHistory.replaceState(
          { step: 2 },
          '',
          '/checkout?step=2#payment',
        );
        yield* BrowserDocument.setTitle('Checkout');
        yield* BrowserWindow.scrollTo(12, 34);
        yield* BrowserWindow.alert('Cache cleared! The page will reload.');
        const confirmed = yield* BrowserWindow.confirm(
          'Cache cleared! The page will reload.',
        );

        return {
          href: yield* BrowserLocation.href(),
          pathname: yield* BrowserLocation.pathname(),
          search: yield* BrowserLocation.search(),
          hash: yield* BrowserLocation.hash(),
          historyState: yield* BrowserHistory.state(),
          title: yield* BrowserDocument.title(),
          visibilityState: yield* BrowserDocument.visibilityState(),
          hasFocus: yield* BrowserDocument.hasFocus(),
          innerWidth: yield* BrowserWindow.innerWidth(),
          innerHeight: yield* BrowserWindow.innerHeight(),
          language: yield* BrowserNavigator.language(),
          languages: yield* BrowserNavigator.languages(),
          cookieEnabled: yield* BrowserNavigator.cookieEnabled(),
          confirmed,
        };
      },
    );

    TestBed.runInInjectionContext(() => {
      expect(craftUse(BrowserSnapshot())).toEqual({
        href: window.location.href,
        pathname: '/checkout',
        search: '?step=2',
        hash: '#payment',
        historyState: {
          step: 2,
        },
        title: 'Checkout',
        visibilityState: document.visibilityState,
        hasFocus: document.hasFocus(),
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        language: navigator.language,
        languages: navigator.languages,
        cookieEnabled: navigator.cookieEnabled,
        confirmed: true,
      });
    });

    expect(scrollToSpy).toHaveBeenCalledWith(12, 34);
    expect(alertSpy).toHaveBeenCalledWith(
      'Cache cleared! The page will reload.',
    );
    expect(confirmSpy).toHaveBeenCalledWith(
      'Cache cleared! The page will reload.',
    );
  });

  it('reads and writes documentElement lang and dir', () => {
    document.documentElement.lang = 'en';
    document.documentElement.removeAttribute('dir');

    const { BrowserDocumentFlow } = craftService(
      { name: 'BrowserDocumentFlow', scope: 'global' },
      function* () {
        expect(yield* BrowserDocument.lang()).toBe('en');
        yield* BrowserDocument.setLang('fr');
        yield* BrowserDocument.setDir('rtl');
        expect(yield* BrowserDocument.lang()).toBe('fr');
        expect(yield* BrowserDocument.dir()).toBe('rtl');
        yield* BrowserDocument.setDir('');
      },
    );

    TestBed.runInInjectionContext(() => {
      craftUse(BrowserDocumentFlow());
    });

    expect(document.documentElement.lang).toBe('fr');
    expect(document.documentElement.hasAttribute('dir')).toBe(false);
  });

  it('should propagate false from BrowserWindow.confirm', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const { LeavePageFlow } = craftService(
      { name: 'LeavePageFlow', scope: 'global' },
      function* () {
        return yield* BrowserWindow.confirm('Stay on page?');
      },
    );

    TestBed.runInInjectionContext(() => {
      expect(craftUse(LeavePageFlow())).toBe(false);
    });

    expect(confirmSpy).toHaveBeenCalledWith('Stay on page?');
  });

  it('should support performance and crypto boundaries', async () => {
    const performanceNowSpy = vi
      .spyOn(performance, 'now')
      .mockReturnValue(42.5);
    const randomUuidSpy = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValue('123e4567-e89b-12d3-a456-426614174000');
    const payload = new TextEncoder().encode('craft');

    const { BrowserDiagnostics } = craftService(
      { name: 'BrowserDiagnostics', scope: 'global' },
      function* () {
        const bytes = yield* BrowserCrypto.getRandomValues(new Uint8Array(8));

        return {
          now: yield* BrowserPerformance.now(),
          uuid: yield* BrowserCrypto.randomUUID(),
          digest: yield* BrowserCrypto.digest('SHA-256', payload),
          bytes,
        };
      },
    );
    await TestBed.runInInjectionContext(async () => {
      const diagnostics = craftUse(BrowserDiagnostics());
      const digest = await diagnostics.digest;

      expect(diagnostics.now).toBe(42.5);
      expect(diagnostics.uuid).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(diagnostics.bytes).toBeInstanceOf(Uint8Array);
      expect(diagnostics.bytes.byteLength).toBe(8);
      const randomBytes = new Uint8Array(
        diagnostics.bytes.buffer,
        diagnostics.bytes.byteOffset,
        diagnostics.bytes.byteLength,
      );
      expect(Array.from(randomBytes).some((value) => value !== 0)).toBe(true);
      expect(digest).toBeTruthy();
      expect(digest.byteLength).toBe(32);
    });

    expect(performanceNowSpy).toHaveBeenCalledOnce();
    expect(randomUuidSpy).toHaveBeenCalledOnce();
  });
});
