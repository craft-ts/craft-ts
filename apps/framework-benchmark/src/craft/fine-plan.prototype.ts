// PROTOTYPE — explicit plans, not a compiler and not a public CraftTS API.
// Static creation returns direct node references; only binding reads are reactive.
export interface FinePlanPrototype {
  inputs: readonly string[];
  sharedEffects: boolean;
  create(renderer: any): {root: Element; nodes: Record<string,Node>};
  elements: readonly {slot:string;path:readonly number[]}[];
  bindings: readonly {name:string;read:(input:(name:string)=>any)=>unknown;write:(value:any,nodes:Record<string,any>,renderer:any)=>void}[];
}
export function rowFinePlan(indexes: boolean, sharedEffects: boolean, groupedPosition=false): FinePlanPrototype {
  const bindings: FinePlanPrototype['bindings'][number][] = [
    {name:'fine:id',read:input=>input('row').id,write:(value,n,r)=>r.setAttribute(n.root,'data-row',String(value))},
    {name:'fine:label',read:input=>input('row').label,write:(value,n,r)=>r.setValue(n.label,String(value))},
  ];
  if(indexes) {
    if(groupedPosition) bindings.push({name:'fine:position',read:input=>input('position'),write:(value,n,r)=>{
      r.setAttribute(n.position,'data-position',String(value));r.setValue(n.positionText,`${value+1}. `);
    }});
    else bindings.push(
      {name:'fine:position-attribute',read:input=>input('position'),write:(value,n,r)=>r.setAttribute(n.position,'data-position',String(value))},
      {name:'fine:position-text',read:input=>input('position'),write:(value,n,r)=>r.setValue(n.positionText,`${value+1}. `)},
    );
  }
  return {
    inputs:['row','position'],sharedEffects,
    create:r=>{
      const root=r.createElement('div'),label=r.createText('');
      const nodes:Record<string,Node>={root,label};
      if(indexes){nodes.position=r.createElement('span');nodes.positionText=r.createText('');r.appendChild(nodes.position,nodes.positionText);r.appendChild(root,nodes.position);}
      r.appendChild(root,label);return {root,nodes};
    },
    elements:indexes?[{slot:'root',path:[]},{slot:'position',path:[0]}]:[{slot:'root',path:[]}],
    bindings,
  };
}
export function independentFieldsFinePlan(fields: readonly (()=>number)[], read:(index:number)=>string, sharedEffects=true): FinePlanPrototype {
  return {
    inputs:[],sharedEffects,
    create:r=>{
      const root=r.createElement('div');r.setAttribute(root,'id','fanout');
      const nodes:Record<string,Node>={root};
      fields.forEach((_,i)=>{const span=r.createElement('span'),text=r.createText('');r.setAttribute(span,'data-field',String(i));r.appendChild(span,text);r.appendChild(root,span);nodes['field'+i]=span;nodes['text'+i]=text;});
      return {root,nodes};
    },
    elements:[{slot:'root',path:[]},...fields.map((_,i)=>({slot:'field'+i,path:[i]}))],
    bindings:fields.map((_,i)=>({name:'fine:field-'+i,read:()=>read(i),write:(value,n,r)=>r.setValue(n['text'+i],value)})),
  };
}
