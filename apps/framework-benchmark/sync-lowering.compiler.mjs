// PROTOTYPE — conservative TS AST lowering, not a general TypeScript compiler.
import ts from 'typescript';
export function lowerSyncSource(source, fileName, {intrinsics=false,runtimeImport='@craft-ts/core',useImport='@craft-ts/core'}={}) {
  const ast=ts.createSourceFile(fileName,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const stats={eligible:0,skipped:0,uses:0,aliases:0,serviceYields:0,reactiveYields:0,dependencyYields:0,delegates:0};
  const helpers=new Set(), f=ts.factory;
  const helper=name=>{helpers.add(name);return f.createIdentifier(name);};
  const call=(name,args)=>f.createCallExpression(helper(name),undefined,args);
  const unwrap=node=>ts.isParenthesizedExpression(node)||ts.isAsExpression(node)||ts.isTypeAssertionExpression(node)?unwrap(node.expression):node;
  function rawKind(node){
    if(!node)return undefined;
    node=unwrap(node);
    if(!intrinsics)return undefined;
    if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression))
      return ({createYieldRequest:'Service',createDependencyAccessRequest:'Dependency'})[node.expression.text];
    if(ts.isObjectLiteralExpression(node)&&node.properties.some(p=>p.name&&ts.isComputedPropertyName(p.name)&&p.name.expression.getText(ast)==='REACTIVE_READ_REQUEST'))return 'Reactive';
  }
  function eligibility(node){
    if(node.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword)||node.parameters.some(p=>p.initializer)||node.parameters.some(p=>p.name.kind!==ts.SyntaxKind.Identifier))return false;
    let valid=true, hasYield=false, hasTry=false;
    function scan(child){
      if(child!==node.body&&ts.isFunctionLike(child))return;
      if(ts.isTryStatement(child))hasTry=true;
      if(ts.isYieldExpression(child)){hasYield=true;if(!child.asteriskToken&&!rawKind(child.expression))valid=false;}
      if(child.kind===ts.SyntaxKind.SuperKeyword||ts.isMetaProperty(child))valid=false;
      if(ts.isIdentifier(child)&&['arguments','eval'].includes(child.text))valid=false;
      if(node.name&&ts.isFunctionExpression(node)&&ts.isIdentifier(child)&&child.text===node.name.text)valid=false;
      ts.forEachChild(child,scan);
    }
    scan(node.body);return valid&&!(hasYield&&hasTry);
  }
  const result=ts.transform(ast,[context=>{
    function visit(node){
      if((ts.isFunctionExpression(node)||ts.isFunctionDeclaration(node))&&node.asteriskToken&&node.body){
        if(!eligibility(node)){stats.skipped++;return ts.visitEachChild(node,visit,context);}
        stats.eligible++;
        const temps=[];
        function invoke(name,expression,args){
          expression=unwrap(expression);
          if(ts.isPropertyAccessExpression(expression)||ts.isElementAccessExpression(expression)){
            const receiver=f.createUniqueName('__craftReceiver');temps.push(receiver);
            const member=ts.isPropertyAccessExpression(expression)?f.createPropertyAccessExpression(receiver,expression.name):f.createElementAccessExpression(receiver,expression.argumentExpression);
            return f.createParenthesizedExpression(f.createCommaListExpression([
              f.createAssignment(receiver,expression.expression),call(name,[member,receiver,f.createArrayLiteralExpression(args)])]));
          }
          return call(name,[expression,f.createVoidZero(),f.createArrayLiteralExpression(args)]);
        }
        function lower(child){
          if(ts.isFunctionLike(child))return visit(child);
          if(ts.isYieldExpression(child)){
            if(child.asteriskToken){
              stats.delegates++;
              const value=unwrap(child.expression);
              if(ts.isCallExpression(value)&&!value.questionDotToken)
                return invoke('prototypeDelegateCall',ts.visitNode(value.expression,lower),value.arguments.map(a=>ts.visitNode(a,lower)));
              return call('prototypeDelegateValue',[ts.visitNode(child.expression,lower)]);
            }
            const kind=rawKind(child.expression);stats[kind.toLowerCase()+'Yields']++;
            return call('prototypeYield'+kind,[ts.visitNode(child.expression,lower)]);
          }
          return ts.visitEachChild(child,lower,context);
        }
        let body=ts.visitNode(node.body,lower);
        if(temps.length)body=f.updateBlock(body,[f.createVariableStatement(undefined,f.createVariableDeclarationList(temps.map(t=>f.createVariableDeclaration(t)),ts.NodeFlags.Let)),...body.statements]);
        const original=ts.visitEachChild(node,visitChildren,context);
        if(ts.isFunctionExpression(node)){
          const direct=f.createFunctionExpression(undefined,undefined,node.name,node.typeParameters,node.parameters,f.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),body);
          return call('prototypeRegisterSync',[original,direct]);
        }
        if(node.modifiers?.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword))return original;
        const name=f.createUniqueName('__craftDirect_'+node.name.text);
        const direct=f.createFunctionDeclaration(undefined,undefined,name,node.typeParameters,node.parameters,f.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),body);
        return [original,direct,f.createExpressionStatement(call('prototypeRegisterSync',[node.name,name]))];
      }
      // Preserve the generator public API. Only these explicit host calls change.
      if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='craftUse'&&node.arguments.length===1){
        const invocation=unwrap(node.arguments[0]);
        if(ts.isCallExpression(invocation)&&!invocation.questionDotToken){
          const expr=unwrap(invocation.expression);
          // Receiver evaluation is preserved without inventing outer-scope temps.
          if(ts.isIdentifier(expr)){stats.uses++;return call('prototypeUseCall',[ts.visitNode(expr,visit),f.createVoidZero(),f.createArrayLiteralExpression(invocation.arguments.map(a=>ts.visitNode(a,visit)))]);}
        }
      }
      if(intrinsics&&ts.isNewExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='Proxy'&&node.arguments?.length===2&&ts.isIdentifier(node.arguments[0])&&ts.isObjectLiteralExpression(node.arguments[1])&&node.arguments[1].properties.every(p=>!ts.isSpreadAssignment(p)&&p.name&&!ts.isComputedPropertyName(p.name)&&p.name.text!=='apply')){
        stats.aliases++;return call('prototypeAliasSync',[ts.visitEachChild(node,visit,context),node.arguments[0]]);
      }
      return ts.visitEachChild(node,visit,context);
    }
    function visitChildren(node){return ts.visitEachChild(node,visit,context);}
    return root=>ts.visitNode(root,visit);
  }]);
  let printed=ts.createPrinter({newLine:ts.NewLineKind.LineFeed}).printFile(result.transformed[0]);result.dispose();
  const runtimeHelpers=[...helpers].filter(h=>h!=='prototypeUseCall');
  // Preserve the existing order of module dependencies in Core's cyclic graph.
  if(runtimeHelpers.length)printed+=`\nimport {${runtimeHelpers.join(',')}} from '${runtimeImport}';\n`;
  if(helpers.has('prototypeUseCall'))printed+=`\nimport {prototypeUseCall} from '${useImport}';\n`;
  return {source:printed,stats};
}
