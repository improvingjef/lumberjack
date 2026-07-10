// The webview: owns the glance (wrapping colored squares, three columns).
// It renders from data posted by the extension host and posts back
// open/diff intents — the real editor owns the content.

function nonce(): string {
  let s = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function fleetHtml(compact = false): string {
  const n = nonce();
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${n}';">
<style>
  :root{ --blue:#3b82f6; --red:#ef4444; --green:#22c55e; }
  *{box-sizing:border-box}
  body{margin:0;font:13px/1.4 var(--vscode-editor-font-family,ui-monospace,Menlo,monospace);
       color:var(--vscode-foreground);background:var(--vscode-editor-background)}
  .sq{display:inline-block;width:11px;height:11px;border-radius:2px;vertical-align:middle}
  .blue{background:var(--blue)} .red{background:var(--red)} .green{background:var(--green)}
  header{padding:8px 14px;border-bottom:1px solid var(--vscode-panel-border);
         display:flex;gap:14px;align-items:baseline;flex-wrap:wrap}
  header h1{font-size:13px;margin:0;font-weight:600}
  .legend{display:flex;gap:12px;opacity:.8;flex-wrap:wrap}
  .filter{margin-left:auto}
  .filter input{background:var(--vscode-input-background);color:var(--vscode-input-foreground);
    border:1px solid var(--vscode-input-border,transparent);border-radius:4px;padding:3px 7px;font:inherit;width:180px}
  button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);
    border:0;border-radius:4px;padding:3px 9px;font:inherit;cursor:pointer}
  .wrap{display:flex;height:calc(100vh - 40px)}
  .col{overflow:auto} .left{flex:1;padding:3px 0}
  .mid,.right{width:0;overflow:hidden;border-left:1px solid var(--vscode-panel-border);transition:width .12s ease}
  .mid.open{width:min(42vw,560px)} .right.open{width:min(30vw,420px)}
  .sectionhdr{padding:9px 14px 3px;opacity:.6;font-size:11px;text-transform:uppercase;
    letter-spacing:.05em;border-top:1px solid var(--vscode-panel-border);margin-top:5px}
  .row{display:flex;gap:12px;align-items:baseline;padding:4px 14px;cursor:pointer;border-left:3px solid transparent}
  .row:hover,.cmt:hover,.file:hover{background:var(--vscode-list-hoverBackground)}
  .row.sel{background:var(--vscode-list-activeSelectionBackground);border-left-color:var(--blue)}
  .nm{min-width:270px;max-width:270px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .sqs{display:flex;flex-wrap:wrap;gap:3px;align-content:flex-start;flex:1}
  .ovf{opacity:.6;font-size:11px;margin-left:4px}
  .pad{padding:12px 14px} .pad h2{font-size:13px;margin:0 0 2px}
  .rbranch{opacity:.65;margin-bottom:10px;word-break:break-all}
  .cmt{display:flex;gap:8px;padding:6px 8px;border-top:1px solid var(--vscode-panel-border);cursor:pointer;border-radius:4px}
  .cmt.sel{background:var(--vscode-list-activeSelectionBackground)}
  .cmt .sq{margin-top:3px;flex:none} .csha{opacity:.6;flex:none} .csub{flex:1;word-break:break-word}
  .file{padding:4px 6px;border-top:1px solid var(--vscode-panel-border);word-break:break-all;cursor:pointer;border-radius:4px}
  .wipbox{margin-top:12px;padding:9px;background:var(--vscode-list-hoverBackground);border-radius:6px}
  .wipbox h3{margin:0 0 6px;font-size:12px;color:var(--blue)}
  .wipfile{padding:2px 0;opacity:.85;cursor:pointer;word-break:break-all}
  .wipfile:hover{opacity:1;text-decoration:underline}
  .hint{opacity:.6;margin-bottom:8px}
  body[data-compact] .mid,body[data-compact] .right,body[data-compact] .legend{display:none}
  body[data-compact] .nm{min-width:0;max-width:none}
  body[data-compact] header{padding:6px 10px}
  body[data-compact] .filter{margin-left:0;flex:1} body[data-compact] .filter input{width:100%}
  .axe{opacity:0;cursor:pointer;margin-left:6px;flex:none;user-select:none;transition:opacity .1s}
  .row:hover .axe{opacity:.55} .axe:hover{opacity:1;transform:scale(1.15)}
  .row.falling{transform-origin:left bottom;
    transition:transform .5s cubic-bezier(.6,.04,.98,.34),opacity .5s ease-in;
    transform:translateY(48px) rotate(7deg);opacity:0;pointer-events:none}
  @keyframes ljrise{from{opacity:0;transform:translateY(-20px) scaleY(.5)}to{opacity:1;transform:none}}
  .row.rising{transform-origin:left bottom;animation:ljrise .42s cubic-bezier(.22,1,.36,1)}
</style></head>
<body${compact ? " data-compact" : ""}>
<header>
  <h1>🪓 worktree fleet</h1>
  <div class="legend">
    <span id="counts">…</span>
    <span><span class="sq blue"></span> WIP</span>
    <span><span class="sq red"></span> off master</span>
    <span><span class="sq green"></span> on master</span>
  </div>
  <div class="filter"><input id="q" placeholder="filter by name…"><button id="refresh">↻</button></div>
</header>
<div class="wrap">
  <div class="col left" id="left"><div class="pad hint">loading…</div></div>
  <div class="col mid" id="mid"><div class="pad" id="midpad"></div></div>
  <div class="col right" id="right"><div class="pad" id="rightpad"></div></div>
</div>
<script nonce="${n}">
const vscode = acquireVsCodeApi();
const COMPACT = ${compact};
let DATA = {worktrees:[],branches:[]};
let selRow=null, selCmt=-1, selRowObj=null, pendingRise=null;
const $=id=>document.getElementById(id);
const left=$('left'),mid=$('mid'),right=$('right'),midpad=$('midpad'),rightpad=$('rightpad'),q=$('q');

function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}

function squares(r){
  // always reserve the WIP slot (empty transparent square when clean) so the
  // commit squares line up in a column across every row
  let h = r.dirty ? '<span class="sq blue" title="uncommitted WIP"></span>' : '<span class="sq"></span>';
  for(const c of r.commits){const cls=c.onMaster?'green':'red';
    h+='<span class="sq '+cls+'" title="'+esc(c.short+' '+c.subj)+'"></span>';}
  if(r.overflow) h+='<span class="ovf">+'+r.overflow+'</span>';
  return h;
}
function rowEl(r,gid){
  const el=document.createElement('div'), id=gid+':'+r.name;
  el.className='row'+(selRow===id?' sel':'');
  el.dataset.path=r.path;
  const axe = gid==='w' ? '<span class="axe" title="fell (f)">🪓</span>' : '';
  el.innerHTML='<span class="nm" title="'+esc(r.name)+'">'+esc(r.name)+'</span><span class="sqs">'+squares(r)+'</span>'+axe;
  el.onclick=()=>selectRow(r,id);
  const axeEl=el.querySelector('.axe');
  if(axeEl) axeEl.onclick=(e)=>{e.stopPropagation();fellRow(r);};
  if(pendingRise===r.path){ el.classList.add('rising'); pendingRise=null; }
  return el;
}
function fellRow(r){
  vscode.postMessage({type:'fell',name:r.name,path:r.path,branch:r.branch,sha:(r.commits[0]||{}).sha});
}
function felled(path){
  const el=left.querySelector('.row[data-path="'+CSS.escape(path)+'"]');
  if(el){ el.classList.add('falling'); setTimeout(()=>el.remove(),480); }
  DATA.worktrees=DATA.worktrees.filter(r=>r.path!==path);
  if(selRowObj&&selRowObj.path===path){mid.classList.remove('open');right.classList.remove('open');selRow=null;selRowObj=null;}
  counts();
}
function draw(f){
  left.innerHTML='';
  DATA.worktrees.filter(r=>!f||r.name.toLowerCase().includes(f)).forEach(r=>left.appendChild(rowEl(r,'w')));
  const br=DATA.branches.filter(r=>!f||r.name.toLowerCase().includes(f));
  if(br.length){const hdr=document.createElement('div');hdr.className='sectionhdr';
    hdr.textContent='branches — no worktree ('+br.length+')';left.appendChild(hdr);
    br.forEach(r=>left.appendChild(rowEl(r,'b')));}
}
function selectRow(r,id){
  if(COMPACT){ selRow=id; selRowObj=r; draw(q.value.trim().toLowerCase()); vscode.postMessage({type:'openFull',name:r.name}); return; }
  selRow=id; selRowObj=r; selCmt=-1; q.blur(); mid.classList.add('open'); right.classList.remove('open');
  let h='<h2>'+esc(r.name)+'</h2><div class="rbranch">'+esc(r.branch)+'<br>'+esc(r.path)+'</div>';
  if(r.ahead) h+='<div class="rbranch" style="color:var(--red)">'+r.ahead+' commit(s) not on master</div>';
  h+='<div class="hint">'+r.commits.length+' commit(s) — click one to see its files</div>';
  r.commits.forEach((c,i)=>{const cls=c.onMaster?'green':'red';
    h+='<div class="cmt" data-i="'+i+'"><span class="sq '+cls+'"></span><span class="csha">'+esc(c.short)+'</span><span class="csub">'+esc(c.subj)+'</span></div>';});
  if(r.overflow) h+='<div class="cmt"><span class="csub ovf">…+'+r.overflow+' older</span></div>';
  if(r.dirty){h+='<div class="wipbox"><h3>WIP — uncommitted (click a file to diff)</h3>';
    for(const line of r.wip){const p=line.slice(3);
      h+='<div class="wipfile" data-wip="'+esc(p)+'">'+esc(line)+'</div>';}
    h+='</div>';}
  midpad.innerHTML=h;
  midpad.querySelectorAll('.cmt[data-i]').forEach(el=>el.onclick=()=>selectCommit(r,+el.dataset.i));
  midpad.querySelectorAll('.wipfile').forEach(el=>el.onclick=()=>
    vscode.postMessage({type:'diffWip',cwd:r.path,file:el.dataset.wip}));
  draw(q.value.trim().toLowerCase());
}
function selectCommit(r,i){
  selCmt=i; const c=r.commits[i]; right.classList.add('open');
  midpad.querySelectorAll('.cmt[data-i]').forEach(el=>el.classList.toggle('sel',+el.dataset.i===i));
  let h='<h2>'+esc(c.short)+'</h2><div class="rbranch">'+esc(c.subj)+'</div>';
  h+='<div class="hint">'+c.files.length+' file(s) changed — click to diff</div>';
  for(const fn of c.files) h+='<div class="file" data-f="'+esc(fn)+'">'+esc(fn)+'</div>';
  if(c.filesOverflow) h+='<div class="file ovf">…+'+c.filesOverflow+' more</div>';
  rightpad.innerHTML=h;
  rightpad.querySelectorAll('.file[data-f]').forEach(el=>el.onclick=()=>
    vscode.postMessage({type:'diffCommit',sha:c.sha,file:el.dataset.f}));
}
function counts(){
  const w=DATA.worktrees, dirty=w.filter(r=>r.dirty).length,
    ahead=w.filter(r=>r.ahead>0&&!r.dirty).length,
    clean=w.length-w.filter(r=>r.dirty||r.ahead>0).length;
  $('counts').textContent=w.length+' worktrees · '+DATA.branches.length+' loose · '+dirty+' dirty · '+ahead+' ahead · '+clean+' landed';
}
q.oninput=()=>draw(q.value.trim().toLowerCase());
$('refresh').onclick=()=>vscode.postMessage({type:'refresh'});
document.onkeydown=e=>{
  if(e.key==='Escape'){
    if(right.classList.contains('open')){right.classList.remove('open');selCmt=-1;}
    else{mid.classList.remove('open');selRow=null;selRowObj=null;draw(q.value.trim().toLowerCase());}
    return;
  }
  if(e.key==='f'&&document.activeElement!==q&&selRowObj&&selRow&&selRow[0]==='w'){ fellRow(selRowObj); }
};
window.addEventListener('message',ev=>{const m=ev.data;
  if(m.type==='loading'){left.innerHTML='<div class="pad hint">gathering fleet…</div>';}
  else if(m.type==='error'){left.innerHTML='<div class="pad hint">'+esc(m.message)+'</div>';}
  else if(m.type==='data'){DATA=m.fleet;counts();draw(q.value.trim().toLowerCase());}
  else if(m.type==='felled'){felled(m.path);}
  else if(m.type==='restored'){pendingRise=m.path;}});
vscode.postMessage({type:'ready'});
</script>
</body></html>`;
}
