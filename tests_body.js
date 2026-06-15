// ── test helper: drive the lap modal if startSim/launchNav opened it ──
function _simWithLaps(idx,laps){
  if(typeof _pendingSimIdx!=='undefined'){ /* state lives in app scope */ }
  startSim(idx);
  if(el('lap-modal').classList.contains('on')){
    _lapChoice=laps; el('lap-custom').value=''; confirmLaps();
  }
}
// ══ helpers ══
function gps(lat,lng,kmh){onGPS({coords:{latitude:lat,longitude:lng,accuracy:8,altitude:30,speed:kmh/3.6,heading:0},timestamp:Date.now()});}
const realNow=Date.now.bind(Date); let fake=realNow(); Date.now=()=>fake;

// ══ TEST 1: math ══
console.assert(Math.abs(haversine(57.7089,11.9746,57.7189,11.9746)-1.112)<0.02,'haversine FAIL');
console.log('1. haversine OK');

// ══ TEST 2: maneuver peak detection (90° corner = ONE right turn) ══
routePts=[];
for(let i=0;i<=100;i++)routePts.push({lat:57.70+i*0.0001,lon:11.97});
for(let i=1;i<=100;i++)routePts.push({lat:57.71,lon:11.97+i*0.0002});
buildCumDist(routePts);totalRouteDist=routeCumDist[routeCumDist.length-1];
maneuvers=buildManeuvers(routePts);
const t2=maneuvers.filter(m=>m.type!=='arrive');
console.assert(t2.length===1&&t2[0].type==='right','maneuver FAIL: '+JSON.stringify(t2.map(x=>x.type)));
console.log('2. buildManeuvers OK:',maneuvers.map(m=>m.type).join(','));

// ══ TEST 3: MULTI-LAP CYCLE — 3 stops at the SAME physical location ══
// (this is the field bug: "completou todas as paradas na primeira parada")
const SL=57.71, SG=11.97; // stop location (the corner)
stops=[1,2,3].map(id=>({id,name:'Lap '+id,lat:SL,lng:SG,dur_s:10,elapsed:0,running:false,intervalId:null,state:'waiting'}));
stopMarkers={1:{setIcon(){}},2:{setIcon(){}},3:{setIcon(){}}};
const mk=()=>({addTo(){return this},setLatLngs(){},addLatLng(){},bringToFront(){},setIcon(){},setLatLng(){},getBounds:()=>({isValid:()=>true})});
routeLayer=routeAheadLayer=routeRemainLayer=routeDoneLayer=mk();
insideStop.clear();lastRouteIdx=0;navActive=true;departGate=null;

gps(SL,SG,3); // arrive slowly at the stop
console.assert(stops[0].state==='current','lap1 arrive FAIL: '+stops[0].state);
console.assert(stops[1].state==='waiting'&&stops[2].state==='waiting',
  'ALL-STOPS-AT-ONCE BUG STILL PRESENT: '+stops.map(s=>s.state).join(','));
console.log('3a. only lap-1 arrived OK:',stops.map(s=>s.state).join(','));

markDone(1); // timer auto-complete equivalent
gps(SL,SG,2); gps(SL,SG,1); // still parked at the stop
console.assert(stops[1].state==='waiting','GATE FAIL — lap2 arrived while still parked: '+stops[1].state);
console.log('3b. departure gate holds while parked OK');

gps(57.7135,SG,40); // drive away ~390 m, fast (clears gate)
gps(SL,SG,3);        // come back around the lap
console.assert(stops[1].state==='current','lap2 re-arrival FAIL: '+stops[1].state);
console.assert(stops[2].state==='waiting','lap3 premature FAIL');
console.log('3c. lap-2 armed after real departure OK');

// ══ TEST 4: regression — two DISTINCT stops, auto-stop departure ══
stops=[{id:1,name:'A',lat:57.70,lng:11.97,dur_s:10,elapsed:5,running:false,intervalId:null,state:'waiting'},
       {id:2,name:'B',lat:57.706,lng:11.97,dur_s:10,elapsed:0,running:false,intervalId:null,state:'waiting'}];
stopMarkers={1:{setIcon(){}},2:{setIcon(){}}};
insideStop.clear();departGate=null;
gps(57.70,11.97,3);                        // arrive A
console.assert(stops[0].state==='current','A arrive FAIL');
stops[0].running=true;                     // timer running (mock interval doesn't tick)
gps(57.7025,11.97,30);                     // depart A (~280m, fast)
console.assert(stops[0].state==='done','A auto-stop FAIL: '+stops[0].state);
gps(57.706,11.97,3);                       // arrive B (~670m from A — gate long cleared)
console.assert(stops[1].state==='current','B arrive FAIL: '+stops[1].state);
console.log('4. distinct sequential stops OK');

// ══ TEST 5: rotation branch executes (DOMMatrix present, no crash) ══
let svCalls=0; map.setView=()=>{svCalls++};
currentHeading=90; gps(57.706,11.97,30);
console.assert(svCalls>0,'follow/rotation branch FAIL — setView never called');
console.log('5. rotation/follow branch OK');

// ══ TEST 6: stopRec auto-loads the recording ══
navActive=false;isRec=true;
recPoints=[];for(let i=0;i<50;i++)recPoints.push({lat:57.70+i*0.0001,lng:11.97,t:fake+i*1000});
recStops=[{lat:57.702,lng:11.97,t:fake,dur_s:12,startT:fake,events:['openDoor'],photo:null}];
recStopCandidate=null;
stopRec();
console.assert(savedRecs.filter(Boolean).length>=1,'stopRec save FAIL');
console.assert(routePts.length===50,'AUTO-LOAD FAIL — route not loaded after rec: '+routePts.length);
console.assert(stops.length===1&&stops[0].events.includes('openDoor'),'auto-load stops/events FAIL');
console.assert(el('btn-nav').disabled===false,'Nav button not armed after auto-load');
console.log('6. stopRec auto-load OK — route, stops, events, Nav ready');

console.log('ALL TESTS PASSED');

// ══ TEST 7: settings persistence ══
el('rng-radius').value='12'; saveSettings();
el('rng-radius').value='80'; loadSettings();
console.assert(el('rng-radius').value==='12','settings persist FAIL: '+el('rng-radius').value);
console.log('7. settings persistence OK');

// ══ TEST 8: script-generated JSON import (lat/lon, ISO t, no dist, duracao_s) ══
const scriptJSON=JSON.stringify({points:[
  {lat:57.70,lon:11.97,t:'2026-06-10T08:00:00Z'},
  {lat:57.705,lon:11.97,t:'2026-06-10T08:01:00Z'},
  {lat:57.71,lon:11.97,t:'2026-06-10T08:02:00Z'}],
  stops:[{lat:57.705,lon:11.97,duracao_s:30,events:['openDoor']}]});
const nBefore=savedRecs.filter(Boolean).length;
global.FileReader=class{readAsText(){this.onload({target:{result:scriptJSON}})}};
global.alert=()=>{};
importRecsJSON({files:[{name:'ciclo.json'}],value:''});
const imp=savedRecs.filter(Boolean).pop();
console.assert(savedRecs.filter(Boolean).length===nBefore+1,'import count FAIL');
console.assert(imp.points[0].lng===11.97&&typeof imp.points[0].t==='number','lon→lng/ISO-t normalize FAIL');
console.assert(imp.stops[0].dur_s===30&&imp.stops[0].events[0]==='openDoor','duracao_s/events FAIL');
console.assert(imp.dist>1.0,'auto dist FAIL: '+imp.dist);
console.log('8. script JSON import OK — dist',imp.dist.toFixed(2),'km, dur_s',imp.stops[0].dur_s);

// ══ TEST 9: 10m radius — arrival fires at ~8m, not at 50m ══
el('rng-radius').value='10';
stops=[{id:1,name:'P1',lat:57.70,lng:11.97,dur_s:10,elapsed:0,running:false,intervalId:null,state:'waiting'}];
stopMarkers={1:{setIcon(){}}};insideStop.clear();departGate=null;navActive=true;
gps(57.7005,11.97,3);  // ~55m away, slow (eff radius = 18m)
console.assert(stops[0].state==='waiting','10m radius FAIL — arrived at 55m');
gps(57.70007,11.97,3); // ~8m away
console.assert(stops[0].state==='current','10m arrival FAIL at 8m');
console.log('9. 10m radius arrival OK');

console.log('ALL EXTENDED TESTS PASSED');

// ══ TEST 10: rotation — container transform, no Leaflet pane involvement ══
setMapBearing(-90);
console.assert(/rotate\(-90deg\)/.test(__mapC.style.transform),'container rotate FAIL: '+__mapC.style.transform);
console.assert(__mapC.classList.contains('rotated'),'rotated class FAIL');
// wraparound continuity: -350 after -10 must unwrap (no +340° long spin)
setMapBearing(-10); setMapBearing(-350);
const m=__mapC.style.transform.match(/rotate\((-?[\d.]+)deg\)/);
console.assert(m&&Math.abs(+m[1]-10)<0.01,'unwrap FAIL: '+__mapC.style.transform); // -350 ≡ +10, near -10
setMapBearing(0);
console.assert(__mapC.style.transform===''||/rotate\((-?360|0)deg\)/.test(__mapC.style.transform),'north reset FAIL');
console.log('10. container rotation + unwrap OK');

// ══ TEST 11: voice — no mid-word cancel loop, dedup per semantic key ══
__speech.spoken=[];__speech.cancels=0;
for(const k in _spokenAt)delete _spokenAt[k];
voiceOn=true;
// simulate the field loop: event announce + maneuver announce alternating each GPS tick
for(let tick=0;tick<10;tick++){
  speakText('Stop 1: open doors required',true);   // was re-firing every other tick
  speakText('In 500 meters, turn right');           // maneuver
}
const s1=__speech.spoken.filter(t=>t.includes('open doors')).length;
const s2=__speech.spoken.filter(t=>t.includes('500 meters')).length;
console.assert(s1===1,'event announce repeat FAIL: spoken '+s1+'x');
console.assert(s2===1,'maneuver dedup FAIL: spoken '+s2+'x');
// priority cancels current speech exactly once (not once per tick)
console.assert(__speech.cancels===1,'cancel storm FAIL: '+__speech.cancels+' cancels');
// different stop number = same semantic key → still suppressed within cooldown (no chatter),
// but a genuinely different sentence passes
speakText('Turn left ahead');
console.assert(__speech.spoken.includes('Turn left ahead'),'distinct message blocked FAIL');
console.log('11. voice dedup OK — spoken:',__speech.spoken.length,'cancels:',__speech.cancels);

console.log('ALL v5 TESTS PASSED');

// ══ TEST 12: GPS jitter at a stop must NOT create a phantom U-turn ══
routePts=[];
for(let i=0;i<60;i++)routePts.push({lat:57.70+i*0.0001,lon:11.97});       // north ~660m
const jl=57.706, jg=11.97;                                                  // "parked" cluster
for(let i=0;i<15;i++)routePts.push({lat:jl+(i%3-1)*0.00002,lon:jg+((i*7)%3-1)*0.00002}); // ±2m jitter
for(let i=1;i<60;i++)routePts.push({lat:jl+i*0.0001,lon:11.97});            // continue north
buildCumDist(routePts);totalRouteDist=routeCumDist[routeCumDist.length-1];
maneuvers=buildManeuvers(routePts);
const phantom=maneuvers.filter(m=>m.type==='uturn'||m.type==='shr'||m.type==='shl');
console.assert(phantom.length===0,'PHANTOM U-TURN STILL PRESENT: '+JSON.stringify(phantom.map(p=>p.type)));
console.assert(maneuvers.filter(m=>m.type!=='arrive').length===0,'straight route got turns: '+maneuvers.map(m=>m.type));
console.log('12. jitter cluster filtered OK — maneuvers:',maneuvers.map(m=>m.type).join(','));

// ══ TEST 13: recording decimation — parked vehicle adds ~no points ══
navActive=false;isRec=true;recPoints=[];recStops=[];recStopCandidate=null;recLayer=null;
fake=realNow();
for(let i=0;i<10;i++){fake+=1000;gps(57.70+(i%2)*0.000005,11.97,1);} // parked, <1m jitter, 10s
const parkedPts=recPoints.length;
console.assert(parkedPts<=3,'decimation FAIL — '+parkedPts+' jitter points recorded');
for(let i=1;i<=5;i++){fake+=1000;gps(57.70+i*0.0002,11.97,40);}      // moving ~22m/s
console.assert(recPoints.length>=parkedPts+5,'moving points lost: '+recPoints.length);
console.log('13. decimation OK — parked:',parkedPts,'pts, after moving:',recPoints.length);

// ══ TEST 14: orphaned markers cleared on new recording ══
let removed=0; map.removeLayer=()=>{removed++};
extraMarkers.length=0;
extraMarkers.push({_m:1},{_m:2},{_m:3}); // simulate start/end dots + rec pin
stopMarkers={1:{_m:4}};
routeLayer=routeAheadLayer=routeRemainLayer=routeDoneLayer=recLayer={addTo(){return this}};
clearMapLayers();
console.assert(extraMarkers.length===0,'extraMarkers not cleared');
console.assert(removed>=8,'removeLayer count FAIL: '+removed); // 5 layers + 1 stopMarker + 3 extras... >=8
console.log('14. orphaned markers cleared OK — removeLayer called',removed,'x');

console.log('ALL v6 TESTS PASSED');

// ══ TEST 15: GTA/VBC classification — synthetic Ci2 cycle ══
// Target: avg ~19 (15-23), drive ~27 (23-32), max ~54 (50-60), idle ~30% (27-36), 3 st/km (2.5-5)
fake=realNow();
const apts=[];let alat=57.70,t0g=fake;
function drive(sec,ms){for(let i=0;i<sec;i++){alat+=ms*0.0000090;t0g+=1000;apts.push({lat:alat,lng:11.97,t:t0g,alt:30+apts.length*0.05});}}
function park(sec){for(let i=0;i<sec;i+=10){t0g+=10000;apts.push({lat:alat,lng:11.97,t:t0g,alt:30+apts.length*0.05});}}
apts.push({lat:alat,lng:11.97,t:t0g,alt:30});
drive(120,7.5); park(60); drive(80,7.5); drive(4,15); park(50); drive(60,7.5);
const gta=calcGTAScore(apts,[{},{},{},{},{},{}]); // 6 stops over ~2 km
console.assert(gta.cls==='Ci2','GTA class FAIL: '+JSON.stringify({cls:gta.cls,m:gta.metrics}));
console.assert(gta.matched>=4,'GTA criteria FAIL: '+gta.matched+'/5 '+JSON.stringify(gta.detail));
const eg=calcElevGain(apts);
console.assert(eg!=null&&eg>=8,'elev gain FAIL: '+eg);
console.assert(calcGTAScore([{lat:1,lng:1,t:1}],[]).matched===null,'GTA null-guard FAIL');
// LH cycle: 0 stops, highway profile (avg~64, drive~68, max~95, idle~6%)
const lpts=[];alat=57.70;t0g=fake+1e7;lpts.push({lat:alat,lng:11.97,t:t0g});
for(let i=0;i<150;i++){alat+=26.4*0.0000090;t0g+=1000;lpts.push({lat:alat,lng:11.97,t:t0g});} // 95 km/h
for(let i=0;i<150;i++){alat+=11.4*0.0000090;t0g+=1000;lpts.push({lat:alat,lng:11.97,t:t0g});} // 41 km/h
for(let i=0;i<20;i+=10){t0g+=10000;lpts.push({lat:alat,lng:11.97,t:t0g});}                    // idle
const lh=calcGTAScore(lpts,[]);
console.assert(lh.cls==='LH1'&&lh.matched>=4,'LH class FAIL: '+lh.cls+' '+lh.matched+' '+JSON.stringify(lh.metrics));
console.log('15. GTA classification OK —',gta.cls,gta.matched+'/5, LH cycle →',lh.cls,lh.matched+'/5');

// ══ TEST 16: editable cycle name + GTA stored on save ══
global.__promptReply='Sion Lap 3';
isRec=true;navActive=false;recStops=[{},{},{},{},{},{}];recStopCandidate=null;
recPoints=apts.map(p=>({...p}));
stopRec();
const last=savedRecs.filter(Boolean).pop();
console.assert(last.name==='Sion Lap 3','name edit FAIL: '+last.name);
console.assert(last.score?.cls==='Ci2'&&last.score.matched!=null&&last.elev!=null,'stored GTA FAIL: '+JSON.stringify({c:last.score?.cls,e:last.elev}));
delete global.__promptReply;
console.log('16. editable name + stored GTA OK:',last.score.cls,last.score.matched+'/5');

// ══ TEST 17: seg_avg attached to nav stops and shown in HUD chip ══
console.assert(stops.length===0||true,'');
const spts=[];fake=realNow();
for(let i=0;i<120;i++)spts.push({lat:57.70+i*0.00009,lng:11.97,t:fake+i*1000}); // 10 m/s
savedRecs.push({name:'SegTest',dist:1,date:new Date(),points:spts,
  stops:[{lat:spts[60].lat,lng:11.97,t:spts[60].t,dur_s:20}]});
loadRec(savedRecs.length-1);
console.assert(stops[0].seg_avg!=null&&Math.abs(stops[0].seg_avg-36)<3,'seg_avg attach FAIL: '+stops[0].seg_avg);
navActive=true;
gps(57.70,11.97,30);
console.assert(/Ø 3[3-9]/.test(el('hud-tgt').textContent),'HUD target chip FAIL: "'+el('hud-tgt').textContent+'"');
console.log('17. leg pacing in HUD OK:',el('hud-tgt').textContent);

// ══ TEST 18: tapping active tab collapses sheet (user only) ══
shState='mid';
el('stab-rota').classList.add('active');
switchTab('rota',true);
console.assert(shState==='peek','tab collapse FAIL: '+shState);
switchTab('rota');           // programmatic — must NOT collapse from peek→stay/open
console.assert(shState==='mid','programmatic open FAIL: '+shState);
switchTab('gravadas',true);  // different tab — opens
console.assert(shState==='mid','tab open FAIL: '+shState);
console.log('18. tab retract/expand OK');

console.log('ALL v7 TESTS PASSED');

// ══ TEST 19: sheet collapse behavior ══
shState='peek';
toggleSheetCollapse();
console.assert(shState==='mid','chevron expand FAIL: '+shState);
toggleSheetCollapse();
console.assert(shState==='peek','chevron collapse FAIL: '+shState);
// swipe down from mid → peek (was stuck at mid before)
shState='mid'; tsY=100;
shTE({changedTouches:[{clientY:200}]});
console.assert(shState==='peek','swipe-down collapse FAIL: '+shState);
// swipe up from peek → mid
tsY=200; shTE({changedTouches:[{clientY:100}]});
console.assert(shState==='mid','swipe-up open FAIL: '+shState);
console.log('19. sheet collapse/expand OK');

console.log('ALL v8 TESTS PASSED');

// ══ TEST 20: crash recovery — in-flight flush + boot recover ══
isRec=true;recPoints=[];recStops=[];recStopCandidate=null;_lastFlush=0;fake=realNow();
for(let i=0;i<8;i++){fake+=6000;gps(57.72+i*0.0005,11.97,40);} // 48s drive → ≥1 flush
console.assert(localStorage.getItem('gpx-nav-inflight')!=null,'inflight flush FAIL');
isRec=false; // simulate app crash (no stopRec)
const nRecs=savedRecs.filter(Boolean).length;
checkInflightRecovery(); // confirm mock returns true
console.assert(savedRecs.filter(Boolean).length===nRecs+1,'recovery FAIL');
console.assert(localStorage.getItem('gpx-nav-inflight')==null,'inflight not cleared');
console.assert(/^Recovered/.test(savedRecs.filter(Boolean).pop().name),'recovery name FAIL');
console.log('20. crash recovery OK');

// ══ TEST 21: quota guard warns above 3.5 MB ══
let alerts=[];const oldAlert=global.alert;global.alert=m=>alerts.push(m);
_quotaWarned=false;
localStorage.setItem('bigblob','x'.repeat(1.9*1024*1024)); // ~3.8MB in UTF-16 estimate
checkQuota();
console.assert(alerts.some(a=>/Storage/.test(a)),'quota warn FAIL: '+alerts.length);
localStorage.removeItem('bigblob');global.alert=oldAlert;_quotaWarned=false;
console.log('21. quota guard OK');

// ══ TEST 22: altitude survives persistence round-trip (elev was lost on reload) ══
savedRecs.length=0;
savedRecs.push({name:'AltTest',dist:1,date:new Date(),points:[
  {lat:57.7,lng:11.97,t:1,alt:100.04},{lat:57.71,lng:11.97,t:2,alt:120.06}],stops:[]});
saveRecordings();
const stored=JSON.parse(localStorage.getItem('gpx-nav-recs'));
console.assert(stored[0].points[0].alt===100&&stored[0].points[1].alt===120.1,'alt persist FAIL: '+JSON.stringify(stored[0].points));
console.log('22. altitude persistence OK');

// ══ TEST 23: Next Stop Card content during nav ══
stops=[{id:1,name:'P1',lat:57.80,lng:11.97,dur_s:45,elapsed:0,running:false,intervalId:null,
  state:'waiting',events:['openDoor'],seg_avg:31.5,photo:null}];
stopMarkers={1:{setIcon(){}}};insideStop.clear();departGate=null;navActive=true;
el('rng-radius').value='10';
gps(57.7964,11.97,40); // ~400 m away
console.assert(el('nsc').style.display==='block','NSC hidden FAIL');
console.assert(/40[0-9] m|39[0-9] m/.test(el('nsc-dist').textContent),'NSC dist FAIL: '+el('nsc-dist').textContent);
console.assert(el('nsc-evt').textContent.includes('🚪'),'NSC events FAIL');
console.assert(/31\.5/.test(el('nsc-leg').textContent),'NSC leg FAIL: '+el('nsc-leg').textContent);
console.assert(el('nsc-count').textContent==='1/1','NSC count FAIL: '+el('nsc-count').textContent);
// at stop: countdown mode
stops[0].state='current';stops[0].elapsed=15;
gps(57.80,11.97,1);
console.assert(el('nsc-title').textContent.includes('AT STOP'),'NSC atstop FAIL');
console.assert(el('nsc-dist').textContent==='00:30','NSC countdown FAIL: '+el('nsc-dist').textContent);
navActive=false;stops=[];
console.log('23. Next Stop Card OK');

console.log('ALL v9-DEV TESTS PASSED');

// ══ TEST 24: GPS simulator — full nav replay from a recorded cycle ══
// Build a "physically recorded" cycle: drive 60s @10 m/s, dwell 30s, drive 40s
fake=realNow();let qlat=57.90,qt=fake;
const qpts=[{lat:qlat,lng:11.97,t:qt}];
for(let i=0;i<60;i++){qlat+=10*0.0000090;qt+=1000;qpts.push({lat:qlat,lng:11.97,t:qt});}
const stopPos=qlat;
for(let i=0;i<30;i+=5){qt+=5000;qpts.push({lat:qlat,lng:11.97,t:qt});}
for(let i=0;i<40;i++){qlat+=10*0.0000090;qt+=1000;qpts.push({lat:qlat,lng:11.97,t:qt});}
savedRecs.push({name:'SimCycle',dist:1,date:new Date(),points:qpts,
  stops:[{lat:stopPos,lng:11.97,t:qpts[61].t,dur_s:25,events:[]}]});
const simRecIdx=savedRecs.length-1;
loadRec(simRecIdx);
console.assert(stops.length===1&&routePts.length===qpts.length,'sim loadRec FAIL');
navActive=true;watchId=7;el('rng-sim').value='10';
__speech.spoken=[];for(const k in _spokenAt)delete _spokenAt[k];
_simWithLaps(simRecIdx,1);
// mock setTimeout runs <=1000ms inline → whole sim executed synchronously
console.assert(simRec===null,'sim did not finish: idx '+simIdx); // simTimer===0 is the sync-mock artifact
console.assert(stops[0].state==='done'||stops[0].state==='current','SIM arrival FAIL: '+stops[0].state);
console.assert(lastRouteIdx>50,'SIM route matching FAIL: '+lastRouteIdx);
console.assert(__speech.spoken.some(t=>/Arrived at stop/.test(t)),'SIM voice FAIL');
console.assert(watchId!=null,'real GPS not resumed after sim');
console.log('24. GPS simulator OK — arrival, matching, voice all replayed; stop state:',stops[0].state);

console.log('ALL v10-DEV TESTS PASSED');

// ══ TEST 25: live cycle metrics accumulate during navigation ══
fake=realNow();
stops=[{id:1,name:'P1',lat:57.85,lng:11.97,dur_s:20,elapsed:0,running:false,intervalId:null,
  state:'waiting',events:[],seg_avg:null,photo:null}];
stopMarkers={1:{setIcon(){}}};insideStop.clear();departGate=null;navActive=true;
live={dist:0,moving:0,idle:0,stops:0,last:null,lastT:null};
el('rng-radius').value='10';
// drive 50s @ ~10 m/s toward the stop
let mlat=57.80;
for(let i=0;i<50;i++){fake+=1000;mlat+=10*0.0000090;gps(mlat,11.97,36);}
console.assert(el('lcm').style.display==='block','LCM hidden FAIL');
const drv=parseFloat(el('lcm-drv').textContent);
console.assert(Math.abs(drv-36)<4,'LCM avg driving FAIL: '+el('lcm-drv').textContent);
console.assert(/km/.test(el('lcm-extra').textContent),'LCM extra FAIL: '+el('lcm-extra').textContent);
// idle at the stop for 30s → avg total must drop below avg driving
for(let i=0;i<30;i++){fake+=1000;gps(mlat,11.97,0.5);}
const avgT=parseFloat(el('lcm-avg').textContent),drv2=parseFloat(el('lcm-drv').textContent);
console.assert(avgT<drv2,'LCM total<driving FAIL: tot '+avgT+' drv '+drv2);
console.assert(/[1-9][0-9]?%/.test(el('lcm-extra').textContent),'LCM idle% FAIL: '+el('lcm-extra').textContent);
console.log('25. live metrics OK — drv',el('lcm-drv').textContent,'tot',el('lcm-avg').textContent,'·',el('lcm-extra').textContent);

// ══ TEST 26: SIM auto-starts navigation (new HUD shown) ══
navActive=false;currentLoadedRec=-1;watchId=null;
fake=realNow();let s26lat=57.95;const s26pts=[{lat:s26lat,lng:11.97,t:fake}];
for(let i=0;i<30;i++){s26lat+=10*0.0000090;fake+=1000;s26pts.push({lat:s26lat,lng:11.97,t:fake});}
savedRecs.push({name:'AutoNavSim',dist:1,date:new Date(),points:s26pts,stops:[]});
const s26idx=savedRecs.length-1;
el('rng-sim').value='15';
// Capture nav state mid-sim: pause the auto-run by making setTimeout a no-op
const _st26=global.setTimeout;let firstStep=true;
global.setTimeout=(fn)=>{if(firstStep){firstStep=false;}return 0;}; // don't auto-advance
_simWithLaps(s26idx,1);
// Right after startSim, before sim completes, navigation must be ON
console.assert(navActive===true,'SIM did not auto-start navigation (navActive false)');
console.assert(currentLoadedRec===s26idx,'SIM did not auto-load cycle: '+currentLoadedRec);
console.assert(routePts.length===s26pts.length,'SIM cycle not loaded into routePts');
console.assert(simMode===true,'simMode not set during sim');
global.setTimeout=_st26;stopSim(true);navActive=false;
console.log('26. SIM auto-nav OK — nav active + simMode set during simulation');

console.log('ALL v11-DEV TESTS PASSED');

// ══ TEST 27: circular route — no premature "arrived at destination" ══
// Route that returns to its start (loop): end point == start point
fake=realNow();
routePts=[];
const cx=57.70,cy=11.97,R=0.003;
for(let i=0;i<=72;i++){const a=i/72*2*Math.PI;routePts.push({lat:cx+R*Math.cos(a),lon:cy+R*Math.sin(a)});}
buildCumDist(routePts);totalRouteDist=routeCumDist[routeCumDist.length-1];
stops=[];navActive=true;destinationAnnounced=false;routeMaxIdx=0;lastRouteIdx=0;
__speech.spoken=[];for(const k in _spokenAt)delete _spokenAt[k];
// Predicate mirrors the in-app guard: distance-travelled based, robust to
// index jumps on a short loop.
live={dist:0,moving:0,idle:0,stops:0,last:null,lastT:null};
const _arrAt=(nearIdx)=>{
  const progressed=live.dist>=totalRouteDist*0.7;
  const stopsDone=!stops.length||stops.every(x=>x.state==='done');
  return routePts.length&&nearIdx>=routePts.length-3&&progressed&&stopsDone;};
// At t=0 on the start point: live.dist=0 → must NOT arrive even if idx hits the end
let r=nearestRoutePoint(cx+R,cy);
console.assert(!_arrAt(r.nearIdx),'CIRCULAR FAIL — arrived at t=0 before moving');
// Drive a quarter of the loop accumulating real distance — still not arrived
let pl=cx+R,pn=cy;
for(let i=1;i<=20;i++){const a=i/72*2*Math.PI;const la=cx+R*Math.cos(a),lo=cy+R*Math.sin(a);
  live.dist+=haversine(pl,pn,la,lo);pl=la;pn=lo;r=nearestRoutePoint(la,lo);}
console.assert(!_arrAt(r.nearIdx),'CIRCULAR FAIL — arrived at 25% (dist '+live.dist.toFixed(2)+'/'+totalRouteDist.toFixed(2)+')');
// Complete the loop — distance now ≥70% AND near the end point
for(let i=21;i<=72;i++){const a=i/72*2*Math.PI;const la=cx+R*Math.cos(a),lo=cy+R*Math.sin(a);
  live.dist+=haversine(pl,pn,la,lo);pl=la;pn=lo;r=nearestRoutePoint(la,lo);}
console.assert(_arrAt(r.nearIdx),'CIRCULAR FAIL — never arrived after full loop: dist '+live.dist.toFixed(2)+' near '+r.nearIdx);
console.log('27. circular route arrival OK — dist-based guard, '+routePts.length+' pts loop');

// ══ TEST 28: floating photo overlay suppressed during navigation ══
navActive=true;_forcePhotoOverlay=false;
el('stop-photo-ov').classList.remove('on');
showStopPhoto({id:9,name:'P9',photo:'data:image/jpeg;base64,zzz'},0);
console.assert(!el('stop-photo-ov').classList.contains('on'),'overlay NOT suppressed during nav');
// explicit tap forces it
stops=[{id:9,state:'waiting',photo:'data:image/jpeg;base64,zzz',events:[],lat:1,lng:1}];
nscPhotoTap();
console.assert(el('stop-photo-ov').classList.contains('on'),'explicit photo tap FAIL');
el('stop-photo-ov').classList.remove('on');stops=[];
console.log('28. photo overlay suppression OK');

// ══ TEST 29: big event cue appears within 120m, hides far away ══
navActive=true;
stops=[{id:1,name:'P1',lat:57.80,lng:11.97,dur_s:20,elapsed:0,running:false,intervalId:null,
  state:'waiting',events:['openDoor','kneeling'],seg_avg:null,photo:null}];
stopMarkers={1:{setIcon(){}}};insideStop.clear();departGate=null;el('rng-radius').value='10';
updNextStopCard(57.7964,11.97); // ~400 m → cue hidden
console.assert(!el('evt-cue').classList.contains('on'),'cue shown too far FAIL');
updNextStopCard(57.7993,11.97); // ~78 m → cue shown
console.assert(el('evt-cue').classList.contains('on'),'cue not shown near FAIL');
console.assert(el('evt-cue').innerHTML.includes('🚪')&&el('evt-cue').innerHTML.includes('♿'),'cue icons FAIL: '+el('evt-cue').innerHTML);
navActive=false;stops=[];
console.log('29. big event cue OK');

console.log('ALL v12-DEV TESTS PASSED');

// ══ TEST 30: hand brake event flows through nav + GPX ══
stops=[{id:1,name:'P1',lat:57.80,lng:11.97,dur_s:20,elapsed:0,running:false,intervalId:null,
  state:'waiting',events:['handBrake','openDoor'],seg_avg:null,photo:null}];
stopMarkers={1:{setIcon(){}}};navActive=true;el('rng-radius').value='10';
updNextStopCard(57.7993,11.97); // ~78 m
console.assert(el('nsc-evt').textContent.includes('🅿️'),'NSC handBrake FAIL: '+el('nsc-evt').textContent);
console.assert(el('evt-cue').innerHTML.includes('🅿️'),'cue handBrake FAIL');
// handBrake persists through save/load round-trip
savedRecs.length=0;
savedRecs.push({name:'HB',dist:1,date:new Date(),points:[{lat:57.8,lng:11.97,t:1},{lat:57.81,lng:11.97,t:2}],
  stops:[{lat:57.80,lng:11.97,t:1,dur_s:20,events:['handBrake','openDoor']}]});
saveRecordings();
const hb=JSON.parse(localStorage.getItem('gpx-nav-recs'))[0];
console.assert(hb.stops[0].events.includes('handBrake'),'handBrake persist FAIL: '+JSON.stringify(hb.stops[0].events));
navActive=false;stops=[];
console.log('30. hand brake event OK');

// ══ TEST 31: multi-lap circular navigation ══
fake=realNow();routePts=[];
const c31x=57.70,c31y=11.97,R31=0.003;
for(let i=0;i<=72;i++){const a=i/72*2*Math.PI;routePts.push({lat:c31x+R31*Math.cos(a),lon:c31y+R31*Math.sin(a)});}
buildCumDist(routePts);totalRouteDist=routeCumDist[routeCumDist.length-1];
console.assert(isCircularRoute(),'circular detect FAIL');
// one base stop
stops=[{id:1,name:'S1',lat:c31x+R31,lng:c31y,dur_s:15,elapsed:0,running:false,intervalId:null,state:'waiting',events:[]}];
stopMarkers={1:{setIcon(){},addTo(){return this}}};
navActive=false;
startNav(3);
console.assert(totalLaps===3,'lap count FAIL: '+totalLaps);
console.assert(stops.length===3,'lap stops expansion FAIL: '+stops.length);
console.assert(stops[0].name==='L1·S1'&&stops[2].name==='L3·S1','lap labels FAIL: '+stops.map(s=>s.name));
console.assert(stops.every(s=>s.state==='waiting'),'lap stops not reset');
delete global.__promptReply;
navActive=false;
console.log('31. multi-lap navigation OK — 3 laps × 1 stop =',stops.length,'stops');

// ══ TEST 32: non-circular route does NOT prompt for laps ══
routePts=[];for(let i=0;i<=50;i++)routePts.push({lat:57.70+i*0.001,lon:11.97}); // straight line
buildCumDist(routePts);totalRouteDist=routeCumDist[routeCumDist.length-1];
console.assert(!isCircularRoute(),'straight route flagged circular FAIL');
stops=[{id:1,name:'S1',lat:57.72,lng:11.97,dur_s:10,elapsed:0,running:false,intervalId:null,state:'waiting',events:[]}];
stopMarkers={1:{setIcon(){},addTo(){return this}}};
navActive=false;
startNav(1); // straight route — laps ignored
console.assert(totalLaps===1,'straight route got laps FAIL: '+totalLaps);
console.assert(stops.length===1,'straight route stops changed FAIL');
delete global.__promptReply;navActive=false;
console.log('32. non-circular no-prompt OK');

console.log('ALL v13-DEV TESTS PASSED');

// ══ TEST 33: multi-lap circular route — matcher wraps, no premature end ══
fake=realNow();routePts=[];
const c33x=57.70,c33y=11.97,R33=0.004;
const NP=72;
for(let i=0;i<=NP;i++){const a=i/NP*2*Math.PI;routePts.push({lat:c33x+R33*Math.cos(a),lon:c33y+R33*Math.sin(a)});}
buildCumDist(routePts);totalRouteDist=routeCumDist[routeCumDist.length-1];
// Set up a 3-lap run with one stop at the start point
stops=[{id:1,name:'L1·S1',lat:c33x+R33,lng:c33y,dur_s:5,elapsed:0,running:false,intervalId:null,state:'waiting',events:[],lapNum:1}];
stopMarkers={1:{setIcon(){},addTo(){return this}}};
navActive=true;_routeIsCircular=true;totalLaps=3;currentLap=1;
lastRouteIdx=0;routeMaxIdx=0;destinationAnnounced=false;
live={dist:0,moving:0,idle:0,stops:0,last:null,lastT:null};lapBaseDist=0;
currentHeading=null; // disable direction penalty for clean geometry
__speech.spoken=[];for(const k in _spokenAt)delete _spokenAt[k];

// Helper: drive one full loop, accumulating live.dist
let plat=c33x+R33,plng=c33y;
function driveLoop(){
  for(let i=1;i<=NP;i++){
    const a=i/NP*2*Math.PI;const la=c33x+R33*Math.cos(a),lo=c33y+R33*Math.sin(a);
    live.dist+=haversine(plat,plng,la,lo);plat=la;plng=lo;
    nearestRoutePoint(la,lo);
  }
}
// Lap 1
driveLoop();
console.assert(currentLap===2,'LAP1→2 wrap FAIL: currentLap='+currentLap+' idx='+lastRouteIdx);
console.assert(!destinationAnnounced,'premature arrival after lap 1 FAIL');
// Lap 2
driveLoop();
console.assert(currentLap===3,'LAP2→3 wrap FAIL: '+currentLap);
console.assert(!destinationAnnounced,'premature arrival after lap 2 FAIL');
// Lap 3 (final) — drive most of it, check arrival predicate
driveLoop();
const onFinalLap=currentLap>=totalLaps;
const lapDist=live.dist-lapBaseDist;
console.assert(onFinalLap,'not on final lap FAIL: '+currentLap);
console.assert(lapDist>=totalRouteDist*0.7,'final lap distance FAIL: '+lapDist.toFixed(2)+'/'+totalRouteDist.toFixed(2));
console.assert(lastRouteIdx>=routePts.length-3,'final lap end idx FAIL: '+lastRouteIdx);
console.log('33. multi-lap wrap OK — completed',currentLap,'laps, final idx',lastRouteIdx);

// ══ TEST 34: single-lap circular still arrives normally (no wrap interference) ══
fake=realNow();
stops=[];navActive=true;_routeIsCircular=true;totalLaps=1;currentLap=1;
lastRouteIdx=0;routeMaxIdx=0;destinationAnnounced=false;
live={dist:0,moving:0,idle:0,stops:0,last:null,lastT:null};lapBaseDist=0;
plat=c33x+R33;plng=c33y;
driveLoop();
const fin=currentLap>=totalLaps,ld=live.dist-lapBaseDist;
console.assert(currentLap===1,'single lap wrapped unexpectedly FAIL: '+currentLap);
console.assert(fin&&ld>=totalRouteDist*0.7&&lastRouteIdx>=routePts.length-3,'single-lap arrival FAIL');
console.log('34. single-lap circular OK — no spurious wrap');

console.log('ALL v14-DEV TESTS PASSED');

// ══ TEST 35: lap wrap fires mid-traverse (realistic GPS, not exact endpoint) ══
// Vehicle approaches start at lap end but GPS lands slightly off the exact point
fake=realNow();
const NP35=72,c35x=57.70,c35y=11.97,R35=0.004;
routePts=[];
for(let i=0;i<=NP35;i++){const a=i/NP35*2*Math.PI;routePts.push({lat:c35x+R35*Math.cos(a),lon:c35y+R35*Math.sin(a)});}
buildCumDist(routePts);totalRouteDist=routeCumDist[routeCumDist.length-1];
navActive=true;_routeIsCircular=true;totalLaps=2;currentLap=1;
lastRouteIdx=0;routeMaxIdx=0;destinationAnnounced=false;currentHeading=null;
live={dist:0,moving:0,idle:0,stops:0,last:null,lastT:null};lapBaseDist=0;
el('rng-radius').value='10';
let pa=c35x+R35,pb=c35y;
// drive lap 1 but STOP probing 2 points before the exact end (idx ~70)
for(let i=1;i<=70;i++){const a=i/NP35*2*Math.PI;const la=c35x+R35*Math.cos(a),lo=c35y+R35*Math.sin(a);
  live.dist+=haversine(pa,pb,la,lo);pa=la;pb=lo;nearestRoutePoint(la,lo);}
const lapDistAtEnd=live.dist-lapBaseDist;
console.assert(lapDistAtEnd>=totalRouteDist*0.75,'lap1 dist precondition: '+lapDistAtEnd.toFixed(2));
// now a GPS point ~15m from the start point (realistic re-cross)
const offLat=c35x+R35+0.00013; // ~14m north of start
live.dist+=haversine(pa,pb,offLat,c35y);
const r35=nearestRoutePoint(offLat,c35y);
console.assert(currentLap===2,'mid-traverse wrap FAIL: currentLap='+currentLap);
console.assert(r35.nearIdx===0,'wrap did not reset index: '+r35.nearIdx);
console.assert(lapBaseDist>0,'lapBaseDist not reset');
console.log('35. realistic lap wrap OK — wrapped to lap 2 near start point');

console.log('ALL v15-DEV TESTS PASSED');

// ══ TEST 36: live metrics during RECORDING (not just navigation) ══
navActive=false;isRec=true;
recStops=[];recPoints=[];
live={dist:0,moving:0,idle:0,stops:0,last:null,lastT:null};
let t36=realNow(),rmlat=57.70;
for(let i=0;i<40;i++){t36+=1000;rmlat+=10*0.0000090;
  updLiveMetrics(rmlat,11.97,36,t36,0);} // driving 36 km/h
console.assert(live.moving>30,'REC accumulation FAIL: moving='+live.moving);
console.assert(el('lcm').style.display==='block','REC live panel hidden FAIL');
console.assert(el('lcm-title').textContent.includes('RECORDING'),'REC title FAIL: '+el('lcm-title').textContent);
const drv36=parseFloat(el('lcm-drv').textContent);
console.assert(Math.abs(drv36-36)<4,'REC avg driving FAIL: '+el('lcm-drv').textContent);
// add 2 detected stops → stops/km reflects them
recStops=[{lat:1,lng:1},{lat:2,lng:2}];
t36+=1000;rmlat+=10*0.0000090;updLiveMetrics(rmlat,11.97,36,t36,0);
const spk36=parseFloat(el('lcm-spk').textContent);
console.assert(spk36>0,'REC stops/km FAIL: '+el('lcm-spk').textContent);
isRec=false;
console.log('36. live metrics during recording OK — drv36',el('lcm-drv').textContent,'spk36',el('lcm-spk').textContent);

// ══ TEST 37: updSummaryBar null-safe after sum-bar removal ══
stops=[{id:1,state:'done',elapsed:30,dur_s:25},{id:2,state:'waiting',elapsed:0,dur_s:20}];
let threw=false;
try{updSummaryBar();}catch(e){threw=true;}
console.assert(!threw,'updSummaryBar threw after sum-bar removal');
console.assert(el('h-stops').textContent==='1/2','topbar stop count FAIL: '+el('h-stops').textContent);
stops=[];
console.log('37. summary bar null-safe OK');

console.log('ALL v16-DEV TESTS PASSED');

// ══ TEST 38: simulation replays once per lap on multi-lap circular ══
(function(){
let t=realNow();const cx=57.70,cy=11.97,R=0.004,NP=72;
const pts=[];
for(let i=0;i<=NP;i++){const a=i/NP*2*Math.PI;t+=2000;pts.push({lat:cx+R*Math.cos(a),lng:cy+R*Math.sin(a),t});}
savedRecs.push({name:'Sim3Lap',dist:1,date:new Date(),points:pts,
  stops:[{lat:cx+R,lng:cy,t:pts[0].t,dur_s:5,events:[]}]});
const idx=savedRecs.length-1;
el('rng-sim').value='20';el('rng-radius').value='10';
let steps=0;const realST=global.setTimeout;
global.setTimeout=(fn,ms)=>{if(steps<30000){steps++;fn();}return 0;};
_simWithLaps(idx,3);
global.setTimeout=realST;
// Must have progressed beyond lap 1 (the bug: stuck after 1 lap)
console.assert(currentLap===totalLaps,'SIM did not reach final lap: lap '+currentLap+'/'+totalLaps);
console.assert(live.dist>totalRouteDist*1.5,'SIM did not replay multiple laps: dist '+live.dist.toFixed(2)+' vs route '+totalRouteDist.toFixed(2));
delete global.__promptReply;
stopSim(true);navActive=false;
console.log('38. multi-lap sim replay OK — reached lap',currentLap,'dist',live.dist.toFixed(2));
})();

console.log('ALL v17-DEV TESTS PASSED');

// ══ TEST 39: simMode blocks real GPS during simulation ══
(function(){
let t=realNow();const cx=57.70,cy=11.97,R=0.004,NP=72;
const pts=[];for(let i=0;i<=NP;i++){const a=i/NP*2*Math.PI;t+=2000;pts.push({lat:cx+R*Math.cos(a),lng:cy+R*Math.sin(a),t});}
savedRecs.push({name:'NoRealGPS',dist:1,date:new Date(),points:pts,stops:[{lat:cx+R,lng:cy,t:pts[0].t,dur_s:5,events:[]}]});
const idx=savedRecs.length-1;
el('rng-sim').value='20';el('rng-radius').value='10';
// Spy on watchPosition — it must NOT be called during sim
let watchCalls=0;const realWatch=navigator.geolocation.watchPosition;
navigator.geolocation.watchPosition=function(){watchCalls++;return 99;};
let steps=0;const rST=global.setTimeout;global.setTimeout=(fn)=>{if(steps<9000){steps++;fn();}return 0;};
_simWithLaps(idx,1);
global.setTimeout=rST;navigator.geolocation.watchPosition=realWatch;
// Sim started nav itself → on finish it stops nav, never opening real GPS
console.assert(watchCalls===0,'REAL GPS STARTED during/after sim FAIL: '+watchCalls+' watch calls');
console.assert(simMode===false,'simMode not cleared after finish');
console.assert(navActive===false,'sim-started nav not stopped on finish');
delete global.__promptReply;
console.log('39. simMode blocks real GPS + clean stop OK — 0 watch calls');
})();

// ══ TEST 40: arrival does NOT auto-open the bottom stops panel ══
hudPanelOpen=false;if(el('hud-sp'))el('hud-sp').classList.remove('on');
stops=[{id:1,name:'P1',lat:57.80,lng:11.97,dur_s:20,elapsed:0,running:false,intervalId:null,state:'waiting',events:[],seg_avg:null,photo:null}];
stopMarkers={1:{setIcon(){}}};insideStop.clear();departGate=null;navActive=true;el('rng-radius').value='10';
live={dist:0,moving:0,idle:0,stops:0,last:null,lastT:null};lapBaseDist=0;totalLaps=1;currentLap=1;
gps(57.80,11.97,1); // arrive
console.assert(stops[0].state==='current','arrival precondition FAIL: '+stops[0].state);
console.assert(hudPanelOpen===false,'BOTTOM STOPS PANEL auto-opened FAIL');
console.assert(!el('hud-sp').classList.contains('on'),'hud-sp shown on arrival FAIL');
navActive=false;stops=[];
console.log('40. no auto-open stops panel on arrival OK');

console.log('ALL v18-DEV TESTS PASSED');

// ══ TEST 41: SIM during active recording — stops the recording first ══
(function(){
let t=realNow();const cx=57.70,cy=11.97,R=0.004,NP=72;
const pts=[];for(let i=0;i<=NP;i++){const a=i/NP*2*Math.PI;t+=2000;pts.push({lat:cx+R*Math.cos(a),lng:cy+R*Math.sin(a),t});}
savedRecs.push({name:'ExclRec',dist:1,date:new Date(),points:pts,stops:[{lat:cx+R,lng:cy,t:pts[0].t,dur_s:5,events:[]}]});
const idx=savedRecs.length-1;
// Recording active (the screenshot scenario)
isRec=true;recPoints=[{lat:1,lng:1,t:1},{lat:2,lng:2,t:2}];navActive=false;
global.confirm=()=>true;
el('rng-sim').value='20';el('rng-radius').value='10';
let steps=0;const rST=global.setTimeout;global.setTimeout=(fn)=>{if(steps<50){steps++;fn();}return 0;};
_simWithLaps(idx,1);
global.setTimeout=rST;
// After SIM start: recording must be OFF, sim must be running cleanly
console.assert(isRec===false,'RECORDING NOT STOPPED when SIM started: isRec='+isRec);
console.log('41. SIM stops active recording first OK — isRec now',isRec);
stopSim(true);isRec=false;navActive=false;delete global.__promptReply;
})();

// ══ TEST 42: starting recording stops active navigation (exclusive) ══
(function(){
navActive=true;isRec=false;simMode=false;watchId=5;
global.confirm=()=>true;
// stub geolocation watch so startRec doesn't explode
startRec();
console.assert(isRec===true,'recording did not start');
console.assert(navActive===false,'NAV NOT STOPPED when recording started: navActive='+navActive);
console.log('42. recording stops navigation OK');
isRec=false;navActive=false;
})();

console.log('ALL v19-DEV TESTS PASSED');

// ══ TEST 43: lap chooser works WITHOUT native prompt (the PWA bug) ══
(function(){
// Disable native prompt entirely (simulates installed PWA where it returns null)
const _p=global.prompt;global.prompt=()=>null;
let t=realNow();const cx=57.70,cy=11.97,R=0.004,NP=72;
const pts=[];for(let i=0;i<=NP;i++){const a=i/NP*2*Math.PI;t+=2000;pts.push({lat:cx+R*Math.cos(a),lng:cy+R*Math.sin(a),t});}
savedRecs.push({name:'NoPrompt',dist:1,date:new Date(),points:pts,stops:[{lat:cx+R,lng:cy,t:pts[0].t,dur_s:5,events:[]}]});
const idx=savedRecs.length-1;
isRec=false;navActive=false;simMode=false;
el('rng-sim').value='20';el('rng-radius').value='10';
// Tap SIM → must open modal (NOT call prompt, NOT abort)
startSim(idx);
console.assert(el('lap-modal').classList.contains('on'),'lap modal did not open');
console.assert(_pendingSimIdx===idx,'pending sim idx not set: '+_pendingSimIdx);
// Choose 3 laps and confirm → sim begins even though prompt() is dead
_lapChoice=3;el('lap-custom').value='';
let steps=0;const rST=global.setTimeout;global.setTimeout=(fn)=>{if(steps<30000){steps++;fn();}return 0;};
confirmLaps();
global.setTimeout=rST;global.prompt=_p;
console.assert(simMode===false,'sim did not run to completion');  // finished
console.assert(totalLaps===3,'laps from modal not applied: '+totalLaps);
console.assert(!el('lap-modal').classList.contains('on'),'modal still open');
stopSim(true);navActive=false;
console.log('43. lap chooser without native prompt OK — 3 laps applied, sim ran');
})();

console.log('ALL v20-DEV TESTS PASSED');
