// Smoke test: run the app's JS with a mock DOM/Leaflet, simulate a GPS run
const fs=require('fs'), path=require('path');
const HERE=__dirname;
function loadAppCode(){
  const mj=path.join(HERE,'main.js');
  if(fs.existsSync(mj)) return fs.readFileSync(mj,'utf8');
  const html=fs.readFileSync(path.join(HERE,'index.html'),'utf8');
  const blocks=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  if(!blocks.length) throw new Error('no inline <script> found in index.html');
  return blocks.reduce((a,b)=>b.length>a.length?b:a);
}
let code=loadAppCode();

// ── Mock DOM ──
const elems={};
function mkEl(id){
  return elems[id]??(elems[id]={id,style:{},classList:{
      _s:new Set(),add(...c){c.forEach(x=>this._s.add(x))},remove(...c){c.forEach(x=>this._s.delete(x))},
      toggle(c,f){f===undefined?(this._s.has(c)?this._s.delete(c):this._s.add(c)):(f?this._s.add(c):this._s.delete(c));},
      contains(c){return this._s.has(c)}},
    textContent:'',innerHTML:'',value:'80',className:'',appendChild(){},insertBefore(){},
    addEventListener(){},remove(){},scrollIntoView(){},click(){},
    // real attribute storage — aria-pressed / src assertions need round-tripping
    _attrs:{},
    setAttribute(k,v){this._attrs[k]=String(v);if(k==='src')this.src=String(v)},
    getAttribute(k){return Object.prototype.hasOwnProperty.call(this._attrs,k)?this._attrs[k]:null},
    removeAttribute(k){delete this._attrs[k];if(k==='src')this.src=''},
    hasAttribute(k){return Object.prototype.hasOwnProperty.call(this._attrs,k)},
    // child stubs so components can address their own sub-elements
    _kids:{},
    querySelector(sel){return this._kids[sel]??(this._kids[sel]=mkEl(this.id+'>'+sel))},
    querySelectorAll(sel){return [this.querySelector(sel)]},
    getContext(){return{drawImage(){}}},files:[]});
}
// give the sliders proper values
const sliderVals={'rng-radius':'80','rng-auto':'1','rng-autostop':'1','rng-follow':'1','rng-zoom':'17','rng-recvel':'5','rng-recdur':'5'};
global.document={
  getElementById:id=>{const isNew=!elems[id];const e=mkEl(id);if(isNew&&sliderVals[id])e.value=sliderVals[id];return e},
  createElement:t=>mkEl('_dyn_'+Math.random()),
  addEventListener(){},
  visibilityState:'visible',
  body:mkEl('__body'),
  documentElement:mkEl('__html')
};
global.__speech={spoken:[],cancels:0,speaking:false,pending:false,
  cancel(){this.cancels++},speak(u){this.spoken.push(u.text)},resume(){}};
global.window={addEventListener(){},getComputedStyle:()=>({transform:'matrix(1,0,0,1,0,0)'}),speechSynthesis:global.__speech};
Object.defineProperty(globalThis,'navigator',{value:{geolocation:{watchPosition:(ok)=>{global.__gpsCb=ok;return 1},clearWatch(){}},serviceWorker:{register:()=>({catch(){}})}},configurable:true});
global.alert=m=>console.log('[alert]',m);
global.prompt=(q,d)=>global.__promptReply!==undefined?global.__promptReply:d;
global.confirm=()=>true;
global.localStorage={_d:{},getItem(k){return this._d[k]??null},setItem(k,v){this._d[k]=String(v)},removeItem(k){delete this._d[k]},
  key(i){return Object.keys(this._d)[i]??null},get length(){return Object.keys(this._d).length}};
global.DOMParser=class{parseFromString(){return{querySelectorAll:()=>[]}}};
global.SpeechSynthesisUtterance=class{constructor(t){this.text=t}};
global.URL={createObjectURL:()=>'blob:x',revokeObjectURL(){}};
global.Blob=class{};
global.Image=class{};
global.requestAnimationFrame=f=>f();
global.DOMMatrix=class{constructor(){this.m41=0;this.m42=0}};

// ── Mock Leaflet ──
const mkLayer=(opts)=>({_opts:opts||{},_latlngs:[],
  addTo(){return this},setLatLngs(v){this._latlngs=v;return this},addLatLng(){return this},
  bringToFront(){this._front=(global.__frontSeq=(global.__frontSeq||0)+1)},bringToBack(){this._back=true},
  getBounds:()=>({isValid:()=>true}),
  setIcon(i){this._icon=i},setLatLng(){return this},setZIndexOffset(z){this._opts.zIndexOffset=z},
  bindTooltip(){return this},bindPopup(){return this},openPopup(){}});
global.L={
  map:()=>({getContainer:()=>(global.__mapC??(global.__mapC={style:{},classList:{_s:new Set(),toggle(c,f){f?this._s.add(c):this._s.delete(c)},add(){},remove(){},contains(c){return this._s.has(c)}},querySelector:()=>null,addEventListener(){}})),on(){},invalidateSize(){},setView(){},fitBounds(){},setZoom(){},getZoom:()=>17,removeLayer(){},getSize:()=>({x:800,y:600})}),
  tileLayer:(u,o)=>mkLayer(o), polyline:(ll,o)=>{const L=mkLayer(o);L._latlngs=ll;return L},
  marker:(ll,o)=>{const m=mkLayer(o);m._icon=o&&o.icon;return m},
  circle:(ll,o)=>mkLayer(o), divIcon:(o)=>({_divIcon:true,...o}),
  control:{zoom:()=>({addTo(){}})}
};
global.setTimeout=(f,t)=>{ if(t<=1000) f(); return 0; }; // run short timers inline, skip long
global.clearTimeout=()=>{};
global.setInterval=()=>123; global.clearInterval=()=>{};
global.Date.prototype.toLocaleDateString=function(){return '10/06/2026'};
global.Date.prototype.toLocaleTimeString=function(){return '12:00'};


// ── assertion accounting: console.assert never throws in Node, so a failing
// ── test used to scroll past under an "ALL TESTS PASSED" banner.
let __n=0,__fails=0,__groups=[],__mark={n:0,f:0};
console.assert=(cond,...m)=>{ __n++; if(!cond){__fails++;console.error('  \u2717 FAIL:',...m);} };
global.__group=(name)=>{
  const p=(__n-__mark.n)-(__fails-__mark.f), f=__fails-__mark.f;
  const g=__groups.find(x=>x.name===name);
  if(g){g.passed+=p;g.failed+=f;} else __groups.push({name,passed:p,failed:f});
  __mark={n:__n,f:__fails};
};
process.on('exit',()=>{
  global.__group('(unlabelled)');
  const rows=__groups.filter(g=>g.passed+g.failed>0);
  const w=Math.max(...rows.map(r=>r.name.length),5);
  console.log('\n'+'='.repeat(w+26));
  rows.forEach(g=>console.log(`${g.name.padEnd(w)} : ${String(g.passed).padStart(3)} passed / ${String(g.failed).padStart(2)} failed`));
  console.log('='.repeat(w+26));
  console.log(`${'Total'.padEnd(w)} : ${String(__n-__fails).padStart(3)} passed / ${String(__fails).padStart(2)} failed`);
  if(__fails){console.error(`\n${__fails} ASSERTION(S) FAILED`);process.exitCode=1;}
});

code=code.replace(/'use strict';/,'');
const tests = require('fs').readFileSync(path.join(HERE,'tests_body.js'),'utf8');
eval(code + '\n;' + tests);
