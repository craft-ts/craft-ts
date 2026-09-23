import { describe, expect, it } from 'vitest';
import { ideLinkUrl, sourcePathOf } from './ide-links';

describe('IDE source links', () => {
  it('locates the component source in visual and template subjects', () => {
    expect(
      sourcePathOf(
        'template:component:apps/demo/src/app/app.ts:App#command:primitive:apps/demo/src/app/app.ts',
      ),
    ).toBe('apps/demo/src/app/app.ts');
    expect(
      sourcePathOf('visual:component:apps/demo/src/app/app.ts:App#dark'),
    ).toBe('apps/demo/src/app/app.ts');
    expect(sourcePathOf('folder-layout:proposal')).toBeUndefined();
  });

  it('builds encoded editor links and rejects paths outside the checkout', () => {
    expect(ideLinkUrl(true, 'apps/demo/src/app.ts', 'cursor', 42)).toBe(
      '/api/open-in-ide?ide=cursor&file=apps%2Fdemo%2Fsrc%2Fapp.ts&line=42',
    );
    expect(ideLinkUrl(true, '../secret.ts', 'vscode')).toBeUndefined();
    expect(ideLinkUrl(true, '/etc/passwd', 'vscode')).toBeUndefined();
    expect(ideLinkUrl(undefined, 'src/app.ts', 'vscode')).toBeUndefined();
  });
});
