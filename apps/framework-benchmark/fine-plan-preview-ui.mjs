// Preview-only decoration; never included in measured builds.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
export async function decorateFinePreview(variants, scratch) {
  const labels = {
    'shape-lean': 'Composant entier',
    'fine-reference': 'Bindings génériques',
    'fine-grouped': 'Plan préparé + bindings fins',
    'fine-watch': 'Bindings fins allégés',
    'fine-records': 'Enregistrements légers',
    'fine-manager': 'Gestionnaire commun',
    'plan-auto': 'Plan généré',
    'plan-slots': 'Plan généré + emplacements préparés',
  };
  const url = (v) =>
    `${v.url}/craft-component-fanout/?fields=128&strategy=${v.name === 'shape-lean' ? 'component' : v.name === 'fine-reference' ? 'binding' : 'plan'}&counts=true`;
  const nav = variants
    .map((v) => `<a href="${url(v)}">${labels[v.name] ?? v.name}</a>`)
    .join('');
  const explanation=variants.some(v=>v.name.startsWith('plan-'))
    ?'128 champs indépendants. Comparez le rendu générique, le plan préparé à la main et le plan généré automatiquement depuis le template. Modifiez un champ pour observer les lectures.'
    :'128 champs indépendants. Modifiez le premier ou le dernier et comparez le nombre de lectures entre les trois stratégies. Le moteur reste JavaScript : les plans sont écrits à la main pour cette expérience.';
  const style = `<style>body{font-family:system-ui;max-width:1100px;margin:32px auto;padding:0 24px;color:#172333}h1{font-size:28px}nav{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}nav a,button{padding:10px 14px;border:1px solid #ccd6df;border-radius:8px;background:#fff;color:#172333}nav a{text-decoration:none}.explain{max-width:850px;color:#526170;line-height:1.6}#fanout{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:8px;margin:24px 0}#fanout>span{padding:12px;border:1px solid #d6e0e7;border-radius:6px;font-variant-numeric:tabular-nums}#fanout>span:before{content:attr(data-field)' : ';color:#7d8b96}#fine-stats{padding:16px;background:#edf4f8;border-radius:8px;white-space:pre-wrap;font-size:15px;line-height:1.7}</style>`;
  const script = `<script>(()=>{
    function start(){
      const probe=window.__componentFanout;
      if(!Number.isFinite(probe?.bootstrapMs)){requestAnimationFrame(start);return;}
      const show=()=>{const r=probe.reads(),m=window.__bindingManagerSnapshot?.();document.querySelector('#fine-stats').textContent='Lectures depuis la dernière action : '+r.fields.reduce((a,b)=>a+b,0)+' / 128 champs\\nRéexécutions du template : '+r.renders+'\\nCalculs réactifs déclarés : '+probe.effects().length+(m?'\\nBindings du gestionnaire : '+m.live:'');};
      document.addEventListener('click',e=>{if(e.target.closest('[data-action]'))probe.reset();},true);
      new MutationObserver(show).observe(document.querySelector('#mount'),{subtree:true,childList:true,characterData:true});
      probe.reset();show();
    }start();
  })();</script>`;
  for (const v of variants) {
    const path = join(
      scratch,
      `dist-${v.name}`,
      'craft-component-fanout/index.html',
    );
    let html = await readFile(path, 'utf8');
    html = html
      .replace('</head>', style + '</head>')
      .replace(
        '<h1>Framework benchmark</h1>',
        `<h1>${labels[v.name] ?? v.name}</h1><p class="explain">${explanation}</p><nav>${nav}</nav><pre id="fine-stats">Initialisation…</pre>`,
      )
      .replace('Update one', 'Modifier le premier champ')
      .replace('Update 10%', 'Modifier le dernier champ')
      .replace(/<button data-action="reverse">[\s\S]*?<\/button>/, '')
      .replace(/<button data-action="filter">[\s\S]*?<\/button>/, '')
      .replace('</body>', script + '</body>');
    await writeFile(path, html);
  }
}
