import { replaceOnce } from './prepare.mjs';
export function watchedBindCompiler(source) {
  source = replaceOnce(
    source,
    "    const all = [...readers, ...eventReaders, ...holeReaders].join(',\\n');",
    `    let watchBind=false;
    function observeBind(node: ts.Node): void {
      if(watchBind||ts.isTypeNode(node))return;
      if(ts.isArrowFunction(node)||ts.isFunctionExpression(node)||ts.isFunctionDeclaration(node))return;
      if(ts.isIdentifier(node)){
        const parent=node.parent;
        const key=(ts.isPropertyAssignment(parent)||ts.isPropertyAccessExpression(parent)||ts.isVariableDeclaration(parent))&&parent.name===node;
        if(!key&&node.text!=='undefined'&&node.text!=='NaN'&&node.text!=='Infinity'){
          const symbol=checker.getSymbolAtLocation(node);
          if(!symbol?.declarations?.length||symbol.declarations.some(declaration=>declaration.getSourceFile().isDeclarationFile)){watchBind=true;return;}
        }
      }
      if(ts.isMethodDeclaration(node)||ts.isGetAccessor(node)||ts.isSetAccessor(node)){
        if(node.name&&ts.isComputedPropertyName(node.name))observeBind(node.name.expression);
        return;
      }
      if(ts.isCallExpression(node)){
        const callee=node.expression;
        const native=ts.isIdentifier(callee)&&helpers.has(callee.text)&&sameBinding(callee,helperDeclarations.get(callee.text));
        const component=ts.isIdentifier(callee)&&compiledDefinitions.has(checker.getSymbolAtLocation(callee)!);
        if(!native&&!component){watchBind=true;return;}
      }
      if(ts.isPropertyAccessExpression(node)&&!(ts.isIdentifier(node.expression)&&node.expression.text===input)){watchBind=true;return;}
      if(ts.isElementAccessExpression(node)||ts.isNewExpression(node)||ts.isClassExpression(node)||ts.isBinaryExpression(node)||ts.isConditionalExpression(node)||ts.isTemplateExpression(node)||ts.isSpreadAssignment(node)||ts.isSpreadElement(node)||ts.isObjectBindingPattern(node)||ts.isArrayBindingPattern(node)||ts.isPostfixUnaryExpression(node)||(ts.isPrefixUnaryExpression(node)&&literal(node)===undefined)){watchBind=true;return;}
      ts.forEachChild(node,observeBind);
    }
    if(options.lean)observeBind(fn.body);
    const all = [...readers, ...eventReaders, ...holeReaders].join(',\\n');`,
  );
  source = replaceOnce(
    source,
    "    return `{ version: 1, ${options.lean ? 'lean: true, ' : ''}",
    "    return `{ version: ${watchBind?2:1}, ${watchBind?'watchBind: true, ':''}${options.lean ? 'lean: true, ' : ''}",
  );
  source = replaceOnce(
    source,
    '    const readers: string[] = [];',
    `    const readerPositions: number[] = [], eventPositions: number[] = [], holePositions: number[] = [];
    function capturePosition(n: ts.Node): number {
      return ts.isArrowFunction(n)||ts.isFunctionExpression(n)||ts.isMethodDeclaration(n)?-1:n.getStart(ast);
    }
    const readers: string[] = [];`,
  );
  source = replaceOnce(
    source,
    '        readers.push(`(${code(n)})`);',
    '        readerPositions.push(capturePosition(n));\n        readers.push(`(${code(n)})`);',
  );
  source = replaceOnce(
    source,
    '      readers.push(\n        indirect ?',
    '      readerPositions.push(indirect?-1:capturePosition(n));\n      readers.push(\n        indirect ?',
  );
  source = replaceOnce(
    source,
    '        holeReaders.push(`(${code(n)})`);',
    '        holePositions.push(capturePosition(n));\n        holeReaders.push(`(${code(n)})`);',
  );
  source = replaceOnce(
    source,
    '            eventPlans.push({',
    '            eventPositions.push(capturePosition(ts.isPropertyAssignment(prop)?prop.initializer:prop));\n            eventPlans.push({',
  );
  source = replaceOnce(
    source,
    "    const all = [...readers, ...eventReaders, ...holeReaders].join(',\\n');",
    `    const captureExpressions=[...readers,...eventReaders,...holeReaders];
    const captures=[...readerPositions,...eventPositions,...holePositions].map((position,index)=>({position,index})).filter(capture=>capture.position>=0);
    const reordered=captures.some((capture,index)=>index>0&&capture.position<captures[index-1].position);
    const orderedSetup: string[]=[];
    if(reordered)for(const capture of [...captures].sort((a,b)=>a.position-b.position)){
      const name=fresh('capture');orderedSetup.push(\`const \${name} = \${captureExpressions[capture.index]};\`);captureExpressions[capture.index]=name;
    }
    const all = captureExpressions.join(',\\n');`,
  );
  source = replaceOnce(
    source,
    '    const bind = setup.length',
    '    const bindSetup=[...setup,...orderedSetup];\n    const bind = bindSetup.length',
  );
  return replaceOnce(
    source,
    "${setup.join('\\n')}",
    "${bindSetup.join('\\n')}",
  );
}
export function watchedBindTemplate(source) {
  source = replaceOnce(
    source,
    '  readonly version: 1;',
    '  readonly version: 1 | 2;\n  /** Version 2: template-level reads are tracked separately from binding effects. */\n  readonly watchBind?: boolean;',
  );
  return replaceOnce(
    source,
    '  if (definition && plan.version === 1) {',
    '  if (definition && (plan.version === 1 || plan.version === 2)) {',
  );
}
export function watchedBindRenderer(source) {
  const begin = source.indexOf('class LeanComponentRenderedNode'),
    end = source.indexOf('class ComponentRenderedNode');
  let base = source.slice(begin, end);
  const methodStart = base.indexOf('  private bind(inputs:'),
    methodEnd = base.indexOf('  /** The same dispatch', methodStart);
  let captured = base.slice(methodStart, methodEnd);
  const holeStart = base.indexOf('  private renderHole('),
    holeEnd = base.indexOf('\n  firstNode()', holeStart);
  let incrementalHole = base
    .slice(holeStart, holeEnd)
    .replace('  private renderHole(', '  protected override renderHole(');
  const fastStart = incrementalHole.indexOf('    if (\n      previous &&'),
    fastEnd = incrementalHole.indexOf('    const parent =');
  incrementalHole =
    incrementalHole.slice(0, fastStart) + incrementalHole.slice(fastEnd);
  incrementalHole = replaceOnce(
    incrementalHole,
    '    const children = normalizeChildren(value as CraftNodeChildren);\n',
    '',
  );
  const createStart = incrementalHole.indexOf(
      '    const rendered: RenderedNode[] = []',
    ),
    createEnd =
      incrementalHole.indexOf('    return rendered;', createStart) +
      '    return rendered;'.length;
  incrementalHole =
    incrementalHole.slice(0, createStart) +
    '    return patchRenderedChildren(parent,previous??[],value as CraftNodeChildren,before as NativeNode|null,holeContext);' +
    incrementalHole.slice(createEnd);
  captured = replaceOnce(
    captured,
    '  private bind(inputs: Record<string, unknown>): void {',
    '  private bindCaptured(readers: readonly unknown[]): void {',
  );
  captured = replaceOnce(
    captured,
    '        const readers = plan.bind(inputs);\n',
    '',
  );
  for (const name of ['context', 'plan', 'component', 'declarationContext'])
    base = replaceOnce(
      base,
      '  private readonly ' + name + ':',
      '  protected readonly ' + name + ':',
    );
  for (const name of [
    'nodes',
    'stops',
    'holes',
    'holeContexts',
    'holeEnvironment',
  ])
    base = replaceOnce(
      base,
      '  private ' + name + ':',
      '  protected ' + name + ':',
    );
  for (const name of ['bind', 'listen', 'renderHole', 'stopBindings'])
    base = replaceOnce(
      base,
      '  private ' + name + '(',
      '  protected ' + name + '(',
    );
  const watched = `
/** Keeps the generic template's eager dependencies without rebuilding its DOM. */
class WatchedLeanComponentRenderedNode extends LeanComponentRenderedNode {
  declare private sourceStop?: ()=>void;
  protected override bind(inputs: Record<string,unknown>): void {
    let initial=true,failed=false,failure: unknown;
    const run=()=>{
      const readers=this.context.injector.run(()=>this.plan.bind(inputs));
      untracked(()=>{super.stopBindings();this.bindCaptured(readers);});
    };
    const stop=ɵcraftBindingEffect(()=>{
      if(!initial){run();return;}
      try{run();}catch(error){failed=true;failure=error;}
    });
    initial=false;
    if(failed){try{stop?.();}catch{/* Preserve the binding failure. */}throw failure;}
    if(stop)this.sourceStop=stop;
  }
  protected override stopBindings(): void {
    const stop=this.sourceStop;delete this.sourceStop;
    let errors: unknown[]|undefined;
    try{stop?.();}catch(error){errors=keepCleanupError(errors,error);}
    try{super.stopBindings();}catch(error){errors=keepCleanupError(errors,error);}
    throwCleanupErrors(errors);
  }
${captured}
${incrementalHole}}

`;
  source = source.slice(0, begin) + base + watched + source.slice(end);
  const eligibilityStart = source.indexOf('function canMountLeanComponent('),
    eligibilityEnd = source.indexOf('\n}\n', eligibilityStart) + 2;
  const eligibility = source
    .slice(eligibilityStart, eligibilityEnd)
    .replace('): boolean {', '): CompiledTemplatePlan | undefined {')
    .replace('  return (', '  const eligible = (')
    .replace('  );\n}', '  );\n  return eligible ? plan : undefined;\n}');
  source =
    source.slice(0, eligibilityStart) +
    eligibility +
    source.slice(eligibilityEnd);
  const ctor = source.indexOf(
      '          return new LeanComponentRenderedNode(',
    ),
    caseStart = source.lastIndexOf("    case 'component':", ctor),
    caseEnd = source.indexOf("    case 'directive':", ctor);
  const selection = source
    .slice(caseStart, caseEnd)
    .replace(
      "    case 'component':\n      if (canMountLeanComponent(node, context)) {",
      "    case 'component': {\n      const leanPlan=canMountLeanComponent(node,context);\n      if(leanPlan){",
    )
    .replace(
      '          return new LeanComponentRenderedNode(',
      '          return new (leanPlan.watchBind?WatchedLeanComponentRenderedNode:LeanComponentRenderedNode)(',
    );
  return (
    source.slice(0, caseStart) + selection + '    }\n' + source.slice(caseEnd)
  );
}
