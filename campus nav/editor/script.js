const $=id=>document.getElementById(id),esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const TYPES=['corridor','junction','stairs','entrance'],COL={corridor:'#2f7bff',junction:'#a855f7',stairs:'#f59e0b',entrance:'#10b981'};
const HINT={select:'Drag waypoints to move them · drag empty space to pan · scroll to zoom',add:'Click the map to place a waypoint',connect:'Click a waypoint, then another, to link them (keeps chaining)',delete:'Click a waypoint or a line to remove it'};
const start=()=>({campus:'Main Campus',qrBase:'',floors:[{floor:1,name:'Ground Floor',northOffset:0,
 nodes:[{id:'f1S',x:0,y:0,type:'stairs',label:'Stairs landing',qr:true,group:'Stairs A'},{id:'f1A',x:12,y:0,type:'corridor',label:'Corridor A',qr:false,group:''},{id:'f1B',x:24,y:0,type:'junction',label:'Corridor junction',qr:true,group:''}],
 edges:[['f1S','f1A'],['f1A','f1B']],rooms:[{id:'101',name:'Registrar Office',node:'f1A'}]}]});
let S=start(),cur=0,sel=null,tool='select',conn=null,hist=[],view={s:14,ox:80,oy:300},drag=null,ptr=null,armDel=false;
try{const r=JSON.parse(localStorage.getItem('campus-editor')||'null');if(r&&r.floors&&r.floors.length)S=r}catch(e){}
const cv=$('cv'),ctx=cv.getContext('2d'),dpr=devicePixelRatio||1;
const F=()=>S.floors[cur],node=id=>F().nodes.find(n=>n.id===id),allN=()=>S.floors.flatMap(f=>f.nodes);
/* QR payload. With a link base set, stickers hold an https link any phone camera can open; otherwise the in-app campus:// form.
   Optional face = the direction (plan degrees, 0 = up the screen) a person faces while scanning; the navigator uses it to re-zero compass drift. */
const qrBase=()=>String(S.qrBase||'').trim(),hasFace=n=>n.face!==''&&n.face!=null&&isFinite(+n.face);
const payload=(f,n)=>{const h=hasFace(n)?+n.face:null,b=qrBase();
 if(b)return b+(b.includes('?')?'&':'?')+'q=F'+f.floor+'/'+n.id+(h!==null?'&h='+h:'');
 return`campus://F${f.floor}/${n.id}`+(h!==null?'?h='+h:'')};
const wx=p=>(p-view.ox)/view.s,wy=p=>(view.oy-p)/view.s,sx=x=>view.ox+x*view.s,sy=y=>view.oy-y*view.s;
const sn=v=>$('snap').checked?Math.round(v*2)/2:Math.round(v*100)/100;
function toast(t){const e=$('toast');e.textContent=t;e.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>e.hidden=true,3500)}
const push=()=>{hist.push(JSON.stringify(S));if(hist.length>60)hist.shift()};
const save=()=>{try{localStorage.setItem('campus-editor',JSON.stringify(S))}catch(e){}};
function commit(){save();renderFloors();renderSide();draw()}
function undo(){if(!hist.length)return toast('Nothing to undo');S=JSON.parse(hist.pop());cur=Math.min(cur,S.floors.length-1);if(!node(sel))sel=null;commit()}
function delNode(n){const f=F();f.nodes=f.nodes.filter(m=>m!==n);f.edges=f.edges.filter(([a,b])=>a!==n.id&&b!==n.id);f.rooms=f.rooms.filter(r=>r.node!==n.id);if(sel===n.id)sel=null;if(conn===n.id)conn=null}
function newId(){const f=F();let k=1;while(allN().some(n=>n.id===`f${f.floor}n${k}`))k++;return`f${f.floor}n${k}`}

/* ---------- canvas ---------- */
function resize(){cv.width=cv.clientWidth*dpr;cv.height=cv.clientHeight*dpr;draw()}
new ResizeObserver(resize).observe($('stage'));
function draw(){const W=cv.clientWidth,H=cv.clientHeight,x=ctx,cs=getComputedStyle(document.documentElement),g=k=>cs.getPropertyValue(k).trim(),f=F(),s=view.s;
 x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,W,H);const step=s<8?5:1;x.lineWidth=1;
 const gl=(a,b,c,d,col)=>{x.strokeStyle=col;x.beginPath();x.moveTo(a,b);x.lineTo(c,d);x.stroke()},c1=g('--grid'),c2=g('--grid2');
 for(let v=Math.floor(wx(0)/step)*step;v<=wx(W);v+=step)gl(sx(v),0,sx(v),H,v%5===0?c2:c1);
 for(let v=Math.floor(wy(H)/step)*step;v<=wy(0);v+=step)gl(0,sy(v),W,sy(v),v%5===0?c2:c1);
 x.textAlign='center';x.font='600 11px system-ui';
 f.edges.forEach(([a,b])=>{const A=node(a),B=node(b);if(!A||!B)return;x.strokeStyle=g('--ac');x.globalAlpha=.55;x.lineWidth=5;x.lineCap='round';x.beginPath();x.moveTo(sx(A.x),sy(A.y));x.lineTo(sx(B.x),sy(B.y));x.stroke();x.globalAlpha=1;
  if(s>=9){x.fillStyle=g('--mut');x.fillText(Math.hypot(A.x-B.x,A.y-B.y).toFixed(1)+' m',(sx(A.x)+sx(B.x))/2,(sy(A.y)+sy(B.y))/2-8)}});
 if(conn&&ptr&&node(conn)){const A=node(conn);x.setLineDash([6,5]);x.strokeStyle=g('--ac');x.lineWidth=2;x.beginPath();x.moveTo(sx(A.x),sy(A.y));x.lineTo(ptr[0],ptr[1]);x.stroke();x.setLineDash([])}
 f.nodes.forEach(n=>{const X=sx(n.x),Y=sy(n.y);x.beginPath();x.arc(X,Y,9,0,7);x.fillStyle=COL[n.type]||COL.corridor;x.fill();
  x.lineWidth=n.id===sel?4:2;x.strokeStyle=n.id===sel?g('--tx'):(n.qr?'#16a34a':'#fff');x.stroke();
  x.fillStyle=g('--tx');x.font='600 12px system-ui';x.fillText(n.label||n.id,X,Y-16);
  const rs=f.rooms.filter(r=>r.node===n.id).map(r=>r.id).join(', ');if(rs){x.fillStyle=COL.junction;x.fillText('🚪 '+rs,X,Y+26)}
  if(n.qr){x.fillStyle='#16a34a';x.font='700 9px system-ui';x.fillText('QR',X,Y+3)}
  if(n.type==='stairs'&&n.group){x.fillStyle=COL.stairs;x.font='600 11px system-ui';x.fillText('⇅ '+n.group,X,Y+(rs?40:26))}})}
cv.onpointerdown=e=>{cv.setPointerCapture(e.pointerId);const px=e.offsetX,py=e.offsetY,n=hitN(px,py),f=F();
 if(tool==='add'){if(!n){push();const id=newId();f.nodes.push({id,x:sn(wx(px)),y:sn(wy(py)),type:'corridor',label:'',qr:false,group:''});sel=id;commit()}return}
 if(tool==='connect'){if(n){if(conn&&conn!==n.id&&!f.edges.some(([a,b])=>(a===conn&&b===n.id)||(a===n.id&&b===conn))){push();f.edges.push([conn,n.id])}conn=n.id;sel=n.id;commit()}else{conn=null;draw()}return}
 if(tool==='delete'){if(n){push();delNode(n);commit()}else{const ed=hitE(px,py);if(ed){push();f.edges=f.edges.filter(q=>q!==ed);commit()}}return}
 if(n){sel=n.id;drag={n,moved:false}}else{sel=null;drag={pan:1,x:e.clientX,y:e.clientY,ox:view.ox,oy:view.oy}}renderSide();draw()};
cv.onpointermove=e=>{ptr=[e.offsetX,e.offsetY];if(drag){if(drag.pan){view.ox=drag.ox+e.clientX-drag.x;view.oy=drag.oy+e.clientY-drag.y}else{if(!drag.moved){push();drag.moved=true}drag.n.x=sn(wx(e.offsetX));drag.n.y=sn(wy(e.offsetY))}}if(drag||conn)draw()};
cv.onpointerup=()=>{if(drag&&drag.moved){save();renderSide()}drag=null};
cv.onwheel=e=>{e.preventDefault();zoom(e.deltaY<0?1.15:1/1.15,e.offsetX,e.offsetY)};
function zoom(k,px=cv.clientWidth/2,py=cv.clientHeight/2){const ns=Math.max(3,Math.min(60,view.s*k));view.ox=px-(px-view.ox)*ns/view.s;view.oy=py-(py-view.oy)*ns/view.s;view.s=ns;draw()}
const hitN=(px,py)=>F().nodes.find(n=>Math.hypot(sx(n.x)-px,sy(n.y)-py)<=13);
const hitE=(px,py)=>F().edges.find(([a,b])=>{const A=node(a),B=node(b);if(!A||!B)return false;const ax=sx(A.x),ay=sy(A.y),dx=sx(B.x)-ax,dy=sy(B.y)-ay,t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(ax+t*dx-px,ay+t*dy-py)<8});
function fit(){const ns=F().nodes,W=cv.clientWidth,H=cv.clientHeight;if(!ns.length)return draw();const xs=ns.map(n=>n.x),ys=ns.map(n=>n.y),x0=Math.min(...xs),y0=Math.min(...ys),w=Math.max(...xs)-x0||10,h=Math.max(...ys)-y0||10;
 view.s=Math.max(3,Math.min(40,(W-160)/w,(H-160)/h));view.ox=W/2-(x0+w/2)*view.s;view.oy=H/2+(y0+h/2)*view.s;draw()}

/* ---------- panels ---------- */
function renderFloors(){$('floors').innerHTML=S.floors.map((f,i)=>`<button class="${i===cur?'on':''}" data-i="${i}">${esc(f.name)}</button>`).join('')+'<button data-add="1">＋ Floor (copies layout)</button>'}
$('floors').onclick=e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.add){push();const p=F(),n=Math.max(...S.floors.map(f=>f.floor))+1,m={};p.nodes.forEach(o=>{const id=o.id.replace(/^f\d+/,'f'+n);m[o.id]=id===o.id?o.id+'_'+n:id});
  S.floors.push({floor:n,name:'Floor '+n,northOffset:p.northOffset,nodes:p.nodes.map(o=>({...o,id:m[o.id]})),edges:p.edges.map(([a,c])=>[m[a],m[c]]),rooms:[]});cur=S.floors.length-1;sel=null;commit();fit();toast('Floor '+n+' added with the previous layout')}
 else{cur=+b.dataset.i;sel=null;conn=null;armDel=false;commit();fit()}};
function checks(){const w=[];S.floors.forEach(f=>{const adj={};f.nodes.forEach(n=>adj[n.id]=[]);f.edges.forEach(([a,b])=>{if(adj[a]&&adj[b]){adj[a].push(b);adj[b].push(a)}});
 const seen=new Set();let c=0;f.nodes.forEach(n=>{if(seen.has(n.id))return;c++;const st=[n.id];while(st.length){const u=st.pop();if(seen.has(u))continue;seen.add(u);adj[u].forEach(v=>st.push(v))}});
 if(c>1)w.push(`${f.name}: ${c} disconnected pieces`);if(!f.nodes.some(n=>n.qr))w.push(`${f.name}: no QR waypoint`);
 f.nodes.filter(n=>n.type==='stairs'&&!n.qr).forEach(n=>w.push(`${f.name}: stairs "${n.label||n.id}" has no QR sticker (people scan there after changing floors)`));const ids=f.rooms.map(r=>r.id);if(ids.some((id,i)=>!id||ids.indexOf(id)!==i))w.push(`${f.name}: empty or duplicate room number`)});
 if(S.floors.length>1&&!build().connectors.length)w.push('Floors not linked: give stairs the same group name on each floor');return w}
function renderSide(){const f=F(),n=node(sel),rs=n?f.rooms.filter(r=>r.node===n.id):[],w=checks();
 let h=`<h3>Floor</h3><div class="g"><label>Name<input data-a="f-name" value="${esc(f.name)}"></label><label>North offset °<input type="number" data-a="f-north" value="${f.northOffset}"></label></div>
 <p class="mut" style="margin:0 0 6px">The top of the plan points to compass bearing = north offset.</p>
 ${S.floors.length>1?`<button data-a="f-del">${armDel?'Click again to delete this floor':'Delete floor'}</button>`:''}`;
 if(n){const p=payload(f,n);let qi='';if(n.qr&&window.qrcode){const q=qrcode(0,'M');q.addData(p);q.make();qi=`<img class="qr" src="${q.createDataURL(4,2)}" alt="QR"><code>${esc(p)}</code>`}
  h+=`<h3>Waypoint</h3><label>ID (letters, numbers, _)<input data-a="n-id" value="${esc(n.id)}"></label><label>Label<input data-a="n-label" value="${esc(n.label)}"></label>
  <div class="g"><label>Type<select data-a="n-type">${TYPES.map(t=>`<option${t===n.type?' selected':''}>${t}</option>`).join('')}</select></label><label>QR sticker<br><input type="checkbox" data-a="n-qr"${n.qr?' checked':''}></label></div>
  <div class="g"><label>X (m)<input type="number" step="0.5" data-a="n-x" value="${n.x}"></label><label>Y (m)<input type="number" step="0.5" data-a="n-y" value="${n.y}"></label></div>
  ${n.qr?`<label>Facing when scanning, plan ° (optional; 0 = up the screen, 90 = right)<input type="number" step="1" data-a="n-face" value="${esc(n.face)}"></label>`:''}${n.type==='stairs'?`<label>Stairs group — same name on every floor links them<input data-a="n-group" value="${esc(n.group)}"></label>`:''}${qi}
  <h3>Rooms at this waypoint</h3>${rs.map((r,i)=>`<div class="r"><input data-a="r-id" data-i="${i}" value="${esc(r.id)}" placeholder="No."><input data-a="r-name" data-i="${i}" value="${esc(r.name)}" placeholder="Name"><button data-a="r-del" data-i="${i}">✕</button></div>`).join('')}<button data-a="r-add">＋ Add room</button>`}
 else h+='<h3>Waypoint</h3><p class="mut">Select a waypoint to edit it. Use ＋ Waypoint to place new ones and 🔗 Connect to link them.</p>';
 h+=`<h3>Checks</h3>${w.length?w.map(t=>`<div class="warn">⚠ ${esc(t)}</div>`).join(''):'<div class="ok">✓ Everything looks good</div>'}`;$('side').innerHTML=h}
$('side').onchange=e=>{const t=e.target,a=t.dataset.a;if(!a)return;push();const f=F(),n=node(sel),v=t.type==='checkbox'?t.checked:t.value;
 if(a==='f-name')f.name=v;else if(a==='f-north')f.northOffset=+v||0;
 else if(a==='r-id'||a==='r-name'){const r=f.rooms.filter(r=>r.node===sel)[+t.dataset.i];if(r)r[a==='r-id'?'id':'name']=v.trim()}
 else if(n){if(a==='n-id'){const id=v.trim();if(!/^\w+$/.test(id)||allN().some(m=>m!==n&&m.id===id)){hist.pop();toast('ID must be unique: letters, numbers, _');return renderSide()}
   f.edges.forEach(q=>{if(q[0]===n.id)q[0]=id;if(q[1]===n.id)q[1]=id});f.rooms.forEach(r=>{if(r.node===n.id)r.node=id});if(sel===n.id)sel=id;n.id=id}
  else if(a==='n-label')n.label=v;else if(a==='n-type')n.type=v;else if(a==='n-qr')n.qr=v;else if(a==='n-group')n.group=v.trim();else if(a==='n-face')n.face=(v===''||!isFinite(+v))?'':((+v%360)+360)%360;else if(a==='n-x')n.x=+v||0;else if(a==='n-y')n.y=+v||0}
 commit()};
$('side').onclick=e=>{const b=e.target.closest('button');if(!b||!b.dataset.a)return;const a=b.dataset.a,f=F();
 if(a==='r-add'){push();f.rooms.push({id:'',name:'',node:sel});commit()}
 else if(a==='r-del'){push();const r=f.rooms.filter(r=>r.node===sel)[+b.dataset.i];f.rooms=f.rooms.filter(q=>q!==r);commit()}
 else if(a==='f-del'){if(!armDel){armDel=true;return renderSide()}push();S.floors.splice(cur,1);cur=Math.max(0,cur-1);sel=null;armDel=false;commit();fit()}};

/* ---------- export / import ---------- */
function build(){const floors=S.floors.map(f=>({floor:f.floor,name:f.name,northOffset:+f.northOffset||0,
  nodes:f.nodes.map(n=>({id:n.id,x:n.x,y:n.y,type:n.type,label:n.label})),edges:f.edges,rooms:f.rooms.filter(r=>r.id),
  qr:f.nodes.filter(n=>n.qr).map(n=>({node:n.id,payload:payload(f,n),label:`${f.name} - ${n.label||n.id}`,...(hasFace(n)?{heading:+n.face}:{})}))})),g={};
 S.floors.forEach(f=>f.nodes.forEach(n=>{if(n.group)(g[n.group]=g[n.group]||[]).push([f.floor,n.id])}));
 const connectors=Object.entries(g).filter(([,a])=>a.length>1).map(([name,a])=>({type:'stairs',name,nodes:a.sort((p,q)=>p[0]-q[0]).map(v=>v[1]),cost:15}));
 return{schema:'campus-nav/1',campus:{name:S.campus,units:'meters',...(qrBase()?{qrBase:qrBase()}:{}),coordinates:'x = east, y = north on each floor plan; floor.northOffset (deg) rotates the plan to true compass north',qrFormat:'campus://F<floor>/<nodeId>'},floors,connectors}}
function saveFile(name,data){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data]));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000)}
$('exj').onclick=()=>{const w=checks();if(w.length)toast('Exported with '+w.length+' warning(s) — see Checks');saveFile('campus-db.json',JSON.stringify(build(),null,2))};
$('exq').onclick=()=>{const J=window.jspdf;if(!J||!window.qrcode)return toast('Libraries still loading…');
 const doc=new J.jsPDF({unit:'mm',format:'a4'});let first=true;
 S.floors.forEach(f=>f.nodes.filter(n=>n.qr).forEach(n=>{if(!first)doc.addPage();first=false;
  const p=payload(f,n),q=qrcode(0,'H');q.addData(p);q.make();const m=q.getModuleCount(),sz=130,c=sz/(m+8),x0=40,y0=62;
  doc.setTextColor(20);doc.setFont('helvetica','bold');doc.setFontSize(46);doc.text('FLOOR '+f.floor,105,32,{align:'center'});
  doc.setFont('helvetica','normal');doc.setFontSize(20);doc.text(n.label||n.id,105,46,{align:'center'});
  doc.setFillColor(0,0,0);for(let r=0;r<m;r++)for(let k=0;k<m;k++)if(q.isDark(r,k))doc.rect(x0+(k+4)*c,y0+(r+4)*c,c+.05,c+.05,'F');
  doc.setFont('helvetica','bold');doc.setFontSize(18);doc.text('Scan with CampusAR for directions',105,y0+sz+18,{align:'center'});
  doc.setFont('courier','normal');doc.setFontSize(p.length>40?9:12);doc.text(doc.splitTextToSize(p,170),105,y0+sz+28,{align:'center'});doc.setFontSize(10);doc.text(S.campus,105,285,{align:'center'})}));
 if(first)return toast('Tick "QR sticker" on at least one waypoint');saveFile('campus-qr-codes.pdf',doc.output('arraybuffer'))};
function loadDoc(o){
 if(!o||!Array.isArray(o.floors))throw Error('Not a campus JSON file');
 const grp={};(o.connectors||[]).forEach((c,i)=>c.nodes.forEach(id=>grp[id]=c.name||'Stairs '+(i+1)));push();
 S={campus:(o.campus&&o.campus.name)||'Campus',qrBase:(o.campus&&o.campus.qrBase)||'',floors:o.floors.map(f=>({floor:f.floor,name:f.name||'Floor '+f.floor,northOffset:f.northOffset||0,
  nodes:f.nodes.map(n=>({id:n.id,x:n.x,y:n.y,type:n.type||'corridor',label:n.label||'',qr:(f.qr||[]).some(q=>q.node===n.id),face:(()=>{const q=(f.qr||[]).find(q=>q.node===n.id);return q&&q.heading!=null?q.heading:''})(),group:grp[n.id]||''})),edges:f.edges||[],rooms:f.rooms||[]}))};
 cur=0;sel=null;$('cname').value=S.campus;$('qrbase').value=S.qrBase||'';commit();fit()}
$('imp').onclick=()=>$('file').click();
$('file').onchange=async e=>{const fl=e.target.files[0];if(!fl)return;try{loadDoc(JSON.parse(await fl.text()));toast('Imported '+S.floors.length+' floor(s)')}catch(err){toast('Import failed: '+err.message)}e.target.value=''};

/* ---------- Backend (PHP + Supabase) ---------- */
const API_BASE=window.CAMPUS_API||'../api',keyEl=$('apikey');
try{keyEl.value=localStorage.getItem('campus-key')||''}catch(e){}
keyEl.onchange=()=>{try{localStorage.setItem('campus-key',keyEl.value)}catch(e){}};
let baseVersion=null; // the database version this editor session last loaded or saved
async function call(opts){let r;try{r=await fetch(API_BASE+'/campus.php',{cache:'no-store',...opts})}catch(e){throw Error('Cannot reach the campus server')}
 const j=await r.json().catch(()=>({}));if(!r.ok){const e=Error((j.error||'Server error '+r.status)+(j.details?': '+j.details.join('; '):''));e.status=r.status;throw e}return j}
async function loadServer(silent){try{const j=await call();loadDoc(j.data);baseVersion=j.version;toast('Loaded version '+j.version+' from the database')}catch(e){if(!silent)toast('Load failed: '+e.message)}}
async function saveServer(){try{const j=await call({method:'POST',headers:{'Content-Type':'application/json','X-API-Key':keyEl.value},body:JSON.stringify({data:build(),note:'Saved from editor',baseVersion:baseVersion==null?0:baseVersion})});baseVersion=j.version;toast('Saved to the database as version '+j.version)}
 catch(e){toast(e.status===409?'Not saved: the database has a newer version than the one you loaded. Click ☁ Load, re-apply your changes, then save.':'Save failed: '+e.message)}}
$('ldb').onclick=()=>loadServer(false);$('sdb').onclick=saveServer;

/* ---------- wiring ---------- */
function tools(){document.querySelectorAll('[data-t]').forEach(b=>b.classList.toggle('on',b.dataset.t===tool));$('hint').textContent=HINT[tool];cv.style.cursor=tool==='select'?'grab':'crosshair'}
document.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{tool=b.dataset.t;conn=null;tools();draw()});
$('zi').onclick=()=>zoom(1.25);$('zo').onclick=()=>zoom(.8);$('fit').onclick=fit;$('undo').onclick=undo;
$('cname').value=S.campus;$('qrbase').value=S.qrBase||'';
$('qrbase').onchange=e=>{const v=e.target.value.trim();if(v&&!/^https?:\/\/\S+$/i.test(v)){e.target.value=S.qrBase||'';return toast('QR link base must start with https:// (or http:// for local tests)')}push();S.qrBase=v;commit()};
$('cname').onchange=e=>{push();S.campus=e.target.value;save()};
addEventListener('keydown',e=>{const t=e.target.tagName;if(t==='INPUT'||t==='SELECT')return;
 if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();undo()}else if((e.key==='Delete'||e.key==='Backspace')&&node(sel)){push();delNode(node(sel));commit()}else if(e.key==='Escape'){conn=null;draw()}});
tools();resize();view.oy=cv.clientHeight*.6;renderFloors();renderSide();fit();
loadServer(true); // the database is the source of truth; falls back to the local autosave if unreachable
