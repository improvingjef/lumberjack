// The webview — the calm glance. Sedimented sections, a one-line summary, a
// disposable lens you raise, read, and drop. Renders from data the host posts
// (cache-first, then live) and posts back peek/dive/fell/diff intents.

import { randomBytes } from "crypto";

function nonce(): string {
  return randomBytes(24).toString("hex"); // CSPRNG, not Math.random
}

export function fleetHtml(compact = false): string {
  const AXE_URI = "data:image/png;base64,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";
  const n = nonce();
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${n}';">
<style>
  :root{ --blue:#3b82f6; --red:#ef4444; --green:#22c55e; --amber:#f59e0b; }
  *{box-sizing:border-box}
  body{margin:0;font:13px/1.45 var(--vscode-editor-font-family,ui-monospace,Menlo,monospace);
       color:var(--vscode-foreground);background:var(--vscode-editor-background);
       display:flex;flex-direction:column;height:100vh}
  .sq{display:inline-block;width:11px;height:11px;border-radius:2px;vertical-align:middle}
  .blue{background:var(--blue)} .red{background:var(--red)} .green{background:var(--green)}
  @keyframes breathe{0%,100%{opacity:1}50%{opacity:.55}}
  .sq.blue{animation:breathe 2.6s ease-in-out infinite}
  .axelogo{display:inline-block;width:1.05em;height:1.05em;vertical-align:-.15em;background:currentColor;-webkit-mask:url('${AXE_URI}') center/contain no-repeat;mask:url('${AXE_URI}') center/contain no-repeat}
  header{padding:9px 14px;border-bottom:1px solid var(--vscode-panel-border);display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  h1{font-size:13px;margin:0;font-weight:600;white-space:nowrap}
  .summary{opacity:.85;flex:1;min-width:120px}
  .summary b{font-weight:600} .summary .amberc{color:var(--amber)}
  .filter input{background:var(--vscode-input-background);color:var(--vscode-input-foreground);
    border:1px solid var(--vscode-input-border,transparent);border-radius:4px;padding:3px 7px;font:inherit;width:150px}
  .sortsel{background:var(--vscode-input-background);color:var(--vscode-input-foreground);
    border:1px solid var(--vscode-input-border,transparent);border-radius:4px;padding:3px 5px;font:inherit;cursor:pointer}
  body[data-compact] .sortsel{display:none}
  .batch{display:flex;gap:8px;align-items:center;padding:5px 14px;flex:none;flex-wrap:wrap;
    border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-editorWidget-background,transparent)}
  .batch b{font-variant-numeric:tabular-nums}
  .batch button{background:var(--vscode-button-background,#0e639c);color:var(--vscode-button-foreground,#fff);
    border:none;border-radius:4px;padding:2px 10px;font:inherit;cursor:pointer}
  .batch button:hover{opacity:.9}
  .ck{flex:none;margin:0;accent-color:var(--blue);cursor:pointer;align-self:center}
  .wrap{display:flex;flex:1;min-height:0}
  .col{overflow:auto} .leftcol{flex:1} #left{padding:2px 0}
  .mid,.right{width:0;overflow:hidden;border-left:1px solid var(--vscode-panel-border);transition:width .12s ease}
  .mid.open{width:min(42vw,560px)} .right.open{width:min(30vw,420px)}
  .mid.open,.right.open{overflow:auto}
  .collabel{position:sticky;top:0;z-index:2;background:var(--vscode-editor-background);padding:5px 14px 4px;
    font-size:11px;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;
    border-bottom:1px solid var(--vscode-panel-border);display:flex;gap:8px;align-items:center}
  .collabel .lbl{opacity:.72;overflow:hidden;text-overflow:ellipsis}
  .collabel input{flex:1;min-width:50px;width:50px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);
    border:1px solid var(--vscode-input-border,transparent);border-radius:4px;padding:1px 6px;font:inherit;
    text-transform:none;letter-spacing:normal}
  .subh{font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.72;margin:12px 0 4px}
  .subh:first-child{margin-top:0}
  /* focused: the sidebar handed off ONE worktree — give it the whole panel */
  .back{cursor:pointer;opacity:.6;user-select:none;white-space:nowrap} .back:hover{opacity:1}
  body[data-focused] .leftcol{display:none}
  body[data-focused] .mid{border-left:none}
  body[data-focused] .mid.open{width:auto;flex:1;max-width:none}
  body[data-compact] .mid,body[data-compact] .right{display:none}
  body[data-compact] .collabel{display:none}
  body[data-compact] .summary{flex-basis:100%;order:3} body[data-compact] .filter input{width:100%}
  .sect{margin-top:2px}
  .shdr{display:flex;gap:7px;align-items:center;padding:6px 14px 4px;cursor:pointer;opacity:.72;
        font-size:11px;text-transform:uppercase;letter-spacing:.05em;user-select:none}
  .shdr:hover{opacity:1} .shdr .chev{transition:transform .12s;display:inline-block;width:9px}
  .shdr.closed .chev{transform:rotate(-90deg)} .shdr .ct{opacity:.6;font-variant-numeric:tabular-nums}
  .shdr .dot{width:7px;height:7px;border-radius:2px;flex:none}
  .row{display:flex;gap:12px;align-items:baseline;padding:4px 14px;cursor:pointer;border-left:3px solid transparent;user-select:none}
  .row:hover,.cmt:hover,.file:hover{background:var(--vscode-list-hoverBackground)}
  .row.ticked{background:rgba(59,130,246,.16)}
  .row.ticked:hover{background:rgba(59,130,246,.24)}
  .cmt.ticked,.file.ticked{background:rgba(59,130,246,.16)}
  .ptick{flex:none;margin:2px 0 0;accent-color:var(--blue);cursor:pointer}
  .padact{background:var(--vscode-button-background,#0e639c);color:var(--vscode-button-foreground,#fff);
    border:none;border-radius:4px;padding:1px 8px;font:inherit;cursor:pointer;text-transform:none;letter-spacing:normal}
  .padact:hover{opacity:.9}
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
  .when{opacity:.55;font-size:11px;flex:none;margin-left:8px;font-variant-numeric:tabular-nums;white-space:nowrap}
  .dirhdr{opacity:.55;padding:7px 6px 2px;font-size:11px;word-break:break-all}
  .file.ind{padding-left:20px}
  .file .confwho{color:var(--red);opacity:.85;font-size:11px;margin-left:8px}
  .pvacts{margin-top:14px;display:flex;gap:8px;flex-wrap:wrap}
  .pvacts button{background:var(--vscode-button-background,#0e639c);color:var(--vscode-button-foreground,#fff);
    border:none;border-radius:4px;padding:4px 12px;font:inherit;cursor:pointer}
  .pvacts button:hover{opacity:.9}
  .pvacts .ghost{background:transparent;color:var(--vscode-foreground);border:1px solid var(--vscode-panel-border)}
  .file{padding:4px 6px;border-top:1px solid var(--vscode-panel-border);word-break:break-all;cursor:pointer;border-radius:4px}
  .hint{opacity:.6;margin-bottom:8px}
  .loading{padding:18px 16px;opacity:.7;display:flex;gap:9px;align-items:center}
  @keyframes spin{to{transform:rotate(360deg)}}
  .spin{width:13px;height:13px;border:2px solid var(--vscode-panel-border);border-top-color:var(--green);border-radius:50%;animation:spin .8s linear infinite}
  .empty{padding:16px 14px;opacity:.55}
</style></head>
<body${compact ? " data-compact" : ""}>
<header>
  <span id="back" class="back" hidden role="button" tabindex="0" aria-label="Back to the forest list">‹ forest</span>
  <h1><span class="axelogo" aria-hidden="true"></span> forest</h1>
  <span id="summary" class="summary">…</span>
  <span class="filter"><input id="q" placeholder="/ filter…" aria-label="Filter worktrees by name or branch"></span>
  <select id="sort" class="sortsel" aria-label="Sort worktrees">
    <option value="recent">sort: recent</option>
    <option value="name">sort: name</option>
    <option value="ahead">sort: unmerged</option>
    <option value="age">sort: oldest</option>
  </select>
</header>
<div id="batch" class="batch" hidden>
  <b id="batchn"></b>
  <button id="bland" title="land the selected — ff-merge each to the trunk">⬆ land</button>
  <button id="bsalv" title="salvage the selected worktrees' WIP → the review branch">💾 salvage</button>
  <button id="bfell" title="fell the selected worktrees">🪓 fell</button>
  <span id="bclear" class="back" role="button" tabindex="0">clear</span>
</div>
<div class="wrap">
  <div class="col leftcol"><div class="collabel"><span class="lbl">forest</span></div>
    <div id="left"><div class="loading"><span class="spin"></span> reading the stand…</div></div></div>
  <div class="col mid" id="mid"><div class="collabel"><span class="lbl" id="midlabel">tree</span>
    <button id="midact" class="padact" hidden></button>
    <input id="midq" placeholder="filter…" aria-label="Filter this tree's WIP files and commits"></div>
    <div class="pad" id="midpad"></div></div>
  <div class="col right" id="right"><div class="collabel"><span class="lbl" id="rightlabel">files</span>
    <button id="rightact" class="padact" hidden></button>
    <input id="rightq" placeholder="filter…" aria-label="Filter this commit's files"></div>
    <div class="pad" id="rightpad"></div></div>
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
const left=$('left'),mid=$('mid'),right=$('right'),midpad=$('midpad'),rightpad=$('rightpad'),q=$('q'),summary=$('summary'),back=$('back');
const sortsel=$('sort'),batch=$('batch'),batchn=$('batchn');
const midlabel=$('midlabel'),rightlabel=$('rightlabel'),midq=$('midq'),rightq=$('rightq');
const midact=$('midact'),rightact=$('rightact');
// tick wiring for the tree/files panes: the DOM is the selection state, the
// label bar grows one verb button; cmd-click toggles, shift-click ranges
function wireTicks(pad,btn,fmt){
  pad._last=null;
  const rows=[...pad.querySelectorAll('.tickrow')];
  const update=()=>{const n=pad.querySelectorAll('.ptick:checked').length; btn.hidden=!n; if(n) btn.textContent=fmt(n);};
  rows.forEach((row,i)=>{
    const t=row.querySelector('.ptick'); if(!t) return;
    t.onclick=e=>e.stopPropagation();
    t.onchange=()=>{ row.classList.toggle('ticked',t.checked); pad._last=i; update(); };
    const main=row.onclick;
    row.onclick=e=>{
      if(e&&(e.metaKey||e.ctrlKey)){ t.checked=!t.checked; t.onchange(); return; }
      if(e&&e.shiftKey&&pad._last!=null){
        for(let j=Math.min(pad._last,i);j<=Math.max(pad._last,i);j++){
          const tj=rows[j].querySelector('.ptick'); if(tj&&!tj.checked){ tj.checked=true; rows[j].classList.add('ticked'); } }
        pad._last=i; update(); return; }
      if(main) main(e);
    };
  });
  update();
}
midact.onclick=()=>{ if(selRowObj) showMultiFiles(selRowObj); };
rightact.onclick=()=>{ rightpad.querySelectorAll('.ptick:checked').forEach(t=>{
  const row=t.closest('.file'); if(!row) return;
  if(row.dataset.f&&row.dataset.sha) vscode.postMessage({type:'diffCommit',sha:row.dataset.sha,file:row.dataset.f});
  else if(row.dataset.wip&&row.dataset.cwd) vscode.postMessage({type:'openSource',cwd:row.dataset.cwd,file:row.dataset.wip}); }); };
// per-column live filters: hide non-matching rows in place, keep the DOM
const applyPadFilter=(pad,input)=>{const f=input.value.trim().toLowerCase();
  pad.querySelectorAll('.cmt,.file').forEach(el=>{el.hidden=!!f&&!el.textContent.toLowerCase().includes(f);});};
midq.oninput=()=>applyPadFilter(midpad,midq);
rightq.oninput=()=>applyPadFilter(rightpad,rightq);
let sortKey='recent';              // 'recent' (host order) | 'name' | 'ahead' | 'age'
const checked=new Set();           // worktree paths ticked for a batch verb
sortsel.onchange=()=>{sortKey=sortsel.value;render();};
const selTrees=()=>DATA.worktrees.filter(r=>checked.has(r.path)).map(r=>({path:r.path,branch:r.branch,name:r.name}));
// range selection: anchor is where a shift-range grows from; rangeBase snapshots
// the ticks before the drag so contracting the range restores them
let anchor=-1, rangeBase=null;
function syncChecks(){ flat.forEach(x=>{const on=checked.has(x.r.path);
  const c=x.el.querySelector('.ck'); if(c) c.checked=on; x.el.classList.toggle('ticked',on);}); updateBatch(); }
function rangeSelect(to){
  if(rangeBase===null){ rangeBase=new Set(checked); if(anchor<0) anchor=to; }
  checked.clear(); rangeBase.forEach(p=>checked.add(p));
  for(let i=Math.min(anchor,to);i<=Math.max(anchor,to);i++) if(flat[i].gid==='w') checked.add(flat[i].r.path);
  syncChecks();
}
function updateBatch(){ const n=checked.size; batch.hidden=!n; batchn.textContent=n+' selected'; }
// fell keeps the ticks — the host confirms via a modal the user may cancel;
// rows that actually fall are pruned by their 'felled' events instead
function postBatch(type){ const trees=selTrees(); if(!trees.length) return;
  vscode.postMessage({type,trees}); if(type!=='fellGroup'){ checked.clear(); render(); } }
$('bfell').onclick=()=>postBatch('fellGroup');
$('bland').onclick=()=>postBatch('landGroup');
$('bsalv').onclick=()=>postBatch('salvageGroup');
$('bclear').onclick=()=>{checked.clear();render();};
$('bclear').onkeydown=ev=>{ if(ev.key==='Enter'||ev.key===' '){ ev.preventDefault(); checked.clear(); render(); } };
function setFocus(on){ if(on) document.body.dataset.focused='';
  else { delete document.body.dataset.focused; vscode.postMessage({type:'title',name:null}); }
  back.hidden=!on; }
back.onclick=()=>setFocus(false);
back.onkeydown=ev=>{ if(ev.key==='Enter'||ev.key===' '){ ev.preventDefault(); setFocus(false); } };
// escape <>& AND quotes — esc() output lands inside "double-quoted" attributes
const esc=s=>{const d=document.createElement('div');d.textContent=s;return d.innerHTML.replace(/"/g,'&quot;').replace(/'/g,'&#39;');};
// unix seconds → compact relative age ("5m", "3h", "2d", "6w"); '' when unknown
function ago(sec){
  if(!sec) return '';
  const d=Math.max(0,Date.now()/1000-sec);
  if(d<3600) return Math.max(1,Math.floor(d/60))+'m';
  if(d<86400) return Math.floor(d/3600)+'h';
  if(d<86400*28) return Math.floor(d/86400)+'d';
  return Math.floor(d/86400/7)+'w';
}
const when=sec=>sec?'<span class="when" title="'+esc(new Date(sec*1000).toLocaleString())+'">'+ago(sec)+'</span>':'';

// grouping + aging are stamped on each row by the host (see core.ts) — the
// view carries no domain logic, it just reads r.group and r.amber.
function squares(r){
  // always reserve the WIP slot so commit squares line up in a column
  let h = r.dirty ? '<span class="sq blue" title="uncommitted WIP"></span>' : '<span class="sq"></span>';
  for(const c of r.commits){const cls=c.onMaster?'green':'red';
    h+='<span class="sq '+cls+'" title="'+esc(c.short+' '+c.subj)+(c.date?' · '+ago(c.date):'')+'"></span>';}
  if(r.overflow) h+='<span class="ovf">+'+r.overflow+'</span>';
  return h;
}
const groupLabel=g=>({needs:'needs you',wip:'uncommitted WIP',dead:'deadwood'}[g]||'branch');
function rowEl(r,gid){
  const el=document.createElement('div'), id=gid+':'+r.name;
  el.className='row'+(selRow===id?' sel':'')+(r.amber?' amber':'')+(checked.has(r.path)?' ticked':'');
  el.dataset.path=r.path;
  // a11y: rows are announced (meaning not by color alone) and keyboard-activatable
  el.setAttribute('role','button'); el.setAttribute('tabindex','0');
  el.setAttribute('aria-label', r.name+' — '+groupLabel(r.group)+(r.ahead?', '+r.ahead+' ahead':'')
    +(r.dirty?', uncommitted changes':'')+(r.amber?', aging '+Math.floor(r.age)+' days':'')+(r.claim?', claimed: '+r.claim:''));
  el.onkeydown=ev=>{ if(ev.key==='Enter'||ev.key===' '){ ev.preventDefault(); selectRow(r,id); } };
  const age = r.amber ? '<span class="agetag" title="untouched '+Math.floor(r.age)+' days">'+Math.floor(r.age)+'d</span>' : '';
  const claim = r.claim ? '<span class="claim" title="'+esc(r.claim)+'">📌</span>' : '';
  const acts = gid==='w' ? '<span class="acts">'
    + '<span class="act" data-a="open" title="open the worktree">↗</span>'
    + (r.group==='needs' ? '<span class="act" data-a="land" title="land — ff-merge to trunk">⬆</span>' : '')
    + (r.dirty ? '<span class="act" data-a="salvage" title="park WIP to the salvage branch">💾</span>' : '')
    + '<span class="act" data-a="fell" title="fell (f)">🪓</span>'
    + '</span>' : '';
  const ck = gid==='w' ? '<input type="checkbox" class="ck" aria-label="select '+esc(r.name)+' for a batch action">' : '';
  el.innerHTML=ck+'<span class="nm" title="'+esc(r.name)+'">'+esc(r.name)+'</span><span class="sqs">'+squares(r)+'</span>'+claim+age+acts;
  el.onclick=ev=>{
    const idx=flat.findIndex(x=>x.el===el);
    // cmd/ctrl-click toggles the tick; shift-click grows a range from the anchor
    if(gid==='w'&&(ev.metaKey||ev.ctrlKey)){
      if(checked.has(r.path)) checked.delete(r.path); else checked.add(r.path);
      anchor=idx; rangeBase=null; syncChecks(); return; }
    if(gid==='w'&&ev.shiftKey&&anchor>=0&&idx>=0){
      cursor=idx; flat.forEach((x,i)=>x.el.classList.toggle('cursor',i===cursor));
      rangeSelect(idx); return; }
    anchor=idx; rangeBase=null; selectRow(r,id);
  };
  const ckEl=el.querySelector('.ck');
  if(ckEl){ ckEl.checked=checked.has(r.path); ckEl.onclick=e=>e.stopPropagation();
    ckEl.onchange=()=>{ if(ckEl.checked) checked.add(r.path); else checked.delete(r.path);
      el.classList.toggle('ticked',ckEl.checked); updateBatch(); }; }
  const sqsEl=el.querySelector('.sqs');
  if(sqsEl){ const on=r.commits.filter(c=>c.onMaster).length; sqsEl.setAttribute('role','img');
    sqsEl.setAttribute('aria-label',(r.dirty?'uncommitted changes; ':'')+(r.commits.length-on)+' commits off trunk, '+on+' on trunk'); }
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
  const match=r=>!f||r.name.toLowerCase().includes(f)||(r.branch||'').toLowerCase().includes(f);
  // 'recent' keeps the host's newest-first order; the rest sort within each section
  const cmp={name:(a,b)=>a.name.localeCompare(b.name),
    ahead:(a,b)=>(b.ahead||0)-(a.ahead||0)||a.name.localeCompare(b.name),
    age:(a,b)=>(b.age||0)-(a.age||0)||a.name.localeCompare(b.name)}[sortKey];
  const order=rows=>cmp?rows.slice().sort(cmp):rows;
  for(const p of checked) if(!DATA.worktrees.some(r=>r.path===p)) checked.delete(p);
  const wt=order(DATA.worktrees.filter(match));
  const needs=wt.filter(r=>r.group==='needs');
  const wip=wt.filter(r=>r.group==='wip');
  const dead=wt.filter(r=>r.group==='dead');
  const br=order(DATA.branches.filter(match));
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
  updateBatch();
}

// host-driven select = the sidebar handed off THIS worktree → focus on it, not another fleet list
function selectByPath(p){ const r=DATA.worktrees.find(x=>x.path===p);
  if(r&&!COMPACT){ setFocus(true); selectRow(r,'w:'+r.name); vscode.postMessage({type:'title',name:r.name}); } }
function selectRow(r,id){
  if(COMPACT){ selRow=id; selRowObj=r; render(); vscode.postMessage({type:'openFull',name:r.name,path:r.path}); return; }
  selRow=id; selRowObj=r; selCmt=-1; q.blur();
  if(r.kind==='worktree'&&r.group) collapsed[r.group]=false; // reveal it in the left column
  mid.classList.add('open'); right.classList.remove('open');
  midlabel.textContent='tree · '+r.name;
  let h='<h2>'+esc(r.name)+'</h2><div class="rbranch">'+esc(r.branch)+'<br>'+esc(r.path)+'</div>';
  if(r.claim) h+='<div class="rbranch" style="color:var(--blue)">📌 '+esc(r.claim)+'</div>';
  if(r.ahead) h+='<div class="rbranch" style="color:var(--red)">'+r.ahead+' commit(s) not on the trunk</div>';
  h+='<div class="subh">'+(r.dirty?'wip + ':'')+'commits — '+(r.commits.length+(r.overflow||0))+' · Enter dives in · click one for its files</div>';
  // WIP rides the history as one pseudo-commit — its files live in the files view
  if(r.dirty){ const mt=(r.wipTimes||[]).reduce((a,b)=>Math.max(a,b||0),0);
    h+='<div class="cmt tickrow" data-wip-row="1" data-k="wip"><input type="checkbox" class="ptick" aria-label="tick WIP">'
      +'<span class="sq blue"></span><span class="csha">WIP</span><span class="csub">'+r.wip.length+' uncommitted file(s)</span>'+when(mt)+'</div>'; }
  r.commits.forEach((c,i)=>{const cls=c.onMaster?'green':'red';
    h+='<div class="cmt tickrow" data-i="'+i+'" data-k="'+i+'"><input type="checkbox" class="ptick" aria-label="tick commit '+esc(c.short)+'">'
      +'<span class="sq '+cls+'"></span><span class="csha">'+esc(c.short)+'</span><span class="csub">'+esc(c.subj)+'</span>'+when(c.date)+'</div>';});
  if(r.overflow) h+='<div class="cmt"><span class="csub ovf">…+'+r.overflow+' older</span></div>';
  midpad.innerHTML=h;
  midpad.querySelectorAll('.cmt[data-i]').forEach(el=>el.onclick=()=>selectCommit(r,+el.dataset.i));
  const wr=midpad.querySelector('.cmt[data-wip-row]'); if(wr) wr.onclick=()=>selectWip(r);
  wireTicks(midpad,midact,n=>'⧉ files of '+n);
  applyPadFilter(midpad,midq);
  render();
  const el=left.querySelector('.row[data-path="'+CSS.escape(r.path)+'"]');
  if(el&&el.scrollIntoView) el.scrollIntoView({block:'nearest'});
}
// the WIP pseudo-commit's files view: uncommitted files open as source, not a diff
function selectWip(r){
  selCmt=-1; rightState=null; right.classList.add('open');
  rightlabel.textContent='files · wip';
  midpad.querySelectorAll('.cmt[data-i]').forEach(el=>el.classList.remove('sel'));
  const wr=midpad.querySelector('.cmt[data-wip-row]'); if(wr) wr.classList.add('sel');
  let h='<h2>WIP</h2><div class="rbranch">'+esc(r.name)+' — uncommitted</div>'
    +'<div class="hint">'+r.wip.length+' file(s) — click to open</div>';
  r.wip.forEach((line,i)=>{const raw=line.slice(3); const p=raw.includes(' -> ')?raw.split(' -> ')[1]:raw;
    h+='<div class="file tickrow" data-wip="'+esc(p)+'" data-cwd="'+esc(r.path)+'"><input type="checkbox" class="ptick" aria-label="tick '+esc(p)+'">'+esc(line)+when((r.wipTimes||[])[i])+'</div>';});
  rightpad.innerHTML=h;
  rightpad.querySelectorAll('.file[data-wip]').forEach(el=>el.onclick=()=>vscode.postMessage({type:'openSource',cwd:r.path,file:el.dataset.wip}));
  wireTicks(rightpad,rightact,n=>'↗ open '+n);
  applyPadFilter(rightpad,rightq);
}
function selectCommit(r,i){
  selCmt=i; const c=r.commits[i]; right.classList.add('open');
  rightlabel.textContent='files · '+c.short;
  const wr=midpad.querySelector('.cmt[data-wip-row]'); if(wr) wr.classList.remove('sel');
  midpad.querySelectorAll('.cmt[data-i]').forEach(el=>el.classList.toggle('sel',+el.dataset.i===i));
  const cached=fileCache[c.sha];
  let h='<h2>'+esc(c.short)+'</h2><div class="rbranch">'+esc(c.subj)+'</div>';
  if(!cached){ h+='<div class="loading"><span class="spin"></span> files…</div>'; vscode.postMessage({type:'reqFiles',sha:c.sha}); }
  else { h+='<div class="hint">'+cached.files.length+' file(s) — click to diff</div>';
    for(const fn of cached.files) h+='<div class="file tickrow" data-f="'+esc(fn)+'" data-sha="'+esc(c.sha)+'"><input type="checkbox" class="ptick" aria-label="tick '+esc(fn)+'">'+esc(fn)+when(c.date)+'</div>';
    if(cached.overflow) h+='<div class="file ovf">…+'+cached.overflow+' more</div>'; }
  rightpad.innerHTML=h;
  rightpad.querySelectorAll('.file[data-f]').forEach(el=>el.onclick=()=>vscode.postMessage({type:'diffCommit',sha:c.sha,file:el.dataset.f}));
  wireTicks(rightpad,rightact,n=>'↗ open '+n);
  applyPadFilter(rightpad,rightq);
  rightState={r,i,sha:c.sha};
}
// several ticked commits (and/or WIP) → one files view, sectioned per pick
function showMultiFiles(r){
  const ks=[...midpad.querySelectorAll('.ptick:checked')].map(t=>{const row=t.closest('.cmt');return row?row.dataset.k:null;}).filter(k=>k!=null);
  if(!ks.length) return;
  selCmt=-1; right.classList.add('open');
  rightlabel.textContent='files · '+ks.length+' ticked';
  midpad.querySelectorAll('.cmt').forEach(el=>el.classList.remove('sel'));
  let h='';const missing=[];
  for(const k of ks){
    if(k==='wip'){
      h+='<div class="subh" style="color:var(--blue)">wip — '+r.wip.length+' file(s)</div>';
      r.wip.forEach((line,i)=>{const raw=line.slice(3);const p=raw.includes(' -> ')?raw.split(' -> ')[1]:raw;
        h+='<div class="file tickrow" data-wip="'+esc(p)+'" data-cwd="'+esc(r.path)+'"><input type="checkbox" class="ptick" aria-label="tick '+esc(p)+'">'+esc(line)+when((r.wipTimes||[])[i])+'</div>';});
    } else { const c=r.commits[+k]; if(!c) continue;
      h+='<div class="subh">'+esc(c.short)+' — '+esc(c.subj)+'</div>';
      const cached=fileCache[c.sha];
      if(!cached){ missing.push(c.sha); h+='<div class="loading"><span class="spin"></span> files…</div>'; }
      else { cached.files.forEach(fn=>{h+='<div class="file tickrow" data-f="'+esc(fn)+'" data-sha="'+esc(c.sha)+'"><input type="checkbox" class="ptick" aria-label="tick '+esc(fn)+'">'+esc(fn)+when(c.date)+'</div>';});
        if(cached.overflow) h+='<div class="file ovf">…+'+cached.overflow+' more</div>'; }
    }
  }
  rightpad.innerHTML=h;
  rightpad.querySelectorAll('.file[data-f]').forEach(el=>el.onclick=()=>vscode.postMessage({type:'diffCommit',sha:el.dataset.sha,file:el.dataset.f}));
  rightpad.querySelectorAll('.file[data-wip]').forEach(el=>el.onclick=()=>vscode.postMessage({type:'openSource',cwd:el.dataset.cwd,file:el.dataset.wip}));
  wireTicks(rightpad,rightact,n=>'↗ open '+n);
  applyPadFilter(rightpad,rightq);
  missing.forEach(sha=>vscode.postMessage({type:'reqFiles',sha}));
  rightState={multi:true,r,shas:missing.slice()};
}
let rightState=null;
// The salvage stopped at the door: real conflicts. Show the folder/file tree,
// badge each collision with WHO it collides with, and let confirm commit
// anyway (markers embedded) or cancel (nothing written, worktree untouched).
const wipPathOf=l=>{const raw=l.slice(3);return raw.includes(' -> ')?raw.split(' -> ')[1]:raw;};
function showSalvagePreview(m){
  const r=DATA.worktrees.find(x=>x.path===m.path);
  if(r){ selRow='w:'+r.name; selRowObj=r; }
  mid.classList.add('open'); right.classList.remove('open');
  midlabel.textContent='salvage · '+m.name;
  const conf=new Set(m.conflicts);
  const othersWith=f=>DATA.worktrees.filter(w=>w.path!==m.path&&(w.wip||[]).some(l=>wipPathOf(l)===f)).map(w=>w.name);
  let h='<h2>💾 salvage '+esc(m.name)+'</h2>'
    +'<div class="rbranch">'+m.files.length+' file(s) → '+esc(m.branch)
    +' · <span style="color:var(--red)">'+conf.size+' conflict(s)</span></div>'
    +'<div class="hint">red files collide on '+esc(m.branch)+' — confirm commits them with conflict markers</div>';
  const byDir={};
  for(const f of m.files){const i=f.lastIndexOf('/');(byDir[i<0?'':f.slice(0,i)]??=[]).push(f);}
  for(const d of Object.keys(byDir).sort()){
    if(d) h+='<div class="dirhdr">'+esc(d)+'/</div>';
    for(const f of byDir[d].sort()){
      const nm=d?f.slice(d.length+1):f;
      let who='';
      if(conf.has(f)){const o=othersWith(f); who='<span class="confwho">⚠ '+(o.length?'also WIP in '+esc(o.join(', ')):'vs '+esc(m.branch)+' tip')+'</span>';}
      h+='<div class="file'+(d?' ind':'')+'" data-wip="'+esc(f)+'">'+esc(nm)+who+'</div>';
    }
  }
  h+='<div class="pvacts"><button id="pvgo">salvage with markers</button><button id="pvno" class="ghost">cancel</button></div>';
  midpad.innerHTML=h;
  midpad.querySelectorAll('.file[data-wip]').forEach(el=>el.onclick=()=>vscode.postMessage({type:'openSource',cwd:m.path,file:el.dataset.wip}));
  $('pvgo').onclick=()=>{ vscode.postMessage({type:'salvage',path:m.path,name:m.name,force:true}); if(r) selectRow(r,'w:'+r.name); else {mid.classList.remove('open');selRow=null;selRowObj=null;render();} };
  $('pvno').onclick=()=>{ if(r) selectRow(r,'w:'+r.name); else {mid.classList.remove('open');selRow=null;selRowObj=null;render();} };
  render();
}
function fellRow(r){ vscode.postMessage({type:'fell',name:r.name,path:r.path,branch:r.branch,sha:(r.commits[0]||{}).sha}); }
function diveRow(r){ if(r.kind==='worktree') vscode.postMessage({type:'dive',path:r.path,name:r.name}); }
function felled(path){
  const el=left.querySelector('.row[data-path="'+CSS.escape(path)+'"]');
  if(el){el.classList.add('falling');setTimeout(()=>el.remove(),480);}
  DATA.worktrees=DATA.worktrees.filter(r=>r.path!==path);
  checked.delete(path);
  if(selRowObj&&selRowObj.path===path){mid.classList.remove('open');right.classList.remove('open');selRow=null;selRowObj=null;setFocus(false);}
  render();
}

// keyboard: j/k move · Space peek · Enter dive · f fell · x tick · / filter · Esc back
function moveCursor(d,ranged){
  if(!flat.length) return;
  cursor=Math.max(0,Math.min(flat.length-1,cursor<0?0:cursor+d));
  flat.forEach((x,i)=>x.el.classList.toggle('cursor',i===cursor));
  if(ranged) rangeSelect(cursor);
  else { anchor=cursor; rangeBase=null; }
  if(flat[cursor].el.scrollIntoView) flat[cursor].el.scrollIntoView({block:'nearest'});
}
document.onkeydown=e=>{
  // any focused text control owns the keys (the column filters too) — Esc just blurs it
  const ae=document.activeElement;
  if(ae&&(ae.tagName==='SELECT'||(ae.tagName==='INPUT'&&ae.type!=='checkbox'))){ if(e.key==='Escape') ae.blur(); return; }
  if(e.key==='/'){ e.preventDefault(); q.focus(); return; }
  // shift+arrow (or shift+j/k) grows/shrinks the ticked range from the anchor
  if(e.shiftKey&&(e.key==='ArrowDown'||e.key==='J')){ e.preventDefault(); moveCursor(1,true); return; }
  if(e.shiftKey&&(e.key==='ArrowUp'||e.key==='K')){ e.preventDefault(); moveCursor(-1,true); return; }
  if(e.key==='j'||e.key==='ArrowDown'){ e.preventDefault(); moveCursor(1); return; }
  if(e.key==='k'||e.key==='ArrowUp'){ e.preventDefault(); moveCursor(-1); return; }
  const cur=cursor>=0?flat[cursor]:null;
  if(e.key==='Enter'&&cur){ e.preventDefault(); COMPACT?vscode.postMessage({type:'openFull',name:cur.r.name,path:cur.r.path}):diveRow(cur.r); return; }
  if(e.key===' '&&cur){ e.preventDefault(); selectRow(cur.r,cur.gid+':'+cur.r.name); return; }
  if(e.key==='f'&&cur&&cur.gid==='w'){ e.preventDefault(); fellRow(cur.r); return; }
  // x ticks the cursor row for a batch verb — toggle in place so the cursor survives
  if(e.key==='x'&&cur&&cur.gid==='w'){ e.preventDefault(); anchor=cursor; rangeBase=null;
    const ck=cur.el.querySelector('.ck'); if(ck){ ck.checked=!ck.checked; ck.onchange(); } return; }
  if(e.key==='Escape'){ if(right.classList.contains('open')){right.classList.remove('open');selCmt=-1;}
    else if('focused' in document.body.dataset){ setFocus(false); }
    else{mid.classList.remove('open');selRow=null;selRowObj=null;render();} }
};
q.oninput=()=>render();

window.addEventListener('message',ev=>{const m=ev.data;
  if(m.type==='loading'){ loaded=false; render(); }
  else if(m.type==='error'){ loaded=true; left.innerHTML='<div class="empty">'+esc(m.message)+'</div>'; }
  else if(m.type==='data'){ DATA=m.fleet; loaded=true; render(); if(m.select) selectByPath(m.select); }
  else if(m.type==='worktrees'){ DATA.worktrees=m.worktrees; loaded=true; render(); if(m.select) selectByPath(m.select); }
  else if(m.type==='branches'){ DATA.branches=m.branches; render(); }
  else if(m.type==='select'){ selectByPath(m.path); }
  else if(m.type==='files'){ fileCache[m.sha]={files:m.files,overflow:m.overflow};
    if(rightState&&rightState.multi&&(rightState.shas||[]).includes(m.sha)&&right.classList.contains('open')) showMultiFiles(rightState.r);
    else if(rightState&&rightState.sha===m.sha&&right.classList.contains('open')) selectCommit(rightState.r,rightState.i); }
  else if(m.type==='felled'){ felled(m.path); }
  else if(m.type==='salvagePreview'){ showSalvagePreview(m); }
  else if(m.type==='restored'){ pendingRise=m.path; }});
vscode.postMessage({type:'ready'});
</script>
</body></html>`;
}
