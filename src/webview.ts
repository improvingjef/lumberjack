// The webview — the calm glance. Sedimented sections, a one-line summary, a
// disposable lens you raise, read, and drop. Renders from data the host posts
// (cache-first, then live) and posts back peek/dive/fell/diff intents.

function nonce(): string {
  let s = "";
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

export function fleetHtml(compact = false): string {
  const n = nonce();
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${n}';">
<style>
  :root{ --blue:#3b82f6; --red:#ef4444; --green:#22c55e; --amber:#f59e0b; }
  *{box-sizing:border-box}
  body{margin:0;font:13px/1.45 var(--vscode-editor-font-family,ui-monospace,Menlo,monospace);
       color:var(--vscode-foreground);background:var(--vscode-editor-background)}
  .sq{display:inline-block;width:11px;height:11px;border-radius:2px;vertical-align:middle}
  .blue{background:var(--blue)} .red{background:var(--red)} .green{background:var(--green)}
  @keyframes breathe{0%,100%{opacity:1}50%{opacity:.55}}
  .sq.blue{animation:breathe 2.6s ease-in-out infinite}
  header{padding:9px 14px;border-bottom:1px solid var(--vscode-panel-border);display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  h1{font-size:13px;margin:0;font-weight:600;white-space:nowrap}
  .summary{opacity:.85;flex:1;min-width:120px}
  .summary b{font-weight:600} .summary .amberc{color:var(--amber)}
  .filter input{background:var(--vscode-input-background);color:var(--vscode-input-foreground);
    border:1px solid var(--vscode-input-border,transparent);border-radius:4px;padding:3px 7px;font:inherit;width:150px}
  .wrap{display:flex;height:calc(100vh - 42px)}
  .col{overflow:auto} .left{flex:1;padding:2px 0}
  .mid,.right{width:0;overflow:hidden;border-left:1px solid var(--vscode-panel-border);transition:width .12s ease}
  .mid.open{width:min(42vw,560px)} .right.open{width:min(30vw,420px)}
  body[data-compact] .mid,body[data-compact] .right{display:none}
  body[data-compact] .summary{flex-basis:100%;order:3} body[data-compact] .filter input{width:100%}
  .sect{margin-top:2px}
  .shdr{display:flex;gap:7px;align-items:center;padding:6px 14px 4px;cursor:pointer;opacity:.72;
        font-size:11px;text-transform:uppercase;letter-spacing:.05em;user-select:none}
  .shdr:hover{opacity:1} .shdr .chev{transition:transform .12s;display:inline-block;width:9px}
  .shdr.closed .chev{transform:rotate(-90deg)} .shdr .ct{opacity:.6;font-variant-numeric:tabular-nums}
  .shdr .dot{width:7px;height:7px;border-radius:2px;flex:none}
  .row{display:flex;gap:12px;align-items:baseline;padding:4px 14px;cursor:pointer;border-left:3px solid transparent}
  .row:hover,.cmt:hover,.file:hover{background:var(--vscode-list-hoverBackground)}
  .row.sel{background:var(--vscode-list-activeSelectionBackground);border-left-color:var(--blue)}
  .row.cursor{background:var(--vscode-list-focusBackground,var(--vscode-list-hoverBackground));border-left-color:var(--vscode-focusBorder,#5a9)}
  .row.amber .nm{color:var(--amber)}
  .nm{min-width:270px;max-width:270px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:none}
  body[data-compact] .nm{min-width:150px;max-width:150px}
  .sqs{display:flex;flex-wrap:wrap;gap:3px;align-content:flex-start;flex:1}
  .ovf{opacity:.55;font-size:11px;margin-left:4px}
  .agetag{opacity:.7;color:var(--amber);font-size:11px;margin-left:6px;flex:none}
  .claim{margin-left:6px;flex:none;cursor:default;font-size:11px}
  .acts{display:flex;gap:4px;margin-left:6px;flex:none;opacity:0;transition:opacity .1s}
  .row:hover .acts{opacity:.6} .act{cursor:pointer;user-select:none;padding:0 1px} .act:hover{opacity:1;transform:scale(1.18)}
  .hdraxe{margin-left:auto;cursor:pointer;opacity:.45;user-select:none;padding:0 2px} .hdraxe:hover{opacity:1;transform:scale(1.15)}
  .row.falling{transform-origin:left bottom;transition:transform .5s cubic-bezier(.6,.04,.98,.34),opacity .5s ease-in;
    transform:translateY(48px) rotate(7deg);opacity:0;pointer-events:none}
  @keyframes ljrise{from{opacity:0;transform:translateY(-20px) scaleY(.5)}to{opacity:1;transform:none}}
  .row.rising{transform-origin:left bottom;animation:ljrise .42s cubic-bezier(.22,1,.36,1)}
  .pad{padding:12px 14px} .pad h2{font-size:13px;margin:0 0 2px}
  .rbranch{opacity:.65;margin-bottom:10px;word-break:break-all}
  .cmt{display:flex;gap:8px;padding:6px 8px;border-top:1px solid var(--vscode-panel-border);cursor:pointer;border-radius:4px}
  .cmt.sel{background:var(--vscode-list-activeSelectionBackground)} .cmt .sq{margin-top:3px;flex:none}
  .csha{opacity:.6;flex:none} .csub{flex:1;word-break:break-word}
  .file{padding:4px 6px;border-top:1px solid var(--vscode-panel-border);word-break:break-all;cursor:pointer;border-radius:4px}
  .hint{opacity:.6;margin-bottom:8px}
  .loading{padding:18px 16px;opacity:.7;display:flex;gap:9px;align-items:center}
  @keyframes spin{to{transform:rotate(360deg)}}
  .spin{width:13px;height:13px;border:2px solid var(--vscode-panel-border);border-top-color:var(--green);border-radius:50%;animation:spin .8s linear infinite}
  .empty{padding:16px 14px;opacity:.55}
</style></head>
<body${compact ? " data-compact" : ""}>
<header>
  <h1>🪓 fleet</h1>
  <span id="summary" class="summary">…</span>
  <span class="filter"><input id="q" placeholder="/ filter…"></span>
</header>
<div class="wrap">
  <div class="col left" id="left"><div class="loading"><span class="spin"></span> reading the stand…</div></div>
  <div class="col mid" id="mid"><div class="pad" id="midpad"></div></div>
  <div class="col right" id="right"><div class="pad" id="rightpad"></div></div>
</div>
<script nonce="${n}">
const vscode = acquireVsCodeApi();
const COMPACT = ${compact};
let DATA = {worktrees:[],branches:[]};
let selRow=null, selRowObj=null, selCmt=-1, pendingRise=null, cursor=-1, loaded=false;
let flat=[];                       // visible rows in draw order: {el,r,gid}
const fileCache={};                // sha -> {files,overflow}
const collapsed={needs:false,wip:false,dead:true,understory:true};
const $=id=>document.getElementById(id);
const left=$('left'),mid=$('mid'),right=$('right'),midpad=$('midpad'),rightpad=$('rightpad'),q=$('q'),summary=$('summary');
const esc=s=>{const d=document.createElement('div');d.textContent=s;return d.innerHTML;};

// grouping + aging are stamped on each row by the host (see core.ts) — the
// view carries no domain logic, it just reads r.group and r.amber.
function squares(r){
  // always reserve the WIP slot so commit squares line up in a column
  let h = r.dirty ? '<span class="sq blue" title="uncommitted WIP"></span>' : '<span class="sq"></span>';
  for(const c of r.commits){const cls=c.onMaster?'green':'red';
    h+='<span class="sq '+cls+'" title="'+esc(c.short+' '+c.subj)+'"></span>';}
  if(r.overflow) h+='<span class="ovf">+'+r.overflow+'</span>';
  return h;
}
function rowEl(r,gid){
  const el=document.createElement('div'), id=gid+':'+r.name;
  el.className='row'+(selRow===id?' sel':'')+(r.amber?' amber':'');
  el.dataset.path=r.path;
  const age = r.amber ? '<span class="agetag" title="untouched '+Math.floor(r.age)+' days">'+Math.floor(r.age)+'d</span>' : '';
  const claim = r.claim ? '<span class="claim" title="'+esc(r.claim)+'">📌</span>' : '';
  const acts = gid==='w' ? '<span class="acts">'
    + '<span class="act" data-a="open" title="open the worktree">↗</span>'
    + (r.group==='needs' ? '<span class="act" data-a="land" title="land — ff-merge to trunk">⬆</span>' : '')
    + (r.dirty ? '<span class="act" data-a="salvage" title="park WIP to the salvage branch">💾</span>' : '')
    + '<span class="act" data-a="fell" title="fell (f)">🪓</span>'
    + '</span>' : '';
  el.innerHTML='<span class="nm" title="'+esc(r.name)+'">'+esc(r.name)+'</span><span class="sqs">'+squares(r)+'</span>'+claim+age+acts;
  el.onclick=()=>selectRow(r,id);
  el.querySelectorAll('.act').forEach(a=>a.onclick=e=>{e.stopPropagation();
    const k=a.dataset.a;
    if(k==='fell') fellRow(r);
    else if(k==='salvage') vscode.postMessage({type:'salvage',path:r.path,name:r.name});
    else if(k==='land') vscode.postMessage({type:'land',branch:r.branch,name:r.name,path:r.path});
    else if(k==='open') diveRow(r);});
  if(pendingRise===r.path){el.classList.add('rising');pendingRise=null;}
  return el;
}
function section(title,key,rows,dotColor,gid){
  if(!rows.length) return;
  const closed=collapsed[key];
  const hdr=document.createElement('div');
  hdr.className='shdr'+(closed?' closed':'');
  hdr.innerHTML='<span class="chev">▾</span>'+(dotColor?'<span class="dot" style="background:'+dotColor+'"></span>':'')
    +'<span>'+title+'</span><span class="ct">'+rows.length+'</span>';
  hdr.onclick=()=>{collapsed[key]=!collapsed[key];render();};
  const bulk = key==='dead' ? {icon:'🪓',type:'fellGroup',title:'fell all '+rows.length+' deadwood'}
             : key==='wip' ? {icon:'💾',type:'salvageGroup',title:'salvage all '+rows.length+' WIP → the review branch'}
             : key==='needs' ? {icon:'⬆',type:'landGroup',title:'land all '+rows.length+' ready (ff to trunk)'} : null;
  if(bulk){
    const a=document.createElement('span'); a.className='hdraxe'; a.title=bulk.title; a.textContent=bulk.icon;
    a.onclick=e=>{e.stopPropagation();vscode.postMessage({type:bulk.type,trees:rows.map(r=>({path:r.path,branch:r.branch,name:r.name}))});};
    hdr.appendChild(a);
  }
  left.appendChild(hdr);
  if(!closed) for(const r of rows){ const el=rowEl(r,gid); left.appendChild(el); flat.push({el,r,gid}); }
}
function render(){
  const f=q.value.trim().toLowerCase();
  const match=r=>!f||r.name.toLowerCase().includes(f);
  const wt=DATA.worktrees.filter(match);
  const needs=wt.filter(r=>r.group==='needs');
  const wip=wt.filter(r=>r.group==='wip');
  const dead=wt.filter(r=>r.group==='dead');
  const br=DATA.branches.filter(match);
  const aging=wt.filter(r=>r.amber).length;
  summary.innerHTML='<b>'+needs.length+'</b> need you · <b>'+wip.length+'</b> uncommitted · <b>'
    +dead.length+'</b> deadwood · <b>'+br.length+'</b> understory'
    +(aging?' · <span class="amberc"><b>'+aging+'</b> aging</span>':'');
  left.innerHTML=''; flat=[]; cursor=-1;
  if(!loaded){ left.innerHTML='<div class="loading"><span class="spin"></span> reading the stand…</div>'; return; }
  section('needs you','needs',needs,'var(--red)','w');
  section('uncommitted wip','wip',wip,'var(--blue)','w');
  section('deadwood','dead',dead,'var(--green)','w');
  section('understory — branches','understory',br,'','b');
  if(!needs.length && !wip.length && !dead.length && !br.length){
    const e=document.createElement('div'); e.className='empty';
    e.textContent = f ? 'no match.' : 'the stand is clear. nothing needs you.';
    left.appendChild(e); // appendChild, NOT innerHTML+= (which re-parses and strips handlers)
  }
}

function selectByPath(p){ const r=DATA.worktrees.find(x=>x.path===p); if(r&&!COMPACT) selectRow(r,'w:'+r.name); }
function selectRow(r,id){
  if(COMPACT){ selRow=id; selRowObj=r; render(); vscode.postMessage({type:'openFull',name:r.name,path:r.path}); return; }
  selRow=id; selRowObj=r; selCmt=-1; q.blur();
  if(r.kind==='worktree'&&r.group) collapsed[r.group]=false; // reveal it in the left column
  mid.classList.add('open'); right.classList.remove('open');
  let h='<h2>'+esc(r.name)+'</h2><div class="rbranch">'+esc(r.branch)+'<br>'+esc(r.path)+'</div>';
  if(r.claim) h+='<div class="rbranch" style="color:var(--blue)">📌 '+esc(r.claim)+'</div>';
  if(r.ahead) h+='<div class="rbranch" style="color:var(--red)">'+r.ahead+' commit(s) not on the trunk</div>';
  h+='<div class="hint">Enter dives in · click a commit for its files</div>';
  r.commits.forEach((c,i)=>{const cls=c.onMaster?'green':'red';
    h+='<div class="cmt" data-i="'+i+'"><span class="sq '+cls+'"></span><span class="csha">'+esc(c.short)+'</span><span class="csub">'+esc(c.subj)+'</span></div>';});
  if(r.overflow) h+='<div class="cmt"><span class="csub ovf">…+'+r.overflow+' older</span></div>';
  if(r.dirty){h+='<div class="hint" style="margin-top:12px;color:var(--blue)">WIP — click a file to diff</div>';
    for(const line of r.wip){const p=line.slice(3); h+='<div class="file" data-wip="'+esc(p)+'">'+esc(line)+'</div>';}}
  midpad.innerHTML=h;
  midpad.querySelectorAll('.cmt[data-i]').forEach(el=>el.onclick=()=>selectCommit(r,+el.dataset.i));
  midpad.querySelectorAll('.file[data-wip]').forEach(el=>el.onclick=()=>vscode.postMessage({type:'diffWip',cwd:r.path,file:el.dataset.wip}));
  render();
  const el=left.querySelector('.row[data-path="'+CSS.escape(r.path)+'"]');
  if(el&&el.scrollIntoView) el.scrollIntoView({block:'nearest'});
}
function selectCommit(r,i){
  selCmt=i; const c=r.commits[i]; right.classList.add('open');
  midpad.querySelectorAll('.cmt[data-i]').forEach(el=>el.classList.toggle('sel',+el.dataset.i===i));
  const cached=fileCache[c.sha];
  let h='<h2>'+esc(c.short)+'</h2><div class="rbranch">'+esc(c.subj)+'</div>';
  if(!cached){ h+='<div class="loading"><span class="spin"></span> files…</div>'; vscode.postMessage({type:'reqFiles',sha:c.sha}); }
  else { h+='<div class="hint">'+cached.files.length+' file(s) — click to diff</div>';
    for(const fn of cached.files) h+='<div class="file" data-f="'+esc(fn)+'">'+esc(fn)+'</div>';
    if(cached.overflow) h+='<div class="file ovf">…+'+cached.overflow+' more</div>'; }
  rightpad.innerHTML=h;
  rightpad.querySelectorAll('.file[data-f]').forEach(el=>el.onclick=()=>vscode.postMessage({type:'diffCommit',sha:c.sha,file:el.dataset.f}));
  rightState={r,i,sha:c.sha};
}
let rightState=null;
function fellRow(r){ vscode.postMessage({type:'fell',name:r.name,path:r.path,branch:r.branch,sha:(r.commits[0]||{}).sha}); }
function diveRow(r){ if(r.kind==='worktree') vscode.postMessage({type:'dive',path:r.path,name:r.name}); }
function felled(path){
  const el=left.querySelector('.row[data-path="'+CSS.escape(path)+'"]');
  if(el){el.classList.add('falling');setTimeout(()=>el.remove(),480);}
  DATA.worktrees=DATA.worktrees.filter(r=>r.path!==path);
  if(selRowObj&&selRowObj.path===path){mid.classList.remove('open');right.classList.remove('open');selRow=null;selRowObj=null;}
  render();
}

// keyboard: j/k move · Space peek · Enter dive · f fell · / filter · Esc back
function moveCursor(d){
  if(!flat.length) return;
  cursor=Math.max(0,Math.min(flat.length-1,cursor<0?0:cursor+d));
  flat.forEach((x,i)=>x.el.classList.toggle('cursor',i===cursor));
  flat[cursor].el.scrollIntoView({block:'nearest'});
}
document.onkeydown=e=>{
  if(document.activeElement===q){ if(e.key==='Escape'){q.blur();} return; }
  if(e.key==='/'){ e.preventDefault(); q.focus(); return; }
  if(e.key==='j'||e.key==='ArrowDown'){ e.preventDefault(); moveCursor(1); return; }
  if(e.key==='k'||e.key==='ArrowUp'){ e.preventDefault(); moveCursor(-1); return; }
  const cur=cursor>=0?flat[cursor]:null;
  if(e.key==='Enter'&&cur){ e.preventDefault(); COMPACT?vscode.postMessage({type:'openFull'}):diveRow(cur.r); return; }
  if(e.key===' '&&cur){ e.preventDefault(); selectRow(cur.r,cur.gid+':'+cur.r.name); return; }
  if(e.key==='f'&&cur&&cur.gid==='w'){ e.preventDefault(); fellRow(cur.r); return; }
  if(e.key==='Escape'){ if(right.classList.contains('open')){right.classList.remove('open');selCmt=-1;} else{mid.classList.remove('open');selRow=null;selRowObj=null;render();} }
};
q.oninput=()=>render();

window.addEventListener('message',ev=>{const m=ev.data;
  if(m.type==='loading'){ loaded=false; render(); }
  else if(m.type==='error'){ loaded=true; left.innerHTML='<div class="empty">'+esc(m.message)+'</div>'; }
  else if(m.type==='data'){ DATA=m.fleet; loaded=true; render(); if(m.select) selectByPath(m.select); }
  else if(m.type==='worktrees'){ DATA.worktrees=m.worktrees; loaded=true; render(); if(m.select) selectByPath(m.select); }
  else if(m.type==='branches'){ DATA.branches=m.branches; render(); }
  else if(m.type==='select'){ selectByPath(m.path); }
  else if(m.type==='files'){ fileCache[m.sha]={files:m.files,overflow:m.overflow}; if(rightState&&rightState.sha===m.sha&&right.classList.contains('open')) selectCommit(rightState.r,rightState.i); }
  else if(m.type==='felled'){ felled(m.path); }
  else if(m.type==='restored'){ pendingRise=m.path; }});
vscode.postMessage({type:'ready'});
</script>
</body></html>`;
}
