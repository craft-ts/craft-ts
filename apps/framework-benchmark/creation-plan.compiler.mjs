// PROTOTYPE — compile a conservative, static Craft template subset to DOM plans.
import ts from 'typescript';
const printer=ts.createPrinter({removeComments:true});
const quote=JSON.stringify;
export function compileCreationPlans(source,fileName,{layout='slots',flags=['settings.indexes']}={}){
 const ast=ts.createSourceFile(fileName,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),f=ts.factory;
 const print=n=>printer.printNode(ts.EmitHint.Unspecified,n,ast);
 let serial=0;
 const taken=new Set();
 const fresh=prefix=>{let name;do{name=`__craft_${prefix}_${serial++}`;}while(source.includes(name)||taken.has(name));taken.add(name);return name;};
 const helpers=Object.fromEntries(['prototypeAttachCreationPlan','prototypePlanText','prototypePlanAttribute','prototypePlanRead'].map(name=>[name,source.includes(name)?fresh('helper'):name]));
 const unwrap=n=>ts.isParenthesizedExpression(n)||ts.isAsExpression(n)||ts.isNonNullExpression(n)?unwrap(n.expression):n;
 const tags=new Map(),manifest=[],edits=[];
 let componentName;
 for(const s of ast.statements)if(ts.isImportDeclaration(s)&&s.moduleSpecifier.text==='@craft-ts/component')
  for(const e of s.importClause?.namedBindings?.elements??[]){
   const imported=(e.propertyName??e.name).text;
   if(imported==='craftComponent')componentName=e.name.text;
   if(['div','span','p','section','article','header','footer','strong','em','small','button','label'].includes(imported))tags.set(e.name.text,imported);
  }
 const fail=reason=>{throw Error(reason);};
 function returnExpression(fn){
  if(!ts.isArrowFunction(fn)&&!ts.isFunctionExpression(fn))fail('template or binding is not a function literal');
  if(fn.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword))fail('async function');
  if(!ts.isBlock(fn.body))return fn.body;
  if(fn.body.statements.length!==1||!ts.isReturnStatement(fn.body.statements[0])||!fn.body.statements[0].expression)fail('function body requires runtime statements');
  return fn.body.statements[0].expression;
 }
 function bindingValue(node,inputName,inputs,captures){
  node=unwrap(node);
  const direct=ts.isPropertyAccessExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text===inputName;
  let expression=direct?f.createCallExpression(f.createIdentifier('__readInput'),undefined,[f.createStringLiteral(node.name.text)]):returnExpression(node);
  if(!direct&&(ts.isArrowFunction(node)||ts.isFunctionExpression(node))&&node.parameters.length)fail('binding parameters');
  let reads=new Set();
  const transformed=ts.transform(expression,[context=>root=>{
   function visit(n){
    if(ts.isTypeNode(n))return n;
    if(ts.isShorthandPropertyAssignment(n)&&['input','context','renderer','nodes','state','value','unseen'].includes(n.name.text))
      return f.createPropertyAssignment(n.name,visit(n.name));
    if(ts.isYieldExpression(n)){
     const e=n.expression&&unwrap(n.expression);
     if(!n.asteriskToken||!e||!ts.isCallExpression(e)||e.arguments.length||!ts.isPropertyAccessExpression(e.expression)||!ts.isIdentifier(e.expression.expression)||e.expression.expression.text!==inputName)fail('yield is not a direct component input read');
     const key=e.expression.name.text;reads.add(key);
     if(!inputs.includes(key))fail('undeclared input '+key);
     return f.createCallExpression(f.createIdentifier('__readInput'),undefined,[f.createStringLiteral(key)]);
    }
    if(ts.isIdentifier(n)&&n.text===inputName)fail('input is used outside a yield or shorthand binding');
    if(n.kind===ts.SyntaxKind.ThisKeyword||n.kind===ts.SyntaxKind.SuperKeyword||ts.isMetaProperty(n)||ts.isFunctionLike(n))fail('binding captures unsupported context');
    if(ts.isIdentifier(n)){
      const propertyName=n.parent&&((ts.isPropertyAccessExpression(n.parent)&&n.parent.name===n)||(ts.isPropertyAssignment(n.parent)&&n.parent.name===n));
      if(!propertyName&&['arguments','eval','__readInput'].includes(n.text)&&!direct)fail('binding uses reflection or a reserved compiler name');
      if(!propertyName&&(['input','context','renderer','nodes','state','value','unseen'].includes(n.text)||/^output\d+$/.test(n.text))){
        if(ts.isTypeOfExpression(n.parent)||ts.isPrefixUnaryExpression(n.parent)||ts.isPostfixUnaryExpression(n.parent)||(ts.isBinaryExpression(n.parent)&&n.parent.left===n&&n.parent.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&n.parent.operatorToken.kind<=ts.SyntaxKind.LastAssignment))fail('binding mutates or reflects a captured name');
        if(!captures.has(n.text))captures.set(n.text,fresh('capture'));
        return f.createCallExpression(f.createIdentifier(captures.get(n.text)),undefined,[]);
      }
    }
    return ts.visitEachChild(n,visit,context);
   }
   return ts.visitNode(root,visit);
  }]);
  expression=transformed.transformed[0];
  if(direct){reads.add(node.name.text);if(!inputs.includes(node.name.text))fail('undeclared input');}
  const text=print(expression);transformed.dispose();
  return {expression,text,reads:[...reads]};
 }
 function compileComponent(declaration,call){
  const imported=new Set([componentName,...tags.keys()]);
  const names=binding=>ts.isIdentifier(binding)?[binding.text]:binding.elements.flatMap(e=>ts.isOmittedExpression(e)?[]:names(e.name));
  for(let scope=declaration.parent;scope;scope=scope.parent){
    if(ts.isFunctionLike(scope)&&scope.parameters.some(p=>names(p.name).some(n=>imported.has(n))))fail('a Craft helper is shadowed by a parameter');
    if(ts.isBlock(scope)||ts.isSourceFile(scope))for(const s of scope.statements){
      const bindings=ts.isVariableStatement(s)?s.declarationList.declarations.flatMap(d=>names(d.name)):
        (ts.isFunctionDeclaration(s)||ts.isClassDeclaration(s))&&s.name?[s.name.text]:[];
      if(bindings.some(n=>imported.has(n)))fail('a Craft helper is shadowed in this scope');
    }
  }
  if(call.arguments.length!==3||!ts.isStringLiteral(call.arguments[0])||!ts.isObjectLiteralExpression(call.arguments[1])||call.arguments[1].properties.length)fail('component metadata or composition requires the generic runtime');
  const template=call.arguments[2];
  if(template.asteriskToken)fail('generator component setup');
  if(template.parameters?.length>1||template.parameters?.some(p=>!ts.isIdentifier(p.name)||p.initializer))fail('component parameters');
  const parameter=template.parameters?.[0],inputName=parameter?.name.text;
  if(inputName&&tags.has(inputName))fail('input shadows a DOM helper');
  const inputs=[],scalarInputs=new Set();
  if(parameter){
   if(!parameter.type||!ts.isTypeLiteralNode(parameter.type))fail('input layout requires an explicit object type');
   for(const p of parameter.type.members){
    if(!ts.isPropertySignature(p)||!p.name||(!ts.isIdentifier(p.name)&&!ts.isStringLiteral(p.name)))fail('dynamic input layout');
    const name=p.name.text;inputs.push(name);
    if(p.type&&ts.isTypeReferenceNode(p.type)&&p.type.typeArguments?.length===1&&[ts.SyntaxKind.NumberKeyword,ts.SyntaxKind.StringKeyword,ts.SyntaxKind.BooleanKeyword].includes(p.type.typeArguments[0].kind))scalarInputs.add(name);
   }
  }
  const root=returnExpression(template),conditions=new Set();
  const captures=new Map();
  function scan(n){
   if(ts.isFunctionLike(n))return;
   if(ts.isConditionalExpression(n)){
    const conditionNode=unwrap(n.condition);
    if(inputName&&ts.isPropertyAccessExpression(conditionNode)&&ts.isIdentifier(conditionNode.expression)&&conditionNode.expression.text===inputName)fail('dynamic DOM branch depends on component inputs');
    const condition=print(n.condition);
    if(!flags.includes(condition))fail('dynamic DOM branch: '+condition);
    conditions.add(condition);
   }
   ts.forEachChild(n,scan);
  }
  scan(root);if(conditions.size>2)fail('too many static specializations');
  const conditionList=[...conditions];
  const variants=[];
  for(let bits=0;bits<2**conditionList.length;bits++){
   const nodes=[],bindings=[],elements=[];
   function tree(n,parent,path){
    n=unwrap(n);
    if(n.kind===ts.SyntaxKind.NullKeyword||n.kind===ts.SyntaxKind.FalseKeyword)return;
    if(ts.isConditionalExpression(n))return tree(bits&(1<<conditionList.indexOf(print(n.condition)))?n.whenTrue:n.whenFalse,parent,path);
    if(ts.isArrayLiteralExpression(n)){for(const child of n.elements)tree(child,parent,path);return;}
    if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&tags.has(n.expression.text)){
     const slot=nodes.length,node={slot,kind:'element',tag:tags.get(n.expression.text),parent,path:parent===null?[]:[...nodes[parent].path,nodes[parent].children++],children:0,attrs:[]};nodes.push(node);elements.push(node);
     let args=[...n.arguments];
     if(args[0]&&ts.isObjectLiteralExpression(args[0])){
      for(const prop of args.shift().properties){
       if(!ts.isPropertyAssignment(prop)||(!ts.isIdentifier(prop.name)&&!ts.isStringLiteral(prop.name)))fail('dynamic/spread DOM properties');
       const key=prop.name.text;
       if(!(['id','title','role'].includes(key)||key.startsWith('data-')||key.startsWith('aria-'))||key.startsWith('data-craft-'))fail('unsupported DOM property: '+key);
       const value=unwrap(prop.initializer);
       if(ts.isStringLiteral(value)||ts.isNumericLiteral(value)||[ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword,ts.SyntaxKind.NullKeyword].includes(value.kind))node.attrs.push({key,value:print(value)});
       else bindings.push({node:slot,kind:'attr',key,...bindingValue(value,inputName,inputs,captures)});
      }
     }
     for(const child of args)tree(child,slot,node.path);
     return;
    }
    if(parent===null)fail('root must be one static element');
    const slot=nodes.length;
    if(ts.isStringLiteral(n)||ts.isNumericLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))nodes.push({slot,kind:'text',value:ts.isNumericLiteral(n)?String(Number(n.text)):n.text,parent,path:[...nodes[parent].path,nodes[parent].children++]});
    else {nodes.push({slot,kind:'text',value:'',parent,path:[...nodes[parent].path,nodes[parent].children++]});bindings.push({node:slot,kind:'text',...bindingValue(n,inputName,inputs,captures)});}
   }
   tree(root,null,[]);if(!nodes.length||nodes[0].kind!=='element'||nodes.filter(n=>n.parent===null).length!==1)fail('multiple or empty roots');
   const groups=[],pureInputs=[];
   for(const b of bindings){
    // Only share scalar input reads; arbitrary functions/property getters stay separate.
    const key=b.reads.length===1?b.reads[0]:null;
    let pure=true,count=0;
    function scalar(n){
      if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='__readInput'){count++;return;}
      if(ts.isIdentifier(n)||ts.isPropertyAccessExpression(n)||ts.isElementAccessExpression(n)||ts.isCallExpression(n)||ts.isNewExpression(n))pure=false;
      ts.forEachChild(n,scalar);
    }
    scalar(b.expression);
    const simple=key&&scalarInputs.has(key)&&pure&&count===1;
    let group=simple?groups.find(g=>g.scalar===key):undefined;
    if(!group){group={scalar:simple?key:null,read:simple?`__readInput(${quote(key)})`:b.text,bindings:[],name:simple?`compiled:input:${key}`:`compiled:${nodes[b.node].path.join('.')}:${b.key??'text'}`};groups.push(group);}
    group.bindings.push(b);
   }
   for(const group of groups)if(group.scalar&&group.bindings.length>1)pureInputs.push(group.scalar);
   // Sharing one scalar binding is unnecessary and must not restrict callers.
   for(const g of groups)if(g.bindings.length===1){g.scalar=null;g.read=g.bindings[0].text;}
   const rewrite=(text,replace)=>text.replace(/__readInput\("([^"]+)"\)/g,(_,key)=>replace(key));
   const normalized=(b,expr)=>b.kind==='text'?`${helpers.prototypePlanText}(${expr},context)`:`${helpers.prototypePlanAttribute}(${expr},${quote(b.key)},context)`;
   const nodeRef=(slot)=>layout==='slots'?`state[${inputs.length+slot}]`:`nodes.n${slot}`;
   const write=(b,expr)=>b.kind==='text'?`renderer.setValue(${nodeRef(b.node)},${expr});`:`if(${expr}===null)renderer.removeAttribute(${nodeRef(b.node)},${quote(b.key)});else renderer.setAttribute(${nodeRef(b.node)},${quote(b.key)},${expr});`;
   const createLines=[];
   for(const n of nodes){
    createLines.push(`${nodeRef(n.slot)}=renderer.${n.kind==='element'?`createElement(${quote(n.tag)})`:`createText(${quote(n.value)})`};`);
    for(const a of n.attrs??[])createLines.push(`{const value=${helpers.prototypePlanAttribute}(${a.value},${quote(a.key)},undefined);if(value!==null)renderer.setAttribute(${nodeRef(n.slot)},${quote(a.key)},value);}`);
    if(n.parent!==null)createLines.push(`renderer.appendChild(${nodeRef(n.parent)},${nodeRef(n.slot)});`);
   }
   const emitted=groups.map((g,i)=>{
    const read=rewrite(g.read,key=>layout==='slots'?`${helpers.prototypePlanRead}(state[${inputs.indexOf(key)}]())`:`input(${quote(key)})`);
    const readValue=g.scalar?read:normalized(g.bindings[0],read);
    const writes=g.bindings.map((b,j)=>{
     if(!g.scalar)return write(b,'value');
     const expr=rewrite(b.text,()=> 'value'),name='output'+j;
     return `{const ${name}=${normalized(b,expr)};${write(b,name)}}`;
    }).join('');
    if(layout==='record')return `{name:${quote(g.name)},read:(input:any,context:any)=>(${readValue}),write:(value:any,nodes:any,renderer:any,context:any)=>{${writes}}}`;
    const cache=inputs.length+nodes.length+i;
    return `{name:${quote(g.name)},run:(state:any[],renderer:any,context:any)=>{const value=${readValue};if(state[${cache}]===unseen||!Object.is(state[${cache}],value)){${writes}state[${cache}]=value;}}}`;
   });
   const elementData=elements.map(n=>({slot:layout==='slots'?inputs.length+n.slot:'n'+n.slot,path:n.path}));
   const valid=conditionList.map((expr,i)=>`${expr}===${!!(bits&(1<<i))}`).join('&&')||'true';
   const common=`inputs:${quote(inputs)},sharedEffects:true,pureInputs:${quote(pureInputs)},valid:()=>${valid},elements:${quote(elementData)},bindings:[${emitted.join(',')}]`;
   let plan;
   if(layout==='record')plan=`{${common},create:(renderer:any)=>{const nodes:any={};${createLines.join('')}return {root:nodes.n0,nodes};}}`;
   else {const size=inputs.length+nodes.length+groups.length;
    const initial=[...inputs.map(key=>`signal(props[${quote(key)}])`),...nodes.map(()=> 'undefined'),...groups.map(()=> 'unseen')];
    plan=`(()=>{const unseen=Symbol('unseen');return {${common},version:2,rootSlot:${inputs.length},size:${size},prepare:(props:any,signal:any)=>[${initial.join(',')}],update:(state:any[],props:any)=>{${inputs.map((key,i)=>`state[${i}].set(props[${quote(key)}]);`).join('')}},create:(state:any[],renderer:any)=>{${createLines.join('')}}};})()`;
   }
   variants.push({bits,plan,layout:{inputs,nodeCount:nodes.length,elements:elementData,bindingCount:groups.length,pureInputs,arenaSize:layout==='slots'?inputs.length+nodes.length+groups.length:null}});
  }
  let expression=variants.at(-1).plan;
  for(let i=variants.length-2;i>=0;i--){const checks=conditionList.map((flag,j)=>`(${flag})===${!!(i&(1<<j))}`).join('&&');expression=`(${checks})?(${variants[i].plan}):(${expression})`;}
  const captureText=[...captures].map(([original,name])=>`const ${name}=()=>${original};`).join('\n');
  const text=`\n${captureText?captureText+'\n':''}${helpers.prototypeAttachCreationPlan}(${declaration.name.text},(${expression}));\n`;
  manifest.push({component:call.arguments[0].text,variable:declaration.name.text,status:'compiled',layout,variants:variants.map(({bits,layout})=>({bits,...layout})),conditions:conditionList});
  return text;
 }
 function walk(node){
  if(ts.isVariableStatement(node)&&node.declarationList.declarations.length===1){
   const d=node.declarationList.declarations[0],call=d.initializer&&unwrap(d.initializer);
   if(ts.isIdentifier(d.name)&&call&&ts.isCallExpression(call)&&ts.isIdentifier(call.expression)&&call.expression.text===componentName){
    try{edits.push({at:node.end,text:compileComponent(d,call)});}catch(error){manifest.push({variable:d.name.text,status:'fallback',reason:error.message});}
   }
  }
  ts.forEachChild(node,walk);
 }
 walk(ast);
 let output=source;for(const edit of edits.sort((a,b)=>b.at-a.at))output=output.slice(0,edit.at)+edit.text+output.slice(edit.at);
 if(edits.length)output+=`\nimport {${Object.entries(helpers).map(([name,alias])=>name===alias?name:`${name} as ${alias}`).join(',')}} from '@craft-ts/component';\n`;
 return {source:output,manifest};
}
