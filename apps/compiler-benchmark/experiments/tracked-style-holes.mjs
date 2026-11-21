import { replaceOnce } from './prepare.mjs';
export function trackedStyleCompiler(source) {
  source = replaceOnce(
    source,
    '    let hasStyles=false;',
    '    let hasStyles=false,hasStyleIslands=false;',
  );
  source = replaceOnce(
    source,
    '      if (((!isTag && !isText)||styleIsland) && parent !== undefined && options.lean) {',
    '      if (((!isTag && !isText)||styleIsland) && parent !== undefined && options.lean) {\n        if(styleIsland)hasStyleIslands=true;',
  );
  source = replaceOnce(
    source,
    '    let watchBind = false;',
    '    let watchBind = hasStyleIslands;',
  );
  source = replaceOnce(
    source,
    'version: ${hasStyles ? 3 : watchBind ? 2 : 1}',
    'version: ${hasStyleIslands ? 4 : hasStyles ? 3 : watchBind ? 2 : 1}',
  );
  return replaceOnce(
    source,
    "${watchBind ? 'watchBind: true, ' : ''}",
    "${watchBind ? 'watchBind: true, ' : ''}${hasStyleIslands ? 'trackHoles: true, ' : ''}",
  );
}
export function trackedStyleTemplate(source) {
  source = replaceOnce(
    source,
    'readonly version: 1 | 2 | 3;',
    'readonly version: 1 | 2 | 3 | 4;',
  );
  source = replaceOnce(
    source,
    '  readonly watchBind?: boolean;',
    '  readonly watchBind?: boolean;\n  /** Version 4 also tracks native child patching reads made outside binding effects. */\n  readonly trackHoles?: boolean;',
  );
  return replaceOnce(
    source,
    'plan.version === 3',
    'plan.version === 3 || plan.version === 4',
  );
}
export function trackedStyleRenderer(source) {
  const start = source.indexOf('class WatchedLeanComponentRenderedNode'),
    end = source.indexOf('class ComponentRenderedNode');
  let watched = source.slice(start, end);
  watched = replaceOnce(
    watched,
    `      untracked(() => {
        super.stopBindings();
        this.bindCaptured(readers);
      });`,
    `      untracked(() => super.stopBindings());
      this.bindCaptured(readers);`,
  );
  const methodStart = watched.indexOf('  private bindCaptured('),
    methodEnd = watched.indexOf(
      '  protected override renderHole(',
      methodStart,
    );
  let method = watched.slice(methodStart, methodEnd);
  method = replaceOnce(
    method,
    '    untracked(() =>\n      runInInjectionContext(context.injector, () => {',
    '    const run = () =>\n      runInInjectionContext(context.injector, () => {',
  );
  method = replaceOnce(
    method,
    '      }),\n    );\n  }',
    '      });\n    if(this.plan.trackHoles)run();else untracked(run);\n  }',
  );
  watched = watched.slice(0, methodStart) + method + watched.slice(methodEnd);
  return source.slice(0, start) + watched + source.slice(end);
}
