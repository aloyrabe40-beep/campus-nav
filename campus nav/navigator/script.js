const $=id=>document.getElementById(id),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const D=Math.PI/180,n180=a=>((a%360)+540)%360-180;

/* ---------- Backend API (PHP) ---------- */
// The PHP endpoints live in ../api. Override with <script>window.CAMPUS_API='https://...'</script> if hosted elsewhere.
const API_BASE=window.CAMPUS_API||'../api';
async function get(path){
 let r;try{r=await fetch(`${API_BASE}/${path}`,{cache:'no-store'})}catch(e){throw Error('Cannot reach the campus server')}
 const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||'Server error '+r.status);return j}
const api={
 floor:n=>get(`floor.php?n=${n}`),
 route:async(from,room)=>(await get(`route.php?from=${encodeURIComponent(from)}&to=${encodeURIComponent(room)}`)).path,
 rooms:()=>get('rooms.php')
};
const ROOMS={},roomLabel=id=>ROOMS[id]?ROOMS[id].id+' · '+ROOMS[id].name:id;

/* ---------- QR payloads ----------
   campus://F2/f2S            in-app form
   campus://F2/f2S?h=90       ... with the plan-heading (deg) a person faces while scanning
   https://host/navigator/?q=F2/f2S[&h=90]   web form: opens from the phone's own camera app */
function mk(fl,node,h){h=(h===null||h===''||!isFinite(+h))?null:+h;return{floor:+fl,node,heading:h}}
function parseCode(text){
 text=String(text||'').trim();
 let m=/^campus:\/\/F(\d+)\/(\w+)(?:\?(.*))?$/i.exec(text);
 if(m)return mk(m[1],m[2],new URLSearchParams(m[3]||'').get('h'));
 let u;try{u=new URL(text)}catch(e){return null}
 if(!/^https?:$/.test(u.protocol))return null;
 m=/^F(\d+)\/(\w+)$/i.exec(u.searchParams.get('q')||'');
 return m?mk(m[1],m[2],u.searchParams.get('h')):null}
let deep=parseCode(location.href); // set when the page was opened by scanning a sticker with the phone camera

/* ---------- Setup ---------- */
let dest='',mode='home',R=null,busy=false,comp=0,cTarget=0,man=0,lastBad=0,roomsOk=false,scanT=0;
const sel=$('dest');
async function loadRooms(){
 try{const list=await api.rooms(),byF={};
  list.forEach(r=>{ROOMS[r.id]=r;(byF[r.floor]=byF[r.floor]||[]).push(r)});
  sel.innerHTML='';
  Object.keys(byF).sort((x,y)=>x-y).forEach(f=>{const g=document.createElement('optgroup');g.label=byF[f][0].floorName;
   byF[f].forEach(r=>g.append(new Option(r.id+' · '+r.name,r.id)));sel.append(g)});
  $('arDest').innerHTML=sel.innerHTML;roomsOk=list.length>0;$('go').disabled=!roomsOk;
  $('go').textContent=deep?'Start from this spot':'Scan QR to start';
  if(!roomsOk)toast('No rooms in the database yet')}
 catch(e){roomsOk=false;sel.innerHTML='<option>Server unreachable</option>';$('go').disabled=false;$('go').textContent='Retry connection';toast(e.message)}}
loadRooms();
if(deep){const d=$('deep');d.textContent=`📍 You scanned Floor ${deep.floor}, ${deep.node}. Pick a destination to begin.`;d.hidden=false}
function setMode(m){mode=m;$('cam').dataset.m=m}
function toast(t){const e=$('toast');e.textContent=t;e.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>e.hidden=true,3500)}

/* ---------- Sensors ---------- */
function ori(e){let h=null;
 if(e.webkitCompassHeading!=null)h=e.webkitCompassHeading;
 else if(e.alpha!=null&&e.beta!=null&&e.gamma!=null){
  const a=e.alpha*D,b=e.beta*D,g=e.gamma*D,cA=Math.cos(a),sA=Math.sin(a),sB=Math.sin(b),cG=Math.cos(g),sG=Math.sin(g);
  h=Math.atan2(-cA*sG-sA*sB*cG,-sA*sG+cA*sB*cG)/D}
 if(h!=null)cTarget=(h+360)%360;
 if(e.beta!=null)pT=Math.max(-30,Math.min(85,90-e.beta))}
addEventListener('deviceorientationabsolute',ori,true);
addEventListener('deviceorientation',e=>{if(e.webkitCompassHeading!=null)ori(e)},true);
let lastStep=0,lastMag=0;
addEventListener('devicemotion',e=>{const a=e.accelerationIncludingGravity;if(!a||mode!=='ar')return;
 const m=Math.hypot(a.x,a.y,a.z),now=performance.now();
 if(m>12&&lastMag<=12&&now-lastStep>380){lastStep=now;if(R)R.p=Math.min(R.lim,R.p+.7)}lastMag=m});
async function perms(){for(const C of[window.DeviceOrientationEvent,window.DeviceMotionEvent]){try{if(C&&C.requestPermission)await C.requestPermission()}catch(e){}}}
const vid=$('vid');
async function startCam(){
 if(vid.srcObject)return true;
 if(!window.isSecureContext||!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
  camError('The camera only works on a secure (HTTPS) connection. Open this page with https:// (XAMPP: https://YOUR-PC-IP/campus-ar/navigator/ and accept the certificate warning). You can still test with the buttons below.');return false}
 try{vid.srcObject=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});await vid.play();$('camerr').hidden=true;return true}
 catch(e){const n=e&&e.name;
  camError(n==='NotAllowedError'?'Camera permission is blocked. Tap the lock icon in Chrome\'s address bar > Permissions > Camera > Allow, then reload.':n==='NotFoundError'?'No camera was found on this device.':n==='NotReadableError'?'Another app is using the camera. Close it and try again.':'Could not open the camera ('+(n||'error')+').');return false}}
function camError(m){vid.style.display='none';const c=$('camerr');c.textContent=m;c.hidden=false}
function stopCam(){if(vid.srcObject)vid.srcObject.getTracks().forEach(t=>t.stop());vid.srcObject=null;vid.style.display='';$('camerr').hidden=true}

/* ---------- QR scan -> API -> AR ---------- */
const sc=document.createElement('canvas'),sctx=sc.getContext('2d',{willReadFrequently:true});
function scanTick(){
 clearTimeout(scanT); // only ever one scan loop, even if Go is pressed quickly after Back
 if(mode!=='scan'){if(mode==='home')return;scanT=setTimeout(scanTick,300);return}
 if(vid.readyState>=2&&vid.videoWidth&&window.jsQR){const w=480,h=Math.round(vid.videoHeight*w/vid.videoWidth);sc.width=w;sc.height=h;sctx.drawImage(vid,0,0,w,h);
  const r=jsQR(sctx.getImageData(0,0,w,h).data,w,h);if(r&&r.data)handleCode(r.data)}
 scanT=setTimeout(scanTick,180)}
function handleCode(text){
 if(busy)return;const c=parseCode(text);
 if(!c){if(Date.now()-lastBad>3000){lastBad=Date.now();toast('That is not a campus QR code')}return}
 return startFrom(c)}
async function startFrom(c){
 if(busy)return;busy=true;setMode('load');$('lt').textContent=`Fetching Floor ${c.floor} map…`;
 try{const fl=await api.floor(c.floor);const node=(fl.nodes||[]).find(n=>n.id===c.node);if(!node)throw Error('Unknown location in QR');
  const path=await api.route(node.id,dest);
  if(!Array.isArray(path)||!path.length)throw Error('No route to that room from here');
  setRoute(path,fl);
  // The sticker says which way people face when scanning it (plan degrees). Re-zero compass drift from that.
  if(c.heading!=null)man=n180(c.heading+R.off-comp);
  setMode('ar')}
 catch(e){toast(e.message||'Could not load floor');setMode('scan')}
 busy=false}
const vert=i=>R.path[i].floor!==R.path[i+1].floor;
function setRoute(path,fl){
 const cum=[0];for(let i=0;i<path.length-1;i++){const A=path[i],B=path[i+1];cum.push(cum[i]+(A.floor!==B.floor?0:Math.hypot(A.x-B.x,A.y-B.y)))}
 R={path,cum,total:cum[cum.length-1],off:fl.northOffset||0,p:0,fl};
 R.fv=path.findIndex((_,i)=>i<path.length-1&&vert(i));R.lim=R.fv<0?R.total:cum[R.fv]}
function segIdx(s){const n=R.path.length-1;for(let i=0;i<n;i++){if(vert(i)&&s>=R.cum[i])return i;if(s<R.cum[i+1])return i}return n-1}
function posAt(s){const P=R.path;if(P.length<2)return{x:P[0].x,y:P[0].y,b:0,i:-1};
 const i=segIdx(s),A=P[i],B=P[i+1];
 if(vert(i)){const q=i>0?posAt(R.cum[i]-.01):{b:0};return{x:A.x,y:A.y,b:q.b,i}}
 const t=Math.max(0,Math.min(1,(s-R.cum[i])/(R.cum[i+1]-R.cum[i])));
 return{x:A.x+(B.x-A.x)*t,y:A.y+(B.y-A.y)*t,b:Math.atan2(B.x-A.x,B.y-A.y)/D,i}}

/* ---------- AR render ---------- */
const cv=$('cv'),ctx=cv.getContext('2d');
function fit(){const d=devicePixelRatio||1;cv.width=innerWidth*d;cv.height=innerHeight*d;ctx.setTransform(d,0,0,d,0,0)}
addEventListener('resize',fit);fit();
let px=null;cv.addEventListener('pointerdown',e=>px=e.clientX);cv.addEventListener('pointerup',()=>px=null);cv.addEventListener('pointercancel',()=>px=null);
cv.addEventListener('pointermove',e=>{if(px!=null){man+=(e.clientX-px)*.3;px=e.clientX}});
const CH=[[.65,0],[-.45,.5],[-.2,0],[-.45,-.5]]; // sleek arrowhead with a notched back
let pitch=25,pT=25; // camera tilt below horizontal (deg); 25 = typical 'looking at the floor' until the sensor reports
function state(){return R.fv>=0&&R.p>=R.lim-.3?'vert':R.fv<0&&R.p>=R.total-1?'done':'go'}
let lastIns='';
function frame(t){
 const W=innerWidth,H=innerHeight;ctx.clearRect(0,0,W,H);
 comp+=n180(cTarget-comp)*.2;pitch+=(pT-pitch)*.2;
 if(mode==='ar'&&R)render(t,W,H);
 requestAnimationFrame(frame)}
function render(t,W,H){
 const hd=comp+man,f=H*.9,ch=1.5,th=pitch*D,cT=Math.cos(th),sT=Math.sin(th),o=R.off,u=posAt(R.p),st=state(),rel=n180(posAt(Math.min(R.p+.6,R.lim)).b+o-hd);
 const proj=(F,L,h)=>{const z=F*cT+h*sT;return z>.25?[W/2+f*L/z,H/2+f*(h*cT-F*sT)/z]:null};
 if(st==='go'){
  const ph=(t/1000)%1,SP=1.3,N=Math.min(90,Math.ceil((R.lim-R.p)/SP)+1);
  for(let k=N;k>=0;k--){const s=R.p+.8+k*SP-ph*SP;if(s>R.lim||s<R.p+.8)continue;
   const q=posAt(s),dx=q.x-u.x,dy=q.y-u.y,d=Math.hypot(dx,dy),b=(Math.atan2(dx,dy)/D+o-hd)*D,fw=d*Math.cos(b),lat=d*Math.sin(b),ta=(q.b+o-hd)*D;
   if(fw<.8||d>90)continue;
   const pts=CH.map(([uu,vv])=>{const F=fw+uu*Math.cos(ta)-vv*Math.sin(ta),L=lat+uu*Math.sin(ta)+vv*Math.cos(ta);return proj(F,L,ch)});
   if(pts.includes(null))continue;
   const a=.92*Math.min(1,(fw-.6)/.8)*Math.max(.55,1-(s-R.p)/60);
   ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();
   ctx.fillStyle=`rgba(61,232,238,${a})`;ctx.fill()}
  {const e=posAt(R.lim),dx=e.x-u.x,dy=e.y-u.y,d=Math.hypot(dx,dy),b=(Math.atan2(dx,dy)/D+o-hd)*D,F=d*Math.cos(b),L=d*Math.sin(b);
   const zc=F*cT+(ch-2.2)*sT;if(F>1.5&&d>1&&zc>.3){const X=W/2+f*L/zc,Y=H/2+f*((ch-2.2)*cT-F*sT)/zc,r=Math.max(10,Math.min(34,f*.3/zc));ctx.shadowBlur=0;ctx.fillStyle='#3de8ee';ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(X,Y,r,0,7);ctx.fill();ctx.stroke();ctx.fillStyle='#0b1a5c';ctx.font=`700 ${Math.round(r*.9)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(R.fv>=0?'⇅':'⚑',X,Y)}}
  if(Math.abs(rel)>40){ // off-screen guidance arrow
   const dir=rel>0?0:Math.PI;ctx.save();ctx.translate(rel>0?W-64:64,H*.5);ctx.rotate(Math.abs(rel)>130?Math.PI/2:dir);ctx.scale(70,70);
   ctx.beginPath();CH.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.shadowColor='#3de8ee';ctx.shadowBlur=20;ctx.fillStyle='#3de8ee';ctx.fill();ctx.restore()}
 }
 let ins,sub=`${Math.round(R.total-R.p)} m to go · ${roomLabel(dest)}`;
 if(st==='done'){ins=`🎉 You've arrived!`;sub=roomLabel(dest)}
 else if(st==='vert'){const n=R.path[R.fv+1].floor;ins=`Take the stairs ${n>R.path[R.fv].floor?'up':'down'} to Floor ${n}`;sub='Then scan the QR code on the landing'}
 else if(Math.abs(rel)>40)ins=Math.abs(rel)>130?'Turn around':`Turn ${rel>0?'right':'left'}`;
 else{ins='Go straight';const i=u.i,ds=R.cum[i+1]-R.p;
  if(ds<6&&i+1<R.path.length-1&&!vert(i+1)){const tn=n180(posAt(R.cum[i+1]+.3).b-u.b);if(Math.abs(tn)>35)ins=`In ${Math.ceil(ds)} m turn ${tn>0?'right':'left'}`}}
 if(ins+sub!==lastIns){lastIns=ins+sub;$('ins').textContent=ins;$('sub').textContent=sub}
}
requestAnimationFrame(frame);

/* ---------- Buttons ---------- */
$('go').onclick=async()=>{
 if(!roomsOk){$('go').disabled=true;$('go').textContent='Connecting…';await loadRooms();return}
 dest=sel.value;await perms();await startCam();$('home').hidden=true;$('cam').hidden=false;
 $('tgt').textContent='Destination: '+roomLabel(dest);$('arDest').value=dest;man=0;
 if(deep){const c=deep;deep=null;$('deep').hidden=true;setMode('scan');startFrom(c);scanTick()} // opened from a sticker: no need to scan again
 else{setMode('scan');scanTick()}};
document.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>handleCode(b.dataset.q));
$('resc').onclick=()=>{setMode('scan');scanTick()};
$('nxt').onclick=()=>{if(!R)return;const c=R.cum.find(v=>v>R.p+.1);R.p=Math.min(R.lim,c==null?R.lim:c)};
const end=()=>{clearTimeout(scanT);stopCam();R=null;setMode('home');$('cam').hidden=true;$('home').hidden=false;$('go').textContent='Scan QR to start'};
$('backb').onclick=end;
function clearNav(){R=null;lastIns='';setMode('scan');scanTick();toast('Navigation cleared. Scan a QR code to start again.')}
$('clearb').onclick=clearNav;
async function changeDest(){ // re-route from whichever end of the current segment you are nearer to
 try{const i=Math.max(0,segIdx(R.p));let from=R.path[i];
  if(R.path.length>1&&!vert(i)&&R.cum[i+1]-R.p<R.p-R.cum[i])from=R.path[i+1];
  const path=await api.route(from.id,dest);
  if(!Array.isArray(path)||!path.length)throw Error('No route to that room from here');
  setRoute(path,R.fl);lastIns=''}catch(e){toast(e.message)}}
$('arDest').onchange=async e=>{dest=e.target.value;sel.value=dest;$('tgt').textContent='Destination: '+roomLabel(dest);if(mode==='ar'&&R)await changeDest()};
