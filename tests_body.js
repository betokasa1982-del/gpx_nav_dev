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
// The stub is RESTORED afterwards: leaving a dead setView in place silently
// disabled map centring for every later test in the file.
const _realSetView=map.setView;
let svCalls=0; map.setView=(...a)=>{svCalls++;return _realSetView.apply(map,a);};
currentHeading=90; gps(57.706,11.97,30);
console.assert(svCalls>0,'follow/rotation branch FAIL — setView never called');
map.setView=_realSetView;
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
// UX v1 replaced the emoji text with SVG chips (spec §8/§11: do not depend on
// emojis in the driving UI). Assert the SEMANTIC outcome instead of the glyph:
// the Door event is represented and no other event is.
console.assert(/Open Door/.test(el('nsc-evt').innerHTML),'NSC events FAIL: '+el('nsc-evt').innerHTML);
console.assert(!/Kneeling|Hand Brake/.test(el('nsc-evt').innerHTML),'NSC events leaked other events');
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
startSim(simRecIdx);
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
startSim(s26idx);
console.assert(navActive===true,'SIM did not auto-start navigation (navActive false)');
console.assert(currentLoadedRec===s26idx,'SIM did not auto-load cycle: '+currentLoadedRec);
console.assert(routePts.length===s26pts.length,'SIM cycle not loaded into routePts');
console.log('26. SIM auto-nav OK — new HUD active during simulation');

console.log('ALL v11-DEV TESTS PASSED');

// ══ TEST 27: circular start/end stop dedup (the only change over stable v32) ══
(function(){
const fs=require('fs'),path=require('path');
const FX=path.join(__dirname,'real_cycle.json');
if(!fs.existsSync(FX)){console.log('27. circular start/end dedup SKIPPED — real_cycle.json fixture not in repo');return;}
const rec=JSON.parse(fs.readFileSync(FX,'utf8'));
const r=Array.isArray(rec)?rec[0]:rec;
savedRecs.push(r);const zi=savedRecs.length-1;
loadRec(zi);
// 7 recorded stops on this circular cycle → 6 after merging the co-located start/end
console.assert(stops.length===6,'dedup FAIL: expected 6 stops, got '+stops.length);
console.log('27. circular start/end dedup OK — 7 recorded → '+stops.length+' navigable');
})();

console.log('ALL v33-DEV TESTS PASSED');

// ══════════════════════════════════════════════════════════════════════════
//  NAVIGATION ENGINE v2 — matching / direction / stop-association tests
// ══════════════════════════════════════════════════════════════════════════
__group('Existing tests');
console.log('\n── navigation engine v2 ──');
// Earlier tests mutate the shared sliders (test 9 leaves the radius at 10 m).
// Pin every setting this suite depends on so the cases are order-independent.
el('rng-radius').value='80'; el('rng-auto').value='1';
el('rng-autostop').value='1'; el('rng-follow').value='1';

const mkL=()=>({addTo(){return this},setLatLngs(){},addLatLng(){},bringToFront(){},
                setIcon(){},setLatLng(){},getBounds:()=>({isValid:()=>true})});

/* Build an out-and-back route: north up a street, then back down a PARALLEL
   street `sepM` metres to the east. This is the field failure geometry. */
function buildOutAndBack(sepM){
  const lat0=57.700, lng0=11.970, N=120;
  const dLat=0.00009;                       // ~10 m per point
  const dLng=sepM/ (111320*Math.cos(lat0*Math.PI/180));
  const pts=[];
  for(let i=0;i<N;i++)   pts.push({lat:lat0+i*dLat, lon:lng0});          // outbound N
  for(let i=N-1;i>=0;i--)pts.push({lat:lat0+i*dLat, lon:lng0+dLng});     // return  S
  return pts;
}
function installRoute(pts){
  routePts=pts; buildCumDist(routePts);
  totalRouteDist=routeCumDist[routeCumDist.length-1];
  routeLayer=routeAheadLayer=routeRemainLayer=routeDoneLayer=mkL();
  buildRouteIndex(); resetMatcher();
  maneuvers=buildManeuvers(routePts);
  navActive=true; insideStop.clear(); departGate=null; lastRouteIdx=0;
}
/* feed a GPS fix with an explicit heading/accuracy */
function gpsH(lat,lng,kmh,hdg,acc){
  onGPS({coords:{latitude:lat,longitude:lng,accuracy:acc??8,altitude:30,
                 speed:kmh/3.6,heading:hdg},timestamp:(fake+=1000)});
}

// ── TEST A: two parallel streets 12 m apart — matcher must not swap legs ──
(function(){
  const pts=buildOutAndBack(12); installRoute(pts);
  isRec=false; stops=[]; stopMarkers={};
  // drive the outbound leg northbound (heading 0°)
  let maxSeg=0, swapped=false;
  for(let i=0;i<110;i++){
    gpsH(pts[i].lat, pts[i].lon, 30, 0);
    const seg=matchState?matchState.segmentIndex:0;
    if(seg>=pts.length/2) swapped=true;     // jumped onto the return leg
    maxSeg=Math.max(maxSeg,seg);
  }
  console.assert(!swapped,'A: matcher jumped to the RETURN leg while outbound (seg '+maxSeg+')');
  console.assert(maxSeg>80,'A: progress did not advance along the outbound leg: '+maxSeg);
  console.log('A. parallel streets 12 m — stayed on outbound leg OK (seg '+maxSeg+')');
})();

// ── TEST A2: the return leg must be matched once actually driven ──
(function(){
  const pts=buildOutAndBack(12); installRoute(pts);
  stops=[]; stopMarkers={};
  for(let i=0;i<120;i++)  gpsH(pts[i].lat,pts[i].lon,30,0);     // outbound, north
  for(let i=120;i<pts.length;i++) gpsH(pts[i].lat,pts[i].lon,30,180); // return, south
  console.assert(matchState.segmentIndex>150,'A2: never advanced onto the return leg: '+matchState.segmentIndex);
  console.log('A2. return leg matched after driving it OK (seg '+matchState.segmentIndex+')');
})();

// ── TEST B: same physical stop on two laps — sequence + gate + progress ──
(function(){
  const pts=[]; const lat0=57.70,lng0=11.97;
  for(let l=0;l<2;l++)                                    // two identical laps
    for(let i=0;i<80;i++) pts.push({lat:lat0+i*0.00009,lon:lng0});
  installRoute(pts);
  const SL=lat0+40*0.00009;
  stops=[{id:1,name:'Lap1',lat:SL,lng:lng0,dur_s:10,elapsed:0,running:false,intervalId:null,state:'waiting'},
         {id:2,name:'Lap2',lat:SL,lng:lng0,dur_s:10,elapsed:0,running:false,intervalId:null,state:'waiting'}];
  stopMarkers={1:{setIcon(){}},2:{setIcon(){}}};
  anchorStopsToRoute(null);
  console.assert(stops[0].routeDistanceM<stops[1].routeDistanceM,
    'B: co-located stops did not get distinct route distances');
  for(let i=0;i<=40;i++) gpsH(pts[i].lat,pts[i].lon,20,0);
  console.assert(stops[0].state==='current','B: lap-1 stop did not arrive: '+stops[0].state);
  console.assert(stops[1].state==='waiting','B: lap-2 stop armed too early');
  console.log('B. co-located multi-lap stops are independent OK ('+
    (stops[0].routeDistanceM/1000).toFixed(2)+' km vs '+(stops[1].routeDistanceM/1000).toFixed(2)+' km)');
})();

// ── TEST C: arriving from the WRONG direction must not trigger the stop ──
(function(){
  const pts=[]; for(let i=0;i<100;i++)pts.push({lat:57.70,lon:11.97+i*0.00017}); // eastbound
  installRoute(pts);
  const S=pts[50];
  stops=[{id:1,name:'S',lat:S.lat,lng:S.lon,dur_s:10,elapsed:0,running:false,intervalId:null,state:'waiting'}];
  stopMarkers={1:{setIcon(){}}};
  anchorStopsToRoute(null);
  console.assert(Math.abs(angleDiff(stops[0].approachBearing,90))<15,
    'C: approachBearing wrong: '+stops[0].approachBearing);
  // approach the same coordinate travelling WEST (bearing ~270°)
  for(let i=60;i>=50;i--) gpsH(pts[i].lat,pts[i].lon,25,270);
  const v=isValidStopArrival(stops[0],matchState,calculateMovementBearing(),80,0,8);
  console.assert(v.reason==='WRONG_DIRECTION'||stops[0].state==='waiting',
    'C: stop accepted from the wrong direction ('+v.reason+' / '+stops[0].state+')');
  console.log('C. wrong-direction approach rejected OK ('+v.reason+')');
})();

// ── TEST D: same stop, correct direction → arrival ──
(function(){
  const pts=[]; for(let i=0;i<100;i++)pts.push({lat:57.70,lon:11.97+i*0.00017});
  installRoute(pts);
  const S=pts[50];
  stops=[{id:1,name:'S',lat:S.lat,lng:S.lon,dur_s:10,elapsed:0,running:false,intervalId:null,state:'waiting'}];
  stopMarkers={1:{setIcon(){}}};
  anchorStopsToRoute(null);
  for(let i=40;i<=50;i++) gpsH(pts[i].lat,pts[i].lon,25,90);   // eastbound, as recorded
  console.assert(stops[0].state==='current','D: correct-direction arrival FAILED: '+stops[0].state);
  console.log('D. correct-direction approach arrives OK');
})();

// ── TEST E: GPS jitter at a stop — no progress jump, no extra arrival ──
(function(){
  const pts=[]; for(let i=0;i<160;i++)pts.push({lat:57.70+i*0.00009,lon:11.97});
  installRoute(pts);
  const S=pts[60];
  stops=[{id:1,name:'A',lat:S.lat,lng:S.lon,dur_s:10,elapsed:0,running:false,intervalId:null,state:'waiting'},
         {id:2,name:'B',lat:pts[140].lat,lng:pts[140].lon,dur_s:10,elapsed:0,running:false,intervalId:null,state:'waiting'}];
  stopMarkers={1:{setIcon(){}},2:{setIcon(){}}};
  anchorStopsToRoute(null);
  for(let i=50;i<=60;i++) gpsH(pts[i].lat,pts[i].lon,20,0);
  const progAtStop=routeProgressM, manBefore=maneuvers.length;
  for(let i=0;i<30;i++)                                    // ±5 m jitter, parked
    gpsH(S.lat+((i%3)-1)*0.000045, S.lon+((i*7%3)-1)*0.000045, 1, (i*57)%360);
  console.assert(Math.abs(routeProgressM-progAtStop)<40,
    'E: jitter moved route progress by '+(routeProgressM-progAtStop).toFixed(0)+' m');
  console.assert(stops[1].state==='waiting','E: jitter armed the next stop');
  console.assert(maneuvers.length===manBefore,'E: jitter created maneuvers');
  console.log('E. parked jitter absorbed OK (Δprogress '+(routeProgressM-progAtStop).toFixed(1)+' m)');
})();

// ── TEST F: poor accuracy must lower confidence, not force a leg swap ──
(function(){
  const pts=buildOutAndBack(12); installRoute(pts);
  stops=[]; stopMarkers={};
  for(let i=0;i<60;i++) gpsH(pts[i].lat,pts[i].lon,30,0,6);        // good fix
  const segGood=matchState.segmentIndex;
  let swapped=false, sawLowConf=false;
  for(let i=60;i<90;i++){
    gpsH(pts[i].lat,pts[i].lon,30,0,60);                            // accuracy 60 m
    if(matchState.segmentIndex>=pts.length/2)swapped=true;
    if(matchState.confidence!=='HIGH')sawLowConf=true;
  }
  console.assert(!swapped,'F: bad accuracy caused a leg swap');
  console.assert(sawLowConf,'F: confidence stayed HIGH at 60 m accuracy');
  console.log('F. degraded accuracy → lower confidence, no swap OK (seg '+segGood+'→'+matchState.segmentIndex+')');
})();

// ── TEST G: invalid / absent GPS heading at low speed ──
(function(){
  const pts=[]; for(let i=0;i<80;i++)pts.push({lat:57.70+i*0.00009,lon:11.97});
  installRoute(pts);
  stops=[]; stopMarkers={};
  [null,NaN,180,0].forEach((hv,k)=>{ for(let i=k*10;i<k*10+10;i++) gpsH(pts[i].lat,pts[i].lon,3,hv); });
  console.assert(matchState&&matchState.segmentIndex>=25,
    'G: matching collapsed with bad heading: '+(matchState&&matchState.segmentIndex));
  const hd=getReliableHeading(3,180);
  console.assert(hd.source!=='GPS','G: GPS heading trusted at 3 km/h');
  console.log('G. bad/absent heading handled OK (source '+hd.source+', seg '+matchState.segmentIndex+')');
})();

// ── TEST H: a real, sustained U-turn IS reported ──
(function(){
  const pts=[];
  for(let i=0;i<60;i++) pts.push({lat:57.70+i*0.00027,lon:11.97});              // north 1.8 km
  for(let i=1;i<=60;i++)pts.push({lat:57.70+(60-i)*0.00027,lon:11.9703});       // back south
  buildCumDist(pts); totalRouteDist=routeCumDist[routeCumDist.length-1];
  const ms=buildManeuvers(pts).filter(m=>m.type!=='arrive');
  console.assert(ms.some(m=>m.type==='uturn'||m.type==='shl'||m.type==='shr'),
    'H: real U-turn not detected: '+JSON.stringify(ms.map(m=>m.type)));
  console.log('H. sustained U-turn detected OK ('+ms.map(m=>m.type).join(',')+')');
})();

// ── TEST I: a 90° corner is exactly ONE turn ──
(function(){
  const pts=[];
  for(let i=0;i<=80;i++)pts.push({lat:57.70+i*0.00013,lon:11.97});
  for(let i=1;i<=80;i++)pts.push({lat:57.70+80*0.00013,lon:11.97+i*0.00024});
  buildCumDist(pts); totalRouteDist=routeCumDist[routeCumDist.length-1];
  const ms=buildManeuvers(pts).filter(m=>m.type!=='arrive');
  console.assert(ms.length===1&&ms[0].type==='right',
    'I: 90° corner produced '+JSON.stringify(ms.map(m=>m.type)));
  console.log('I. 90° corner = one right turn OK');
})();

// ── TEST J: a gentle 12° bend produces no maneuver ──
(function(){
  const pts=[];
  for(let i=0;i<=80;i++)pts.push({lat:57.70+i*0.00013,lon:11.97});
  const bLat=57.70+80*0.00013, r=12*Math.PI/180;
  for(let i=1;i<=80;i++)pts.push({lat:bLat+i*0.00013*Math.cos(r),lon:11.97+i*0.00013*Math.sin(r)*1.86});
  buildCumDist(pts); totalRouteDist=routeCumDist[routeCumDist.length-1];
  const ms=buildManeuvers(pts).filter(m=>m.type!=='arrive');
  console.assert(ms.length===0,'J: gentle bend produced maneuvers: '+JSON.stringify(ms.map(m=>m.type)));
  console.log('J. 12° bend produces no maneuver OK');
})();

// ── TEST K: single-sample teleport must not be accepted immediately ──
(function(){
  const pts=[]; for(let i=0;i<400;i++)pts.push({lat:57.70+i*0.00009,lon:11.97});
  installRoute(pts);
  stops=[]; stopMarkers={};
  for(let i=0;i<40;i++) gpsH(pts[i].lat,pts[i].lon,30,0);
  const before=routeProgressM;
  gpsH(pts[350].lat,pts[350].lon,30,0);                 // one bogus fix ~2.8 km ahead
  console.assert(Math.abs(routeProgressM-before)<NAV.JUMP_M,
    'K: single sample moved progress by '+((routeProgressM-before)/1000).toFixed(2)+' km');
  // sustained evidence → the jump is eventually accepted (driver really is there)
  for(let i=350;i<358;i++) gpsH(pts[i].lat,pts[i].lon,30,0);
  console.assert(routeProgressM>before+1000,'K: confirmed relocation never accepted');
  console.log('K. progress jump needs confirmation OK');
})();

// ── TEST L: departure gate needs route progress, not just distance ──
(function(){
  const pts=[]; for(let i=0;i<200;i++)pts.push({lat:57.70+i*0.00009,lon:11.97});
  installRoute(pts);
  const S=pts[60];
  stops=[{id:1,name:'A',lat:S.lat,lng:S.lon,dur_s:5,elapsed:0,running:false,intervalId:null,state:'waiting'},
         {id:2,name:'A2',lat:S.lat,lng:S.lon,dur_s:5,elapsed:0,running:false,intervalId:null,state:'waiting'}];
  stopMarkers={1:{setIcon(){}},2:{setIcon(){}}};
  anchorStopsToRoute(null);
  for(let i=52;i<=60;i++) gpsH(pts[i].lat,pts[i].lon,15,0);
  console.assert(stops[0].state==='current','L: first stop did not arrive');
  markDone(1);
  console.assert(departGate&&departGate.routeDistanceM!=null,'L: gate has no route anchor');
  for(let i=0;i<10;i++) gpsH(S.lat+((i%3)-1)*0.00004,S.lon,1,(i*33)%360);  // jitter in place
  console.assert(stops[1].state==='waiting','L: gate released by jitter alone');
  console.log('L. departure gate is route-anchored OK');
})();

console.log('ALL NAVIGATION-ENGINE TESTS PASSED');
// ── TEST M: matcher must stay cheap on a dense route (driving device) ──
(function(){
  const pts=[]; for(let i=0;i<6000;i++)pts.push({lat:57.70+i*0.00003,lon:11.97+ (i%2)*0.000001});
  routePts=pts; buildCumDist(routePts); totalRouteDist=routeCumDist[routeCumDist.length-1];
  const t0=Date.now(); buildRouteIndex(); const tIdx=Date.now()-t0;
  resetMatcher();
  const t1=Date.now();
  for(let i=0;i<3000;i++){
    _posHist.push({lat:pts[i].lat,lng:pts[i].lon,t:i*1000}); if(_posHist.length>12)_posHist.shift();
    matchPositionToRoute(pts[i].lat,pts[i].lon,0,30,8);
  }
  const per=(Date.now()-t1)/3000;
  console.log(`M. perf OK — index ${tIdx} ms · match ${per.toFixed(3)} ms/fix on a 6000-pt route`);
  console.assert(per<2,'matcher too slow per GPS fix: '+per);
})();

// ══════════════════════════════════════════════════════════════════════════
//  STOP ACCEPTANCE HARDENING — bounded tolerance, persistence, LOW gate
// ══════════════════════════════════════════════════════════════════════════
__group('Navigation tests');
console.log('\n── stop acceptance hardening ──');

// ── N1: tolerance must stay capped under "big radius + bad accuracy" ──
(function(){
  // pure function check first: no combination may exceed MAX
  let worst=0;
  [10,80,150,200].forEach(r=>[5,25,50,120].forEach(a=>
    ['HIGH','MEDIUM','LOW'].forEach(c=>{
      const t=stopAlongToleranceM(r,a,c);
      worst=Math.max(worst,t);
      console.assert(t>=NAV.MIN_STOP_ALONG_TOL_M&&t<=NAV.MAX_STOP_ALONG_TOL_M,
        `N1: tolerance ${t.toFixed(0)} m out of bounds (r=${r} acc=${a} ${c})`);
    })));
  console.assert(worst<=NAV.MAX_STOP_ALONG_TOL_M,'N1: cap breached: '+worst);

  // behavioural check: a stop 120 m away ALONG THE ROUTE is refused even
  // though the vehicle sits inside a 200 m radius with 50 m accuracy
  el('rng-radius').value='200';
  const pts=[]; for(let i=0;i<300;i++)pts.push({lat:57.70+i*0.00009,lon:11.97});
  installRoute(pts);
  const S=pts[150];
  stops=[{id:1,name:'S',lat:S.lat,lng:S.lon,dur_s:10,elapsed:0,running:false,intervalId:null,state:'waiting'}];
  stopMarkers={1:{setIcon(){}}};
  anchorStopsToRoute(null);
  // drive only to index 138 → ~120 m short of the stop on the route,
  // but well inside the (inflated) physical radius
  for(let i=120;i<=138;i++) gpsH(pts[i].lat,pts[i].lon,15,0,50);
  const dPhys=haversine(pts[138].lat,pts[138].lon,S.lat,S.lon)*1000;
  console.assert(dPhys<200*1.8,'N1: setup wrong — vehicle not inside the radius');
  console.assert(stops[0].state==='waiting',
    'N1: stop accepted 120 m off its route position (state '+stops[0].state+')');
  console.log(`N1. tolerance capped at ${worst.toFixed(0)} m; stop ${dPhys.toFixed(0)} m away physically, `+
              `120 m off-route → refused OK`);
  el('rng-radius').value='80';
})();

// ── N2: one sample must not arrive; consecutive samples must ──
(function(){
  // Points are ~10 m apart. Radius 25 m and speed 30 km/h (no 1.8x inflation)
  // put the acceptance boundary between index 97 and 99 — unambiguous.
  el('rng-radius').value='25';
  const pts=[]; for(let i=0;i<200;i++)pts.push({lat:57.70+i*0.00009,lon:11.97});
  installRoute(pts);
  const S=pts[100];
  stops=[{id:1,name:'S',lat:S.lat,lng:S.lon,dur_s:10,elapsed:0,running:false,intervalId:null,state:'waiting'}];
  stopMarkers={1:{setIcon(){}}};
  anchorStopsToRoute(null);
  for(let i=90;i<=97;i++) gpsH(pts[i].lat,pts[i].lon,30,0);   // approach: 100 m → 30 m, outside
  console.assert(stops[0].state==='waiting','N2: arrived before reaching the stop');
  console.assert(stopArrivalCandidate===null,'N2: candidate opened while still outside');
  gpsH(pts[99].lat,pts[99].lon,30,0);                         // FIRST valid sample (10 m)
  console.assert(stops[0].state==='waiting',
    'N2: single sample confirmed the arrival (state '+stops[0].state+')');
  console.assert(stopArrivalCandidate&&stopArrivalCandidate.count===1,
    'N2: no pending candidate after the first valid sample');
  gpsH(S.lat,S.lon,30,0);                                     // SECOND valid sample (0 m)
  console.assert(stops[0].state==='current','N2: arrival never confirmed: '+stops[0].state);
  console.assert(stopArrivalCandidate===null,'N2: candidate not cleared after confirmation');
  console.log('N2. arrival needs '+NAV.ARRIVE_CONFIRM+' consecutive samples OK');
  el('rng-radius').value='80';
})();

// ── N3: a GPS jump into the radius while the matcher is elsewhere ──
(function(){
  const pts=[]; for(let i=0;i<400;i++)pts.push({lat:57.70+i*0.00009,lon:11.97});
  installRoute(pts);
  const S=pts[300];
  stops=[{id:1,name:'S',lat:S.lat,lng:S.lon,dur_s:10,elapsed:0,running:false,intervalId:null,state:'waiting'}];
  stopMarkers={1:{setIcon(){}}};
  anchorStopsToRoute(null);
  for(let i=0;i<=60;i++) gpsH(pts[i].lat,pts[i].lon,30,0);     // matcher settled at ~600 m
  const progBefore=routeProgressM;
  gpsH(S.lat,S.lon,30,0);                                      // teleport onto the stop
  gpsH(S.lat,S.lon,30,0);                                      // and hold it
  console.assert(stops[0].state==='waiting',
    'N3: stop accepted from a teleport while the matcher was elsewhere: '+stops[0].state);
  console.assert(Math.abs(routeProgressM-progBefore)<NAV.JUMP_M,
    'N3: progress followed the teleport: '+((routeProgressM-progBefore)).toFixed(0)+' m');
  console.log('N3. physical jump into the radius refused while off-route OK');
})();

// ── N4: LOW matcher confidence must not promote a stop ──
(function(){
  const pts=[]; for(let i=0;i<200;i++)pts.push({lat:57.70+i*0.00009,lon:11.97});
  installRoute(pts);
  const S=pts[100];
  stops=[{id:1,name:'S',lat:S.lat,lng:S.lon,dur_s:10,elapsed:0,running:false,intervalId:null,state:'waiting'}];
  stopMarkers={1:{setIcon(){}}};
  anchorStopsToRoute(null);
  // unit-level: the validator refuses regardless of a zero physical distance
  const lowMatch={confidence:'LOW',routeDistanceM:stops[0].routeDistanceM,reason:'JUMP_PENDING'};
  const v=isValidStopArrival(stops[0],lowMatch,null,144,0,8,80);
  console.assert(!v.ok&&v.reason==='LOW_CONFIDENCE',
    'N4: LOW confidence accepted at distance 0 ('+v.reason+')');
  console.assert(v.hard===false,'N4: LOW should be a soft failure (decay, not wipe)');
  // and it recovers once confidence returns
  const okMatch={confidence:'HIGH',routeDistanceM:stops[0].routeDistanceM};
  console.assert(isValidStopArrival(stops[0],okMatch,null,144,0,8,80).ok,
    'N4: HIGH confidence still refused');
  // unanchored stops keep the legacy distance-only path
  const bare={id:9,name:'bare',lat:S.lat,lng:S.lon};
  console.assert(isValidStopArrival(bare,lowMatch,null,144,0,8,80).ok,
    'N4: unanchored stop blocked by LOW confidence');
  console.log('N4. LOW confidence blocks promotion, recovers on HIGH OK');
})();

console.log('ALL STOP-ACCEPTANCE TESTS PASSED');

// ══════════════════════════════════════════════════════════════════════════
//  TIMESTAMP ANCHORING — internal recordings must never use geometry
// ══════════════════════════════════════════════════════════════════════════
__group('Stop tests');
console.log('\n── timestamp anchoring ──');

const T0=1700000000000, LAT0=57.700, LNG0=11.970, DLAT=0.00009; // ~10 m / point

/* Build a timestamped recording. `shape` returns {lat,lng} for index i. */
function mkRec(name,n,shape,stopIdxs,opts){
  const pts=[]; let t=T0;
  for(let i=0;i<n;i++){const p=shape(i);pts.push({lat:p.lat,lng:p.lng,t,speed:8,alt:30});t+=1000;}
  const stops=(stopIdxs||[]).map(i=>{
    const s={lat:pts[i].lat,lng:pts[i].lng,t:pts[i].t+3000,startT:pts[i].t,
             dur_s:20,events:[],photo:null};
    if(opts&&opts.stripTime){delete s.t;delete s.startT;}
    return s;
  });
  return {name,date:new Date(T0).toISOString(),dist:n*0.01,points:pts,stops};
}
/* Independent reference implementations — what each mode SHOULD produce. */
function timestampIndex(rec,s){
  const st=s.startT??s.t; if(st==null)return null;
  let lo=0,hi=rec.points.length-1;
  while(lo<hi){const m=(lo+hi)>>1;(rec.points[m].t<st)?lo=m+1:hi=m;}
  return lo;
}
function geometricIndex(rec,s,from){
  let best=from||0,bd=Infinity;
  for(let i=best;i<rec.points.length;i++){
    const d=haversine(rec.points[i].lat,rec.points[i].lng,s.lat,s.lng);
    if(d<bd){bd=d;best=i;}
  }
  return best;
}
function loadFresh(rec){savedRecs.push(rec);loadRec(savedRecs.length-1);}

// ── T1: A → B → A, stop on the SECOND passage of A ──────────────────────
(function(){
  const N=200;                                   // 0..99 north, 100..199 back south
  const shape=i=>i<100?{lat:LAT0+i*DLAT,lng:LNG0}
                      :{lat:LAT0+(199-i)*DLAT,lng:LNG0};
  const rec=mkRec('A-B-A',N,shape,[199]);        // stop at the FINAL A
  loadFresh(rec);
  const s=stops[0], ti=timestampIndex(rec,rec.stops[0]), gi=geometricIndex(rec,rec.stops[0],0);
  console.assert(s.anchorMode==='TIMESTAMP','T1: internal recording used '+s.anchorMode);
  console.assert(s.routeIndex===ti,'T1: routeIndex '+s.routeIndex+' != timestamp truth '+ti);
  console.assert(ti!==gi,'T1: scenario is not discriminating (ts '+ti+' == geo '+gi+')');
  console.assert(s.routeDistanceM>1500,
    'T1: anchored to the FIRST passage: '+(s.routeDistanceM/1000).toFixed(2)+' km');
  console.assert(Math.abs(angleDiff(s.approachBearing,180))<20,
    'T1: approachBearing is the outbound direction: '+s.approachBearing);
  console.log(`T1. second passage of A: idx ${s.routeIndex} (geo would say ${gi}), `+
              `${(s.routeDistanceM/1000).toFixed(2)} km, bearing ${s.approachBearing.toFixed(0)}° OK`);
})();

// ── T2: out-and-back on the SAME street, one stop per direction ─────────
(function(){
  const N=200;
  const shape=i=>i<100?{lat:LAT0+i*DLAT,lng:LNG0}
                      :{lat:LAT0+(199-i)*DLAT,lng:LNG0};
  // A depot stop at idx 10 keeps X and Y off the first/last positions, so the
  // circular start/end dedup (which merges a co-located first+last pair) does
  // not consume them. See the report note on that interaction.
  const rec=mkRec('narrow street',N,shape,[10,50,149]);  // depot, X outbound, Y return
  const gap=haversine(rec.stops[1].lat,rec.stops[1].lng,
                      rec.stops[2].lat,rec.stops[2].lng)*1000;
  console.assert(gap<5,'T2: stops are '+gap.toFixed(1)+' m apart, scenario too easy');
  loadFresh(rec);
  console.assert(stops.length===3,'T2: expected 3 stops, got '+stops.length);
  const X=stops[1], Y=stops[2];
  console.assert(X.anchorMode==='TIMESTAMP'&&Y.anchorMode==='TIMESTAMP','T2: not timestamp-anchored');
  console.assert(Y.routeDistanceM-X.routeDistanceM>800,
    'T2: X and Y collapsed onto the same passage: '+
    (X.routeDistanceM/1000).toFixed(2)+' / '+(Y.routeDistanceM/1000).toFixed(2)+' km');
  const dirErr=Math.abs(angleDiff(X.approachBearing,Y.approachBearing));
  console.assert(dirErr>150,'T2: approach bearings not opposed: '+dirErr.toFixed(0)+'°');
  console.log(`T2. same street both ways (${gap.toFixed(1)} m apart): `+
    `X ${(X.routeDistanceM/1000).toFixed(2)} km @${X.approachBearing.toFixed(0)}°, `+
    `Y ${(Y.routeDistanceM/1000).toFixed(2)} km @${Y.approachBearing.toFixed(0)}° OK`);
})();

// ── T3: stop recorded ONLY on the second lap (the audit case) ───────────
(function(){
  const N=240;                                   // two identical 120-point laps
  const shape=i=>({lat:LAT0+(i%120)*DLAT,lng:LNG0});
  const rec=mkRec('lap2-only',N,shape,[160]);    // A visited twice, stopped once
  loadFresh(rec);
  const s=stops[0], ti=timestampIndex(rec,rec.stops[0]), gi=geometricIndex(rec,rec.stops[0],0);
  console.assert(s.anchorMode==='TIMESTAMP','T3: fell back to '+s.anchorMode);
  console.assert(s.routeIndex===ti,'T3: routeIndex '+s.routeIndex+' != '+ti);
  console.assert(s.routeIndex!==gi,'T3: matched the first geometric occurrence '+gi);
  // and the arrival gate now accepts the real passage
  const tol=stopAlongToleranceM(80,8,'HIGH');
  console.assert(Math.abs(routeCumM[ti]-s.routeDistanceM)<tol,'T3: gate would still reject');
  console.log(`T3. lap-2-only stop: idx ${s.routeIndex} = ${(s.routeDistanceM/1000).toFixed(2)} km `+
              `(geometry would say ${gi} = ${(routeCumM[gi]/1000).toFixed(2)} km) OK`);
})();

// ── T4: timestampIndex vs geometricIndex — official answer is timestamp ──
(function(){
  const N=200;
  const shape=i=>i<100?{lat:LAT0+i*DLAT,lng:LNG0}:{lat:LAT0+(199-i)*DLAT,lng:LNG0};
  const rec=mkRec('retrace',N,shape,[150]);
  loadFresh(rec);
  const ti=timestampIndex(rec,rec.stops[0]), gi=geometricIndex(rec,rec.stops[0],0);
  console.assert(ti!==gi,'T4: indices agree, scenario not discriminating');
  console.assert(stops[0].routeIndex===ti,
    `T4: official answer ${stops[0].routeIndex} is not the timestamp index ${ti} (geo=${gi})`);
  console.log(`T4. timestampIndex=${ti} vs geometricIndex=${gi} → official ${stops[0].routeIndex} OK`);
})();

// ── T5: full round trip recording → JSON → load must keep the anchor ────
(function(){
  const N=240;
  const shape=i=>({lat:LAT0+(i%120)*DLAT,lng:LNG0});
  const rec=mkRec('roundtrip',N,shape,[160]);
  loadFresh(rec);
  const before={idx:stops[0].routeIndex,dist:stops[0].routeDistanceM,brg:stops[0].approachBearing};
  const wire=JSON.parse(JSON.stringify(recToPlain(rec)));   // export → import
  console.assert(wire.stops[0].startT!=null,'T5: startT lost in the JSON round trip');
  console.assert(wire.points[0].t!=null,'T5: point timestamps lost in the JSON round trip');
  loadFresh(wire);
  console.assert(stops[0].anchorMode==='TIMESTAMP','T5: reloaded copy used '+stops[0].anchorMode);
  console.assert(stops[0].routeIndex===before.idx&&
                 Math.abs(stops[0].routeDistanceM-before.dist)<1,
    'T5: anchor moved across the round trip');
  console.log('T5. recording → JSON → load keeps the anchor OK ('+
              (stops[0].routeDistanceM/1000).toFixed(2)+' km, mode '+stops[0].anchorMode+')');
})();

// ── T6: external GPX (no timestamps) must still use the geometric path ──
(function(){
  const N=200;
  const shape=i=>i<100?{lat:LAT0+i*DLAT,lng:LNG0}:{lat:LAT0+(199-i)*DLAT,lng:LNG0};
  const rec=mkRec('no-time',N,shape,[50],{stripTime:true});
  rec.points.forEach(p=>delete p.t);                        // a GPX track has no time
  loadFresh(rec);
  console.assert(stops[0].anchorMode==='GEOMETRIC','T6: expected GEOMETRIC, got '+stops[0].anchorMode);
  console.assert(stops[0].routeDistanceM!=null&&stops[0].approachBearing!=null,
    'T6: geometric fallback produced no anchor');
  console.assert(navAnchorWarning===null,'T6: spurious warning for a genuinely timeless route');
  console.log('T6. timeless route → GEOMETRIC fallback, no warning OK');
})();

// ── T7: guardrail — route has time, stop does not ───────────────────────
(function(){
  const N=200;
  const shape=i=>({lat:LAT0+i*DLAT,lng:LNG0});
  const rec=mkRec('missing-stop-time',N,shape,[100],{stripTime:true}); // points keep t
  loadFresh(rec);
  console.assert(stops[0].anchorMode==='GEOMETRIC','T7: should degrade to geometry');
  console.assert(navAnchorWarning&&navAnchorWarning.indexOf('STOP_TIMESTAMP_MISSING')===0,
    'T7: guardrail did not fire: '+navAnchorWarning);
  console.log('T7. guardrail fires: '+navAnchorWarning+' OK');
  // and a healthy recording clears it again
  loadFresh(mkRec('healthy',N,shape,[100]));
  console.assert(navAnchorWarning===null,'T7: warning not cleared on a healthy recording');
  console.assert(anchorModeSummary.mode==='TIMESTAMP','T7: mode summary wrong: '+anchorModeSummary.mode);
  console.log('T7b. warning clears; anchorModeSummary.mode='+anchorModeSummary.mode+' OK');
})();

console.log('ALL TIMESTAMP-ANCHORING TESTS PASSED');
__group('Timestamp anchoring tests');

// ══════════════════════════════════════════════════════════════════════════
//  CIRCULAR STOP DEDUP — co-location is not proof of the same event
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── circular stop dedup ──');

/* south approach → A → north to B → back through A → south exit.
   A is passed TWICE mid-route; the track neither starts nor ends there. */
function mkThroughRoute(){
  const A=40, B=140;                                   // indices of A (out) and B
  const shape=i=>i<=B?{lat:LAT0+i*DLAT,lng:LNG0}       // north 0..140
                     :{lat:LAT0+(2*B-i)*DLAT,lng:LNG0};// back south 141..280
  return {shape,n:281,Aout:A,Aback:2*B-A};             // A on the way back = 240
}

// ── DEDUP-1: same coordinate, very different startT, distinct events ─────
(function(){
  const {shape,n,Aout,Aback}=mkThroughRoute();
  const rec=mkRec('dedup1',n,shape,[Aout,Aback]);
  const gap=haversine(rec.stops[0].lat,rec.stops[0].lng,rec.stops[1].lat,rec.stops[1].lng)*1000;
  const dt=(rec.stops[1].startT-rec.stops[0].startT)/1000;
  console.assert(gap<1,'DEDUP-1: stops not co-located ('+gap.toFixed(1)+' m)');
  loadFresh(rec);
  console.assert(stops.length===2,'DEDUP-1: a stop was deleted — got '+stops.length);
  console.assert(dedupDecision&&dedupDecision.merged===false,
    'DEDUP-1: merged despite distinct events ('+(dedupDecision&&dedupDecision.reason)+')');
  console.log(`DEDUP-1. same coordinate (${gap.toFixed(1)} m), Δt ${dt}s → both kept OK `+
              `[${dedupDecision.reason}]`);
})();

// ── DEDUP-2: legitimate depot — track starts and ends parked at D ────────
(function(){
  // parked at D, drive a loop, return and park at D again
  const pts=[]; let t=T0;
  const push=(lat,lng)=>{pts.push({lat,lng,t,speed:0,alt:30});t+=1000;};
  for(let i=0;i<6;i++)  push(LAT0,LNG0);                       // parked at depot
  for(let i=1;i<=60;i++)push(LAT0+i*DLAT,LNG0);                // out
  for(let i=59;i>=1;i--)push(LAT0+i*DLAT,LNG0+0.0004);         // back on a parallel street
  for(let i=0;i<6;i++)  push(LAT0,LNG0);                       // parked at depot again
  const mid=Math.floor(pts.length/2);
  const mk=i=>({lat:pts[i].lat,lng:pts[i].lng,t:pts[i].t+3000,startT:pts[i].t,
                dur_s:20,events:[],photo:null});
  const rec={name:'depot',date:new Date(T0).toISOString(),dist:1.2,points:pts,
             stops:[mk(0),mk(30),mk(mid),mk(pts.length-1)]};   // D, normal, normal, D
  loadFresh(rec);
  console.assert(stops.length===3,'DEDUP-2: depot pair not merged — got '+stops.length+' stops');
  console.assert(dedupDecision&&dedupDecision.merged===true&&dedupDecision.reason==='DEPOT_START_END',
    'DEDUP-2: wrong decision '+(dedupDecision&&dedupDecision.reason));
  console.assert(stops[0].startT===rec.stops[0].startT,
    'DEDUP-2: merged stop did not keep the START-of-cycle event');
  console.assert(stops[0].routeDistanceM<100,
    'DEDUP-2: merged depot anchored away from the cycle start: '+stops[0].routeDistanceM.toFixed(0)+' m');
  console.log('DEDUP-2. genuine depot merged (4→3), start event preserved, anchored at '+
              stops[0].routeDistanceM.toFixed(0)+' m OK');
})();

// ── DEDUP-3: out-and-back, A on the way out and A on the way back ────────
(function(){
  const {shape,n,Aout,Aback}=mkThroughRoute();
  const rec=mkRec('dedup3',n,shape,[Aout,Aback]);
  loadFresh(rec);
  console.assert(stops.length===2,'DEDUP-3: X and Y collapsed into '+stops.length+' stop(s)');
  const [X,Y]=stops;
  // §9 — anchoring must place them on the correct passages, in opposite senses
  console.assert(X.anchorMode==='TIMESTAMP'&&Y.anchorMode==='TIMESTAMP',
    'DEDUP-3: not timestamp-anchored');
  console.assert(Y.routeDistanceM-X.routeDistanceM>1500,
    'DEDUP-3: same passage — X '+(X.routeDistanceM/1000).toFixed(2)+
    ' km, Y '+(Y.routeDistanceM/1000).toFixed(2)+' km');
  const opp=Math.abs(angleDiff(X.approachBearing,Y.approachBearing));
  console.assert(opp>150,'DEDUP-3: approach bearings not opposed: '+opp.toFixed(0)+'°');
  console.log(`DEDUP-3. A twice, 0 m apart → X ${(X.routeDistanceM/1000).toFixed(2)} km @`+
    `${X.approachBearing.toFixed(0)}°, Y ${(Y.routeDistanceM/1000).toFixed(2)} km @`+
    `${Y.approachBearing.toFixed(0)}° OK`);
})();

// ── DEDUP-4: first and last 5 m apart but distinct events ────────────────
(function(){
  const {shape,n}=mkThroughRoute();
  const rec=mkRec('dedup4',n,shape,[40,240]);
  rec.stops[1].lat=rec.stops[0].lat+0.000045;          // ~5 m north of the first
  loadFresh(rec);
  console.assert(stops.length===2,'DEDUP-4: merged two distinct events 5 m apart');
  console.assert(dedupDecision.reason==='CO_LOCATED_BUT_NOT_DEPOT',
    'DEDUP-4: unexpected reason '+dedupDecision.reason);
  console.log('DEDUP-4. 5 m apart, not start/end of the track → both kept OK');
})();

// ── DEDUP-5: guard the unit rule itself ──────────────────────────────────
(function(){
  const {shape,n}=mkThroughRoute();
  const rec=mkRec('unit',n,shape,[40,240]);
  console.assert(isDepotPair(rec.points,rec.stops[0],rec.stops[1])===false,
    'DEDUP-5: mid-route pair judged a depot');
  // an OPEN track (A → B, never returns): its two ends are 1.8 km apart,
  // so even stops sitting exactly at both ends are not a depot pair
  const open=mkRec('open',200,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[0,199]);
  console.assert(isDepotPair(open.points,open.stops[0],open.stops[1])===false,
    'DEDUP-5: open-ended track judged a loop');
  // and the closed loop used above IS recognised when the stops sit at its ends
  const ends=[{lat:rec.points[0].lat,lng:rec.points[0].lng,startT:rec.points[0].t},
              {lat:rec.points[n-1].lat,lng:rec.points[n-1].lng,startT:rec.points[n-1].t}];
  console.assert(isDepotPair(rec.points,ends[0],ends[1])===true,
    'DEDUP-5: genuine start/end pair on a closed loop rejected');
  console.log('DEDUP-5. isDepotPair: mid-route pair no, open track no, loop ends yes OK');
})();

console.log('ALL DEDUP TESTS PASSED');
__group('Dedup tests');

// ══════════════════════════════════════════════════════════════════════════
//  UI / EVENT DISPLAY — registry, Next Stop Card, photo de-duplication
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── UI / stop events ──');

function nscFor(evts,photo){                       // load a 1-stop route and render
  const rec=mkRec('ui',120,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[60]);
  rec.stops[0].events=evts; rec.stops[0].photo=photo||null;
  loadFresh(rec); navActive=true;
  updNextStopCard(LAT0, LNG0);
  return {evt:el('nsc-evt').innerHTML||'', block:el('nsc-events').innerHTML||'',
          blockShown:el('nsc-events').style.display!=='none',
          photoShown:el('nsc-photo').style.display==='block'};
}
const hasDoor =s=>/Open Door/.test(s), hasKnee=s=>/Kneeling/.test(s), hasBrake=s=>/Hand Brake/.test(s);

// UI-1..UI-4 — each event, and all three together
(function(){
  let r=nscFor(['openDoor']);
  console.assert(hasDoor(r.block)&&!hasKnee(r.block)&&!hasBrake(r.block),'UI-1: '+r.block);
  console.log('UI-1. openDoor → Door only OK');

  r=nscFor(['kneeling']);
  console.assert(hasKnee(r.block)&&!hasDoor(r.block)&&!hasBrake(r.block),'UI-2: '+r.block);
  console.log('UI-2. kneeling → Knee only OK');

  r=nscFor(['handBrake']);
  console.assert(hasBrake(r.block)&&!hasDoor(r.block)&&!hasKnee(r.block),'UI-3: '+r.block);
  console.log('UI-3. handBrake → Brake only OK');

  r=nscFor(['openDoor','kneeling','handBrake']);
  console.assert(hasDoor(r.block)&&hasKnee(r.block)&&hasBrake(r.block),'UI-4: '+r.block);
  console.log('UI-4. all three shown OK');
})();

// UI-5 — no empty events area
(function(){
  const r=nscFor([]);
  console.assert(r.block===''&&r.blockShown===false,'UI-5: empty events area rendered');
  console.log('UI-5. no events → area hidden OK');
})();

// UI-6 — legacy cycle without handBrake keeps working, and gains nothing
(function(){
  const r=nscFor(['openDoor','kneeling']);
  console.assert(hasDoor(r.block)&&hasKnee(r.block),'UI-6: legacy events lost');
  console.assert(!hasBrake(r.block),'UI-6: handBrake invented for a legacy cycle');
  console.log('UI-6. legacy cycle unchanged, no handBrake added OK');
})();

// UI-7 — an unknown event is dropped, never remapped
(function(){
  const r=nscFor(['foo','openDoor']);
  console.assert(hasDoor(r.block),'UI-7: known event lost');
  console.assert(!hasKnee(r.block)&&!hasBrake(r.block),'UI-7: unknown event became another event');
  console.assert(!/⚡/.test(r.block+r.evt),'UI-7: generic ⚡ fallback still present');
  console.assert(normalizeStopEvents(['foo','bar']).length===0,'UI-7: unknown survived normalize');
  console.assert(getStopEventMeta('foo')===null,'UI-7: meta invented for unknown event');
  console.log('UI-7. unknown event dropped, no ⚡ fallback OK');
})();

// UI-8 — photo appears once, in the Next Stop Card
(function(){
  const r=nscFor(['openDoor','kneeling','handBrake'],'data:image/jpeg;base64,AAAAAAAAAAAA');
  console.assert(r.photoShown,'UI-8: card photo not shown');
  console.assert(!el('stop-photo-ov').classList.contains('on'),'UI-8: overlay opened too');
  console.log('UI-8. photo shown once (card), overlay closed OK');
})();

// UI-9 — approaching 200 m must not open the overlay
(function(){
  const rec=mkRec('ui9',200,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[100]);
  rec.stops[0].photo='data:image/jpeg;base64,AAAAAAAAAAAA';
  rec.stops[0].events=['openDoor'];
  loadFresh(rec); navActive=true; closeStopPhoto();
  el('rng-radius').value='80';
  for(let i=78;i<=95;i++) gpsH(rec.points[i].lat,rec.points[i].lng,25,0);
  console.assert(!el('stop-photo-ov').classList.contains('on'),
    'UI-9: proximity opened the photo overlay');
  console.log('UI-9. 200 m approach → no overlay OK');
})();

// UI-10 — arrival must not open the overlay either
(function(){
  const rec=mkRec('ui10',200,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[100]);
  rec.stops[0].photo='data:image/jpeg;base64,AAAAAAAAAAAA';
  loadFresh(rec); navActive=true; closeStopPhoto();
  for(let i=90;i<=101;i++) gpsH(rec.points[i].lat,rec.points[i].lng,15,0);
  console.assert(stops[0].state==='current','UI-10: setup — stop never arrived');
  console.assert(!el('stop-photo-ov').classList.contains('on'),
    'UI-10: arrival opened the photo overlay');
  console.log('UI-10. arrival → no overlay, photo stays in the card OK');
})();

// UI-11 — tapping the card photo DOES open the enlarged view
(function(){
  closeStopPhoto();
  nscPhotoTap();
  console.assert(el('stop-photo-ov').classList.contains('on'),'UI-11: tap did not enlarge');
  closeStopPhoto();
  console.assert(!el('stop-photo-ov').classList.contains('on'),'UI-11: close failed');
  console.log('UI-11. tap → lightbox opens, closes OK');
})();

// UI-12 / UI-13 — switching stops swaps events AND photo; stale photo cleared
(function(){
  const rec=mkRec('ui12',260,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[60,180]);
  rec.stops[0].events=['openDoor'];  rec.stops[0].photo='data:image/jpeg;base64,AAAA1111';
  rec.stops[1].events=['handBrake']; rec.stops[1].photo=null;   // stop 5 has no photo
  loadFresh(rec); navActive=true;
  updNextStopCard(LAT0,LNG0);
  console.assert(hasDoor(el('nsc-events').innerHTML),'UI-12: stop 4 events missing');
  console.assert(el('nsc-photo').style.display==='block','UI-12: stop 4 photo missing');
  markDone(stops[0].id);
  updNextStopCard(LAT0,LNG0);
  const b=el('nsc-events').innerHTML;
  console.assert(hasBrake(b)&&!hasDoor(b),'UI-12: events did not switch to stop 5: '+b);
  console.assert(el('nsc-photo').style.display==='none','UI-13: stop 4 photo still visible on stop 5');
  console.log('UI-12/13. events and photo follow the next stop OK');
})();

// UI-14 — voice announces all three, naturally
(function(){
  console.assert(stopEventVoicePhrase(['openDoor'])==='open doors','UI-14a');
  console.assert(stopEventVoicePhrase(['openDoor','kneeling'])==='open doors and kneeling','UI-14b');
  console.assert(stopEventVoicePhrase(['openDoor','handBrake'])==='open doors and hand brake','UI-14c');
  console.assert(stopEventVoicePhrase(['openDoor','kneeling','handBrake'])
                 ==='open doors, kneeling and hand brake','UI-14d: '+stopEventVoicePhrase(['openDoor','kneeling','handBrake']));
  console.assert(stopEventVoicePhrase(['foo'])==='','UI-14e: unknown event spoken');
  console.assert(stopEventVoicePhrase([])==='','UI-14f: empty phrase not empty');
  console.assert(!/parking brake/.test(stopEventVoicePhrase(['handBrake'])),'UI-14g: says parking brake');
  console.log('UI-14. voice: "'+stopEventVoicePhrase(['openDoor','kneeling','handBrake'])+'" OK');
})();

// UI-15 — recording buttons: three, independent, reset cleanly
(function(){
  pendingStopEvents=[];refreshEventButtons();
  const on=id=>el(id).classList.contains('active');
  toggleStopEvent('openDoor'); toggleStopEvent('kneeling'); toggleStopEvent('handBrake');
  console.assert(on('evt-door')&&on('evt-knee')&&on('evt-brake'),'UI-15: not all three active');
  console.assert(el('evt-brake').getAttribute('aria-pressed')==='true','UI-15: aria-pressed not set');
  toggleStopEvent('kneeling');
  console.assert(on('evt-door')&&!on('evt-knee')&&on('evt-brake'),'UI-15: toggling is not independent');
  pendingPhotoStopIdx=-1; confirmStopEvents();
  console.assert(!on('evt-door')&&!on('evt-knee')&&!on('evt-brake'),'UI-15: residual state after confirm');
  console.assert(pendingStopEvents.length===0,'UI-15: pendingStopEvents not cleared');
  toggleStopEvent('handBrake'); skipPhoto();
  console.assert(!on('evt-brake')&&pendingStopEvents.length===0,'UI-15: residual state after skipPhoto');
  console.log('UI-15. three buttons independent, ON/OFF, reset clean OK');
})();

// UI-16 — events persist through recording → JSON → load
(function(){
  const rec=mkRec('ui16',160,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[80]);
  rec.stops[0].events=['openDoor','kneeling','handBrake'];
  const wire=JSON.parse(JSON.stringify(recToPlain(rec)));
  loadFresh(wire);
  console.assert(normalizeStopEvents(stops[0].events).length===3,'UI-16: events lost in JSON');
  const gpx=typeof dlRecGPX==='function';
  console.log('UI-16. three events survive JSON round trip OK');
})();

// UI-17 — canonical order regardless of selection order
(function(){
  const a=normalizeStopEvents(['handBrake','openDoor','kneeling']).join(',');
  console.assert(a==='openDoor,kneeling,handBrake','UI-17: order not canonical: '+a);
  console.log('UI-17. canonical event order OK');
})();

console.log('ALL UI TESTS PASSED');
__group('UI/Event tests');

// ══════════════════════════════════════════════════════════════════════════
//  MAP VISIBILITY — vehicle marker and route line legibility
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── map visibility ──');

function driveOnce(headingVal){
  const rec=mkRec('map',160,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[80]);
  loadFresh(rec); navActive=true; posMarker=null;
  for(let i=0;i<6;i++) gpsH(rec.points[i].lat,rec.points[i].lng,30,headingVal);
  return rec;
}

// MAP-1 / MAP-2 / MAP-3 — the marker exists, is SVG, and is big enough
(function(){
  driveOnce(0);
  console.assert(posMarker,'MAP-1: no vehicle marker');
  const html=posMarker._icon&&posMarker._icon.html||'';
  console.log('MAP-1. vehicle marker present OK');

  console.assert(/<svg/.test(html),'MAP-2: marker is not SVG');
  console.assert(!/[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}\u25B2]/u.test(html),
    'MAP-2: marker still contains an emoji/▲ glyph');
  console.log('MAP-2. marker is inline SVG, no emoji OK');

  const size=posMarker._icon.iconSize;
  console.assert(size&&size[0]>=44&&size[1]>=44,'MAP-3: marker too small: '+JSON.stringify(size));
  console.assert(VEHICLE_PX>=44&&VEHICLE_PX<=56,'MAP-3: VEHICLE_PX out of range: '+VEHICLE_PX);
  console.log('MAP-3. marker '+size[0]+' px (>=44) OK');
})();

// MAP-4 — a reliable heading rotates the bus
(function(){
  driveOnce(0);
  const h0=posMarker._icon.html;
  const r0=/rotate\(([-\d.]+)deg\)/.exec(h0);
  console.assert(r0,'MAP-4: no rotation in the marker');
  // now drive east: heading ~90°
  const rec=mkRec('map4',160,i=>({lat:LAT0,lng:LNG0+i*0.00017}),[80]);
  loadFresh(rec); navActive=true; posMarker=null;
  for(let i=0;i<8;i++) gpsH(rec.points[i].lat,rec.points[i].lng,40,90);
  const r1=/rotate\(([-\d.]+)deg\)/.exec(posMarker._icon.html);
  console.assert(r1&&Math.abs(parseFloat(r1[1])-90)<25,
    'MAP-4: bus not rotated to the heading: '+(r1&&r1[1]));
  console.log('MAP-4. heading '+parseFloat(r1[1]).toFixed(0)+'° rotates the bus OK');
})();

// MAP-5 — no heading → neutral orientation, still visible
(function(){
  currentHeading=null; _headBuf.length=0;
  const rec=mkRec('map5',160,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[80]);
  loadFresh(rec); navActive=true; posMarker=null; _posHist.length=0;
  // a single stationary sample: no movement bearing, no GPS heading
  onGPS({coords:{latitude:LAT0,longitude:LNG0,accuracy:9,altitude:30,speed:0,heading:null},
         timestamp:(fake+=1000)});
  const html=posMarker._icon.html;
  const rot=/rotate\(([-\d.]+)deg\)/.exec(html);
  console.assert(rot&&parseFloat(rot[1])===0,'MAP-5: non-zero rotation without heading: '+(rot&&rot[1]));
  console.assert(/veh-wrap/.test(html)&&/<svg/.test(html),'MAP-5: marker not rendered');
  console.assert(/neutral/.test(html),'MAP-5: neutral state not flagged');
  console.log('MAP-5. no heading → bus points up, still drawn OK');
})();

// MAP-6 / MAP-12 — vehicle above every line, stop marker and the accuracy circle
(function(){
  driveOnce(0);
  const z=posMarker._opts.zIndexOffset;
  console.assert(z>=5000,'MAP-6: vehicle zIndexOffset too low: '+z);
  const stopZ=Object.values(stopMarkers)[0]?._opts?.zIndexOffset??900;
  console.assert(z>stopZ,'MAP-6: vehicle not above stop markers ('+z+' vs '+stopZ+')');
  console.assert(accCircle&&accCircle._back===true,'MAP-12: accuracy circle not sent to back');
  console.log('MAP-6/12. vehicle z='+z+' above stops ('+stopZ+') and accuracy circle OK');
})();

// MAP-7 — route ahead is casing + main line
(function(){
  driveOnce(0);
  console.assert(routeAheadCasingLayer,'MAP-7: no casing layer for the route ahead');
  console.assert(routeAheadLayer,'MAP-7: no main line');
  const cw=routeAheadCasingLayer._opts.weight, mw=routeAheadLayer._opts.weight;
  console.assert(cw>mw,'MAP-7: casing ('+cw+') not thicker than the main line ('+mw+')');
  console.assert(JSON.stringify(routeAheadCasingLayer._latlngs)===JSON.stringify(routeAheadLayer._latlngs),
    'MAP-7: casing and main line carry different geometry');
  console.log('MAP-7. route ahead: casing '+cw+' px + main '+mw+' px, same geometry OK');
})();

// MAP-8 — thicker than the previous implementation (main was 4-5 px)
(function(){
  driveOnce(0);
  console.assert(routeAheadLayer._opts.weight>=7&&routeAheadLayer._opts.weight<=8,
    'MAP-8: main line outside 7-8 px: '+routeAheadLayer._opts.weight);
  console.assert(routeAheadCasingLayer._opts.weight>=11&&routeAheadCasingLayer._opts.weight<=12,
    'MAP-8: casing outside 11-12 px: '+routeAheadCasingLayer._opts.weight);
  console.log('MAP-8. ahead line 7-8 px inside an 11-12 px casing OK');
})();

// MAP-9 / MAP-10 — done and remain stay visually distinct from the ahead line
(function(){
  driveOnce(0);
  const A=routeAheadLayer._opts, D=routeDoneLayer._opts, R=routeRemainLayer._opts;
  console.assert(D.color!==A.color,'MAP-9: done has the same colour as ahead');
  console.assert(D.weight<A.weight,'MAP-9: done is not visually quieter');
  console.assert(!!R.dashArray,'MAP-10: remain is not dashed');
  console.assert(R.weight<A.weight,'MAP-10: remain is not quieter than ahead');
  console.assert(!D.dashArray,'MAP-9: done should be solid, not dashed');
  console.log(`MAP-9/10. ahead ${A.weight}px solid · done ${D.weight}px ${D.color} · remain ${R.weight}px dashed OK`);
})();

// MAP-11 — heading-up rotation still works alongside the new drawing
(function(){
  const rec=mkRec('map11',160,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[80]);
  loadFresh(rec); navActive=true; posMarker=null;
  el('rng-follow').value='1';
  for(let i=0;i<8;i++) gpsH(rec.points[i].lat,rec.points[i].lng,40,45);
  console.assert(typeof setMapBearing==='function','MAP-11: setMapBearing missing');
  setMapBearing(-45);
  // setMapBearing unwraps across 0/360 so the CSS transition never spins the
  // long way round, so -45 may legitimately be stored as 315. Compare angles.
  const norm=a=>((a%360)+360)%360;
  console.assert(norm(_lastBearing)===norm(-45),'MAP-11: bearing not applied: '+_lastBearing);
  console.assert(routeAheadLayer._latlngs.length>0,'MAP-11: route vanished under rotation');
  console.assert(posMarker._icon.html.indexOf('<svg')>=0,'MAP-11: vehicle vanished under rotation');
  setMapBearing(0);
  console.log('MAP-11. heading-up rotation intact with the new layers OK');
})();

console.log('ALL MAP TESTS PASSED');
__group('Map visibility tests');

// ══════════════════════════════════════════════════════════════════════════
//  CYCLE PLAYBACK ENGINE v2 — PLAYBACK-1..20 (spec §31)
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── cycle playback engine ──');

/* voice spy: capture every speakText call, restore afterwards */
let _spoken=[];
const _realSpeak=speakText;
speakText=(t,f)=>{_spoken.push(String(t));};
function saidMatching(re){return _spoken.filter(t=>re.test(t));}

/* drive along the loaded route by feeding fixes at given point indices */
function drivePts(rec,from,to,kmh,hdg){
  const step=from<=to?1:-1;
  for(let i=from;i!==to+step;i+=step) gpsH(rec.points[i].lat,rec.points[i].lng,kmh??30,hdg??0);
}
/* standard session: load rec, arm playback like startNav does */
function beginPlayback(rec,laps){
  loadFresh(rec); navActive=true;
  insideStop.clear(); departGate=null; evtAnnounced.clear();
  stops.forEach(s=>evtAnnounced.add(s.id));
  destinationAnnounced=true; lastVoiceKey=''; lastVoiceManeuver='';
  try{localStorage.removeItem('gpx-playback-session');}catch(e){}
  Playback.begin(laps??1);
  _spoken=[];
}

// ── PLAYBACK-1: simple A→B→C cycle produces a correct ordered playlist ──
(function(){
  const rec=mkRec('pb1',200,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[60,140]); // ~2 km, stops at 0.6/1.4 km
  loadFresh(rec);
  console.assert(playbackCycle,'PB-1: no compiled cycle');
  const st=playbackCycle.segments.filter(s=>s.type==='STOP');
  console.assert(st.length===2,'PB-1: expected 2 STOP segments, got '+st.length);
  console.assert(st[0].routeDistanceM<st[1].routeDistanceM,'PB-1: stops out of order');
  const types=playbackCycle.segments.map(s=>s.type);
  console.assert(types[0]!=='END'&&types[types.length-1]==='END','PB-1: END not last');
  // monotonic, gap-free spans
  let prevEnd=0,ok=true;
  playbackCycle.segments.forEach(s=>{
    if(s.type==='STOP')return;
    if(Math.abs(s.startRouteM-prevEnd)>0.6)ok=false;
    prevEnd=s.endRouteM;
  });
  console.assert(ok,'PB-1: playlist has gaps or overlaps');
  console.log('PB-1. playlist ordered, gap-free, END last OK ('+playbackCycle.segments.length+' segments)');
})();

// ── PLAYBACK-2: travel slices land in the 100-300 m band ──
(function(){
  const rec=mkRec('pb2',300,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[150]); // 3 km, one stop
  loadFresh(rec);
  const tr=playbackCycle.segments.filter(s=>s.type==='TRAVEL'&&s.distanceM>1);
  const bad=tr.filter(s=>s.distanceM<80||s.distanceM>320);
  console.assert(tr.length>=6,'PB-2: too few travel segments: '+tr.length);
  console.assert(bad.length===0,'PB-2: segments outside 100-300 m band: '+
    bad.map(s=>s.distanceM.toFixed(0)).join(','));
  console.log('PB-2. '+tr.length+' travel slices, all ~'+PLAYBACK_CFG.segmentLenM+' m OK');
})();

// ── PLAYBACK-3: a stop is never split across two segments ──
(function(){
  const rec=mkRec('pb3',300,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[77,199]);
  loadFresh(rec);
  playbackCycle.occurrences.forEach(o=>{
    const inside=playbackCycle.segments.filter(s=>
      s.type!=='STOP'&&s.startRouteM<o.routeDistanceM-0.5&&s.endRouteM>o.routeDistanceM+0.5);
    console.assert(inside.length===0,'PB-3: '+o.occurrenceId+' cut mid-segment');
    const stopSegs=playbackCycle.segments.filter(s=>
      s.type==='STOP'&&s.stopOccurrenceId===o.occurrenceId);
    console.assert(stopSegs.length===1,'PB-3: '+o.occurrenceId+' has '+stopSegs.length+' STOP segments');
  });
  console.log('PB-3. every stop is a cut boundary, exactly one STOP segment each OK');
})();

// ── PLAYBACK-4: same physical stop twice → two distinct occurrences ──
(function(){
  const N=200; // out-and-back on the same street: same coordinate visited twice
  const shape=i=>i<100?{lat:LAT0+i*DLAT,lng:LNG0}:{lat:LAT0+(199-i)*DLAT,lng:LNG0};
  const rec=mkRec('pb4',N,shape,[10,50,149]); // depot guard + A out + A back (co-located)
  loadFresh(rec);
  const occ=playbackCycle.occurrences;
  const A=occ.filter(o=>o.stopId===occ[1].stopId&&o.stopId===occ[2].stopId?true:o.stopId===occ[1].stopId);
  // the two co-located stops must share stopId but differ in occurrenceId
  const co=occ.filter(o=>Math.abs(o.routeDistanceM-occ[1].routeDistanceM)<1||
                          Math.abs(o.routeDistanceM-occ[2].routeDistanceM)<1);
  console.assert(occ[1].stopId===occ[2].stopId,'PB-4: co-located stops got different physical ids');
  console.assert(occ[1].occurrenceId!==occ[2].occurrenceId,'PB-4: occurrences not distinct');
  console.assert(/occurrence_1$/.test(occ[1].occurrenceId)&&/occurrence_2$/.test(occ[2].occurrenceId),
    'PB-4: occurrence numbering wrong: '+occ[1].occurrenceId+' / '+occ[2].occurrenceId);
  console.assert(Math.abs(occ[2].routeDistanceM-occ[1].routeDistanceM)>800,
    'PB-4: occurrences share a route position');
  console.log('PB-4. '+occ[1].occurrenceId+' @'+(occ[1].routeDistanceM/1000).toFixed(2)+' km · '
    +occ[2].occurrenceId+' @'+(occ[2].routeDistanceM/1000).toFixed(2)+' km OK');
})();

// ── PLAYBACK-5: 5 m from a stop of ANOTHER leg → NO VOICE, NO ARRIVAL ──
(function(){
  const N=240; // outbound on street A, return on parallel street B 12 m east;
               // the return-leg stop is physically ~12 m from the outbound path
  const dLng=12/(111320*Math.cos(LAT0*Math.PI/180));
  const shape=i=>i<120?{lat:LAT0+i*DLAT,lng:LNG0}:{lat:LAT0+(239-i)*DLAT,lng:LNG0+dLng};
  const rec=mkRec('pb5',N,shape,[179]); // ONLY stop: on the RETURN leg (~idx 60 going back)
  beginPlayback(rec,1);
  // drive the OUTBOUND leg: passes ~12 m from the return-leg stop coordinate
  drivePts(rec,0,110,30,0);
  const nearTexts=saidMatching(/Stop \d|stop/i);
  console.assert(stops[0].state==='waiting','PB-5: other-leg stop arrived: '+stops[0].state);
  console.assert(nearTexts.length===0,'PB-5: voice fired on the wrong leg: '+JSON.stringify(nearTexts));
  console.log('PB-5. passed 12 m from other-leg stop: NO VOICE, NO ARRIVAL OK');
})();

// ── PLAYBACK-6: the correct segment DOES produce voice + arrival ──
(function(){
  const rec=mkRec('pb6',200,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[100]);
  rec.stops[0].events=['openDoor','kneeling'];
  beginPlayback(rec,1);
  drivePts(rec,0,101,25,0);
  console.assert(saidMatching(/Stop 1 in 200 meters/).length===1,
    'PB-6: approach voice missing: '+JSON.stringify(_spoken));
  console.assert(saidMatching(/Prepare to stop/).length===1,'PB-6: prepare voice missing');
  console.assert(saidMatching(/open doors and kneeling required/).length>=1,
    'PB-6: event phrase missing');
  console.assert(stops[0].state==='current','PB-6: stop did not arrive: '+stops[0].state);
  console.log('PB-6. correct segment → approach + prepare + events + arrival OK');
})();

// ── PLAYBACK-7: jitter regressing a segment must not repeat voice ──
(function(){
  const rec=mkRec('pb7',200,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[100]);
  beginPlayback(rec,1);
  drivePts(rec,0,85,30,0);                       // past the approach trigger
  const approaches=saidMatching(/Stop 1 in 200 meters/).length;
  console.assert(approaches===1,'PB-7: setup — approach fired '+approaches+' times');
  const segBefore=Playback.lastSegIdx;
  // jitter: 6 fixes oscillating backwards a few metres
  for(let k=0;k<6;k++) gpsH(rec.points[83+(k%2)].lat,rec.points[83+(k%2)].lng,3,(k*90)%360);
  console.assert(Playback.lastSegIdx>=segBefore,'PB-7: playback segment regressed');
  console.assert(saidMatching(/Stop 1 in 200 meters/).length===1,'PB-7: approach voice repeated');
  console.log('PB-7. jitter: segment held ('+segBefore+'→'+Playback.lastSegIdx+'), no repeat OK');
})();

__group('Playback tests');

// ── PLAYBACK-8: trigger fires only when routeDistance >= trigger ──
(function(){
  const rec=mkRec('pb8',200,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[100]); // stop @ ~1000 m
  beginPlayback(rec,1);
  drivePts(rec,0,75,30,0);                       // 750 m < 800 m trigger
  console.assert(saidMatching(/Stop 1 in 200 meters/).length===0,
    'PB-8: approach fired before the trigger (progress '+routeProgressM.toFixed(0)+' m)');
  drivePts(rec,76,85,30,0);                      // crosses 800 m
  console.assert(saidMatching(/Stop 1 in 200 meters/).length===1,
    'PB-8: approach did not fire after crossing the trigger');
  const st=stops[0], trig=st.routeDistanceM-PLAYBACK_CFG.voiceTriggers.approachM;
  console.assert(routeProgressM>=trig,'PB-8: sanity');
  console.log('PB-8. trigger at '+(trig/1000).toFixed(2)+' km respected (fired at ~'+
    (routeProgressM/1000).toFixed(2)+' km) OK');
})();

// ── PLAYBACK-9: voice locking — a fired trigger never speaks twice ──
(function(){
  const rec=mkRec('pb9',200,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[100]);
  rec.stops[0].events=['handBrake'];
  beginPlayback(rec,1);
  drivePts(rec,0,101,25,0);
  const c1={ap:saidMatching(/in 200 meters/).length,ar:saidMatching(/hand brake required/).length};
  // hammer the same position 10 more times
  for(let k=0;k<10;k++) gpsH(rec.points[101].lat,rec.points[101].lng,1,0);
  const c2={ap:saidMatching(/in 200 meters/).length,ar:saidMatching(/hand brake required/).length};
  console.assert(c1.ap===1&&c2.ap===1,'PB-9: approach repeated');
  console.assert(c1.ar>=1&&c2.ar===c1.ar,'PB-9: arrival phrase repeated');
  const msg=VoiceScheduler.messages.find(m=>/approach/.test(m.id));
  console.assert(msg.fired===true,'PB-9: fired flag not set');
  console.log('PB-9. voice locking holds under repeated fixes OK');
})();

// ── PLAYBACK-10: openDoor+kneeling+handBrake all spoken ──
(function(){
  const rec=mkRec('pb10',200,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[100]);
  rec.stops[0].events=['openDoor','kneeling','handBrake'];
  beginPlayback(rec,1);
  drivePts(rec,0,101,25,0);
  const hits=saidMatching(/open doors, kneeling and hand brake required/);
  console.assert(hits.length>=1,'PB-10: full phrase missing: '+JSON.stringify(_spoken.slice(-4)));
  console.log('PB-10. "'+hits[0]+'" OK');
})();

// ── PLAYBACK-11: stop without events announces no events ──
(function(){
  const rec=mkRec('pb11',200,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[100]);
  rec.stops[0].events=[];
  beginPlayback(rec,1);
  drivePts(rec,0,101,25,0);
  console.assert(saidMatching(/required/).length===0,
    'PB-11: event phrase for an event-less stop: '+JSON.stringify(saidMatching(/required/)));
  console.assert(saidMatching(/in 200 meters/).length===1,'PB-11: approach should still fire');
  console.log('PB-11. no events → no event phrase, approach still spoken OK');
})();

// ── PLAYBACK-12: photo belongs to the occurrence, not the nearest stop ──
(function(){
  const N=240; const dLng=12/(111320*Math.cos(LAT0*Math.PI/180));
  const shape=i=>i<120?{lat:LAT0+i*DLAT,lng:LNG0}:{lat:LAT0+(239-i)*DLAT,lng:LNG0+dLng};
  const rec=mkRec('pb12',N,shape,[60,179]); // occ1 outbound WITH photo, occ2 return NO photo
  rec.stops[0].photo='data:image/jpeg;base64,PHOTO_OCC1';
  rec.stops[1].photo=null;
  beginPlayback(rec,1);
  drivePts(rec,0,55,30,0); updNextStopCard(rec.points[55].lat,rec.points[55].lng);
  console.assert(el('nsc-photo').style.display==='block','PB-12: occ1 photo not shown');
  drivePts(rec,56,61,15,0);                       // arrive occ1
  markDone(stops[0].id);
  drivePts(rec,62,130,30,0);                      // now heading to occ2 — passes near occ1 coords
  updNextStopCard(rec.points[130].lat,rec.points[130].lng);
  console.assert(el('nsc-photo').style.display==='none',
    'PB-12: occ1 photo leaked into occ2 (nearest-stop lookup)');
  console.log('PB-12. photo follows the occurrence, not proximity OK');
})();

__group('Voice scheduler tests');

// ── PLAYBACK-13: lap 1/3 completes → LAP 2/3 ──
(function(){
  // Multi-lap only makes physical sense on a CLOSED loop: the vehicle must be
  // back at the start when the lap flips, otherwise "reset progress to 0" and
  // the vehicle's real position contradict each other. Out on lng0, back on a
  // parallel street 13 m east, ending ~13 m from the start point.
  const loop=i=>i<150?{lat:LAT0+i*DLAT,lng:LNG0}
                     :{lat:LAT0+(299-i)*DLAT,lng:LNG0+0.00012};
  const rec=mkRec('pb13',300,loop,[70]);
  beginPlayback(rec,3);
  console.assert(LapManager.totalLaps===3&&LapManager.currentLap===1,'PB-13: lap config wrong');
  drivePts(rec,0,71,25,0); markDone(stops[0].id);   // stop done (outbound)
  drivePts(rec,72,149,30,0);                        // rest of the outbound leg, north
  drivePts(rec,150,299,30,180);                     // return leg, south, back to start
  console.assert(LapManager.currentLap===2,'PB-13: lap did not advance: '+LapManager.currentLap);
  console.assert(saidMatching(/Lap 2 of 3/).length===1,'PB-13: lap voice missing');
  console.assert(stops[0].state==='waiting','PB-13: stop state not reset for lap 2');
  console.assert(routeProgressM<100,'PB-13: matcher progress not reset: '+routeProgressM.toFixed(0));
  console.log('PB-13. END → LAP 2/3, stops reset, progress reset OK');
})();

// ── PLAYBACK-14: lap 3/3 completes → COMPLETE, no restart ──
(function(){
  const rec=mkRec('pb14',150,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[70]);
  beginPlayback(rec,2);
  for(let lap=0;lap<2;lap++){
    drivePts(rec,0,71,25,0); markDone(stops[0].id);
    drivePts(rec,72,149,30,0);
  }
  console.assert(Playback.state==='COMPLETE','PB-14: not COMPLETE: '+Playback.state);
  console.assert(saidMatching(/All laps complete/).length===1,'PB-14: completion voice missing');
  const lapAtEnd=LapManager.currentLap;
  drivePts(rec,0,30,30,0);                          // keep driving — must NOT restart
  console.assert(Playback.state==='COMPLETE'&&LapManager.currentLap===lapAtEnd,
    'PB-14: restarted after COMPLETE');
  console.log('PB-14. COMPLETE reached, further driving ignored OK');
})();

// ── PLAYBACK-15: infinite laps keep cycling ──
(function(){
  const rec=mkRec('pb15',150,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[70]);
  beginPlayback(rec,'inf');
  console.assert(LapManager.infinite===true,'PB-15: infinite not configured');
  for(let lap=0;lap<4;lap++){
    drivePts(rec,0,71,25,0); markDone(stops[0].id);
    drivePts(rec,72,149,30,0);
  }
  console.assert(LapManager.currentLap===5,'PB-15: expected lap 5, got '+LapManager.currentLap);
  console.assert(Playback.state!=='COMPLETE','PB-15: infinite mode completed');
  console.log('PB-15. infinite: now on '+LapManager.label()+' OK');
})();

// ── PLAYBACK-16: identical coordinates — each lap uses the right occurrence ──
(function(){
  const N=200;
  const shape=i=>i<100?{lat:LAT0+i*DLAT,lng:LNG0}:{lat:LAT0+(199-i)*DLAT,lng:LNG0};
  const rec=mkRec('pb16',N,shape,[10,50,149]);   // A out (occ1) & A back (occ2), same coords
  beginPlayback(rec,2);
  const occ1=playbackCycle.occurrences[1],occ2=playbackCycle.occurrences[2];
  console.assert(occ1.stopId===occ2.stopId&&occ1.occurrenceId!==occ2.occurrenceId,'PB-16: setup');
  // lap 1, outbound: current occurrence after the depot must be occ1
  drivePts(rec,0,12,20,0); markDone(stops[0].id);
  drivePts(rec,13,45,30,0);
  console.assert(Playback._currentOccurrence().occurrenceId===occ1.occurrenceId,
    'PB-16: wrong occurrence outbound: '+Playback._currentOccurrence().occurrenceId);
  drivePts(rec,46,52,15,0); markDone(stops[1].id);
  drivePts(rec,53,145,30,180);
  console.assert(Playback._currentOccurrence().occurrenceId===occ2.occurrenceId,
    'PB-16: wrong occurrence on return: '+Playback._currentOccurrence().occurrenceId);
  console.log('PB-16. occ1 outbound, occ2 return — sequence decides, coords ignored OK');
})();

// ── PLAYBACK-17: circular cycle — lap boundary produces no wrong voice ──
(function(){
  const rec=mkRec('pb17',150,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[70]);
  rec.stops[0].events=['openDoor'];
  beginPlayback(rec,2);
  drivePts(rec,0,71,25,0); markDone(stops[0].id);
  _spoken=[];
  drivePts(rec,72,149,30,0);                       // cross the lap boundary
  const wrong=_spoken.filter(t=>!/^Lap /.test(t));
  console.assert(wrong.length===0,'PB-17: unexpected voice at lap boundary: '+JSON.stringify(wrong));
  console.assert(saidMatching(/^Lap 2 of 2/).length===1,'PB-17: lap announcement missing');
  // and lap 2 announces the stop again (voice state reset per lap, §12)
  _spoken=[];
  drivePts(rec,0,71,25,0);
  console.assert(saidMatching(/in 200 meters/).length===1,'PB-17: lap-2 approach missing');
  console.log('PB-17. lap boundary clean, lap-2 voice re-armed OK');
})();

__group('Lap manager tests');

// ── PLAYBACK-18: an old cycle with no playlist compiles automatically ──
(function(){
  const rec=mkRec('pb18',150,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[70]);
  console.assert(rec.playlist===undefined&&rec.compiled===undefined,'PB-18: fixture dirty');
  loadFresh(rec);
  console.assert(playbackCycle&&playbackCycle.segments.length>3,'PB-18: compiler did not run on load');
  console.assert(playbackCycle.occurrences.length===1,'PB-18: occurrences wrong');
  console.log('PB-18. legacy recording → playlist compiled on load OK');
})();

// ── PLAYBACK-19: recovery never announces an old stop ──
(function(){
  const rec=mkRec('pb19',200,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[50,150]);
  rec.stops[0].events=['openDoor'];rec.stops[1].events=['kneeling'];
  loadFresh(rec);
  // simulate a session that died mid-cycle on lap 1
  localStorage.setItem('gpx-playback-session',JSON.stringify({
    cycleId:playbackCycle.cycleId,currentLap:1,totalLaps:2,state:'RUNNING',ts:Date.now()}));
  navActive=true; insideStop.clear(); departGate=null;
  evtAnnounced.clear(); stops.forEach(s=>evtAnnounced.add(s.id));
  Playback.begin(2); _spoken=[];
  console.assert(Playback.recoveryPending===true,'PB-19: recovery not detected');
  // app restarts with the vehicle ALREADY past stop 1 (at ~1.1 km)
  drivePts(rec,105,115,30,0);
  console.assert(saidMatching(/Stop 1/).length===0,
    'PB-19: old stop announced after recovery: '+JSON.stringify(saidMatching(/Stop 1/)));
  console.assert(Playback.recoveryPending===false,'PB-19: recovery never resolved');
  // the NEXT stop still announces normally
  drivePts(rec,116,151,25,0);
  console.assert(saidMatching(/Stop 2 in 200 meters/).length===1,'PB-19: next stop lost its voice');
  console.log('PB-19. recovery: old stop silent, next stop normal OK');
})();

// ── PLAYBACK-20: the compiler never mutates the recording ──
(function(){
  const rec=mkRec('pb20',150,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[70]);
  rec.stops[0].events=['openDoor','handBrake'];
  rec.stops[0].photo='data:image/jpeg;base64,ORIGINAL';
  const before=JSON.stringify(rec);
  loadFresh(rec);
  const c1=playbackCycle; compileCycle();          // run twice for good measure
  console.assert(JSON.stringify(rec)===before,'PB-20: recording mutated by the compiler');
  console.assert(c1.segments.length>0,'PB-20: sanity');
  console.log('PB-20. recording JSON byte-identical after compiling twice OK');
})();

/* restore the real voice */

console.log('ALL PLAYBACK TESTS PASSED');
__group('Playback tests');

// ── PLAYBACK-21: playback owns the arrival voice (no duplicate) ──
(function(){
  const rec=mkRec('pb21',200,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[100]);
  rec.stops[0].events=['openDoor'];
  beginPlayback(rec,1);
  el('rng-radius').value='80';
  drivePts(rec,60,101,20,0);
  console.assert(stops[0].state==='current','PB-21: setup — stop never arrived');
  const engineVoice=saidMatching(/^Arrived at stop/);
  const schedVoice =saidMatching(/^Stop 1/);
  console.assert(engineVoice.length===0,
    'PB-21: checkArrival still spoke during playback: '+JSON.stringify(engineVoice));
  console.assert(schedVoice.length>=1,'PB-21: scheduler produced no stop voice');
  console.log(`PB-21. playback owns arrival voice — checkArrival 0, scheduler ${schedVoice.length} OK`);
})();

// ── PLAYBACK-22: physically at the wrong occurrence → total silence ──
(function(){
  // Out on lng0, back 7 m east; the SAME physical stop is recorded on both
  // legs, so occ1 (0.60 km) and occ2 (2.39 km) sit 7 m apart on the ground.
  // The vehicle drives the outbound leg properly: occ1 arrives and completes,
  // making occ2 the current occurrence. It is then standing 7 m from occ2's
  // coordinate while 1.8 km short of it ALONG THE ROUTE. Proximity must buy
  // occ2 nothing — no voice, no arrival (§7/§8).
  //
  // (An earlier version of this case teleported onto occ2's coordinate from
  // mid-outbound. That was not discriminating: 7 m of cross-track with the
  // outbound heading is a legitimate match for occ1, so the engine was right
  // to advance there and the scheduler was right to announce occ1.)
  const loop=i=>i<150?{lat:LAT0+i*DLAT,lng:LNG0}
                     :{lat:LAT0+(299-i)*DLAT,lng:LNG0+0.00012};
  const rec=mkRec('pb22',300,loop,[60,239]);
  rec.stops[0].events=['openDoor'];rec.stops[1].events=['kneeling'];
  beginPlayback(rec,1);
  el('rng-radius').value='80';
  drivePts(rec,0,62,25,0);                       // outbound through occ1
  console.assert(stops[0].state==='current','PB-22: setup — occ1 never arrived');
  markDone(stops[0].id);
  const occ2=playbackCycle.occurrences[1];
  console.assert(Playback._currentOccurrence().occurrenceId===occ2.occurrenceId,
    'PB-22: setup — occ2 is not the current occurrence');
  _spoken=[];
  const gap=haversine(rec.points[62].lat,rec.points[62].lng,
                      rec.points[239].lat,rec.points[239].lng)*1000;
  console.assert(gap<25,'PB-22: setup — occurrences '+gap.toFixed(0)+' m apart');
  const alongGap=occ2.routeDistanceM-routeProgressM;
  console.assert(alongGap>1500,'PB-22: setup — occ2 only '+alongGap.toFixed(0)+' m ahead on route');
  for(let i=0;i<6;i++) gpsH(rec.points[62].lat,rec.points[62].lng,5,0);   // sit there
  console.assert(saidMatching(/Stop \d/).length===0,
    'PB-22: wrong-occurrence stop voice: '+JSON.stringify(saidMatching(/Stop \d/)));
  console.assert(saidMatching(/^Arrived at stop/).length===0,'PB-22: arrival voice fired');
  console.assert(saidMatching(/Make a stop/).length===0,
    'PB-22: radial "Make a stop" leaked: '+JSON.stringify(saidMatching(/Make a stop/)));
  console.assert(saidMatching(/Arrived at destination/).length===0,'PB-22: destination voice fired');
  console.assert(stops[1].state==='waiting','PB-22: wrong occurrence was marked arrived');
  const fired=VoiceScheduler.messages.filter(m=>m.occurrenceId===occ2.occurrenceId&&m.fired);
  console.assert(fired.length===0,'PB-22: occ2 messages fired early: '+JSON.stringify(fired.map(f=>f.id)));
  console.log(`PB-22. ${gap.toFixed(0)} m from occ2 but ${(alongGap/1000).toFixed(2)} km short on route: silent OK`);
})();

// ── PLAYBACK-23: generic turn voice is SUPPRESSED during playback ──
(function(){
  // SPEC CHANGE — this assertion is the reverse of its original form.
  // Playback v2 §8 required turn voice to keep speaking during playback.
  // Driver UX v3 §5/§34 reverses that: drivers reported "Turn left/right"
  // firing on ordinary road bends, so direction moves to the Guidance Arrow
  // and the generic maneuver voice is silenced while playback is active.
  // Scheduler voice (stops, prepare, events) is unaffected — see MAP-UX-14.
  const corner=i=>i<=80?{lat:LAT0+i*DLAT,lng:LNG0}
                       :{lat:LAT0+80*DLAT,lng:LNG0+(i-80)*0.00017};
  const rec=mkRec('pb23',160,corner,[]);
  beginPlayback(rec,1);
  lastVoiceKey='';lastVoiceManeuver='';
  console.assert(Playback.active===true,'PB-23: playback not active');
  console.assert(maneuvers.some(m=>m.type==='right'),'PB-23: setup — no turn in the route');
  drivePts(rec,20,72,40,0);
  const turnVoice=saidMatching(/turn|keep/i);
  console.assert(turnVoice.length===0,
    'PB-23: generic turn voice still fired during playback: '+JSON.stringify(turnVoice));
  // and the visual channel did take over
  console.assert(lastGuidance!=null,'PB-23: no guidance computed to replace the voice');
  console.log('PB-23. generic turn voice suppressed, guidance='+lastGuidance.kind+' OK');
})();

// ── PLAYBACK-24: without playback, normal arrival voice is unchanged ──
(function(){
  const rec=mkRec('pb24',200,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[100]);
  loadFresh(rec);
  Playback.stop();                               // explicitly NOT playing back
  navActive=true; insideStop.clear(); departGate=null; evtAnnounced.clear();
  el('rng-radius').value='80'; _spoken=[];
  console.assert(Playback.active===false,'PB-24: playback still active');
  drivePts(rec,60,101,20,0);
  console.assert(stops[0].state==='current','PB-24: setup — stop never arrived');
  console.assert(saidMatching(/^Arrived at stop 1/).length===1,
    'PB-24: normal navigation lost its arrival voice: '+JSON.stringify(_spoken));
  console.log('PB-24. normal navigation still says "Arrived at stop 1" OK');
})();

// ── PLAYBACK-25: three events spoken by the scheduler, no duplicate ──
(function(){
  const rec=mkRec('pb25',200,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[100]);
  rec.stops[0].events=['openDoor','kneeling','handBrake'];
  beginPlayback(rec,1);
  el('rng-radius').value='80';
  drivePts(rec,60,101,20,0);
  const three=saidMatching(/open doors, kneeling and hand brake required/);
  console.assert(three.length>=1,
    'PB-25: three-event phrase missing: '+JSON.stringify(_spoken));
  console.assert(saidMatching(/^Arrived at stop/).length===0,
    'PB-25: duplicate "Arrived at stop" alongside the scheduler voice');
  console.assert(!/parking brake/.test(_spoken.join('|')),'PB-25: said parking brake');
  console.log('PB-25. "'+three[0]+'" — single owner OK');
})();

__group('Playback tests');
speakText=_realSpeak;   // restore AFTER every playback case, including PB-21..25


// ══════════════════════════════════════════════════════════════════════════
//  DRIVER UX v3 — visual guidance, driving map, driver-focused stop card
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── driver UX v3 ──');
// The playback suite restores the real speakText at its end; these cases
// assert on voice too, so the spy is re-installed here and released below.
const _realSpeak3=speakText;
speakText=(t,f)=>{_spoken.push(String(t));};

/* geometry builders: gentle bend, real junction, long sweeping curve */
const uxStraight=i=>({lat:LAT0+i*DLAT,lng:LNG0});
const uxJunction=i=>i<=80?{lat:LAT0+i*DLAT,lng:LNG0}                       // north
                         :{lat:LAT0+80*DLAT,lng:LNG0+(i-80)*0.00017};      // then east
function uxBend(totalDeg,overM){          // arc of totalDeg spread over overM
  const stepM=10, n=Math.max(1,Math.round(overM/stepM));
  return i=>{
    let lat=LAT0,lng=LNG0,brg=0;
    for(let k=0;k<i;k++){
      if(k>=40&&k<40+n)brg+=totalDeg/n;                 // the bend starts at pt 40
      const r=brg*Math.PI/180;
      lat+=Math.cos(r)*stepM/111320;
      lng+=Math.sin(r)*stepM/(111320*Math.cos(LAT0*Math.PI/180));
    }
    return{lat,lng};
  };
}
function uxDrive(shape,n,to,kmh,hdg){
  const rec=mkRec('ux',n,shape,[]);
  beginPlayback(rec,1);
  // Earlier suites leave the sliders wherever they finished; pin the ones
  // this suite depends on so the cases are order-independent.
  el('rng-follow').value='1'; el('rng-zoom').value='17';
  drivePts(rec,0,to,kmh??30,hdg??0);
  return rec;
}

// ── MAP-UX-1: vehicle stays 46-56 px ──
(function(){
  uxDrive(uxStraight,120,20,30,0);
  const sz=posMarker._icon.iconSize;
  console.assert(sz[0]>=46&&sz[0]<=56,'MAP-UX-1: vehicle '+sz[0]+' px outside 46-56');
  console.assert(VEHICLE_PX>=46,'MAP-UX-1: VEHICLE_PX shrank to '+VEHICLE_PX);
  console.log('MAP-UX-1. vehicle '+sz[0]+' px OK');
})();

// ── MAP-UX-2 / 3: zoom closes in when slow, never opens too far when fast ──
(function(){
  el('rng-zoom').value='17';
  const slow=adaptiveZoom(5), city=adaptiveZoom(25), fast=adaptiveZoom(90);
  console.assert(slow>city&&city>=adaptiveZoom(50),'MAP-UX-2: zoom does not tighten at low speed');
  console.assert(slow>=17.5,'MAP-UX-2: low-speed zoom too wide: '+slow);
  console.assert(fast>=15.5,'MAP-UX-3: high-speed zoom too wide: '+fast);
  console.assert(adaptiveZoom(200)>=15.5,'MAP-UX-3: no lower clamp on zoom');
  console.assert(slow-fast<=2.5,'MAP-UX-3: zoom swing too violent: '+(slow-fast));
  console.log(`MAP-UX-2/3. zoom 5km/h=${slow} · 25=${city} · 90=${fast}, clamped OK`);
})();

// ── MAP-UX-4: map centre leads the vehicle (bus sits low on screen) ──
(function(){
  global.__setViewLog=[];
  const rec=uxDrive(uxStraight,120,20,40,0);
  const log=global.__setViewLog;
  console.assert(log.length,'MAP-UX-4: map never centred');
  const c=log[log.length-1].c;                 // the centre the last fix asked for
  const veh={lat:rec.points[20].lat,lng:rec.points[20].lng};
  // heading is north, so a leading centre must be NORTH of the vehicle
  console.assert(c[0]>veh.lat,'MAP-UX-4: centre is not ahead of the vehicle');
  const leadM=(c[0]-veh.lat)*111320;
  console.assert(leadM>=60&&leadM<=160,'MAP-UX-4: lead offset '+leadM.toFixed(0)+' m out of range');
  console.log('MAP-UX-4. centre leads the vehicle by '+leadM.toFixed(0)+' m OK');
})();

// ── MAP-UX-5: route ahead stays the visually dominant line ──
(function(){
  uxDrive(uxStraight,120,20,30,0);
  const A=routeAheadLayer._opts,D=routeDoneLayer._opts,C=routeAheadCasingLayer._opts;
  console.assert(A.weight>=7&&C.weight>A.weight,'MAP-UX-5: ahead lost its casing+weight');
  console.assert(A.weight>D.weight,'MAP-UX-5: done is as heavy as ahead');
  console.assert(routeAheadLayer._latlngs.length>1,'MAP-UX-5: no route ahead drawn');
  console.log(`MAP-UX-5. ahead ${A.weight}px in ${C.weight}px casing, done ${D.weight}px OK`);
})();

// ── MAP-UX-6: straight stretch → arrow exists, STRAIGHT, no turn direction ──
(function(){
  // SPEC CHANGE (field, 16 Aug): the on-map arrow was retired — the driver
  // reported it added clutter in front of the bus with no information beyond
  // the card and the highlighted route. Guidance itself must keep computing
  // (it drives the HUD card), and NO marker may appear on the map.
  uxDrive(uxStraight,140,30,30,0);
  console.assert(lastGuidance&&lastGuidance.kind==='STRAIGHT',
    'MAP-UX-6: straight road classified '+(lastGuidance&&lastGuidance.kind));
  console.assert(lastGuidance.dir===null,'MAP-UX-6: straight road got a direction');
  console.assert(guidanceMarker===null,'MAP-UX-6: a map arrow marker was rendered');
  console.log('MAP-UX-6. straight → guidance computed, no map marker OK');
})();

// ── MAP-UX-7 / §37 / §39: a gentle bend is CURVE, never TURN ──
(function(){
  // 40° spread over 150 m — the exact case from the spec
  uxDrive(uxBend(40,150),140,45,30,0);
  const g=computeGuidance(routeProgressM,30);
  console.assert(g.kind!=='TURN','MAP-UX-7: gentle bend classified as TURN ('+
    g.deltaDeg.toFixed(0)+'° over '+g.overM+' m)');
  console.assert(g.kind==='CURVE'||g.kind==='STRAIGHT','MAP-UX-7: unexpected kind '+g.kind);
  console.assert(guidanceMarker===null,'MAP-UX-7: map arrow returned (retired 16 Aug)');
  console.log(`MAP-UX-7. bend ${Math.abs(g.deltaDeg).toFixed(0)}° over ${g.overM} m → ${g.kind} OK`);
})();

// ── MAP-UX-8 / §37: the same gentle bend produces NO turn voice ──
(function(){
  uxDrive(uxBend(40,150),140,20,30,0);
  _spoken=[];lastVoiceKey='';lastVoiceManeuver='';
  const rec=savedRecs[savedRecs.length-1];
  drivePts(rec,21,70,30,0);
  const v=saidMatching(/turn left|turn right|keep left|keep right/i);
  console.assert(v.length===0,'MAP-UX-8: gentle bend spoke a turn: '+JSON.stringify(v));
  console.log('MAP-UX-8. gentle bend → no turn voice OK');
})();

// ── MAP-UX-9 / §38: a real junction is TURN, with a direction ──
(function(){
  uxDrive(uxJunction,160,72,25,0);
  const g=computeGuidance(routeProgressM,25);
  console.assert(g.kind==='TURN','MAP-UX-9: junction classified '+g.kind+
    ' ('+g.deltaDeg.toFixed(0)+'° over '+g.overM+' m)');
  console.assert(g.dir==='right','MAP-UX-9: junction direction '+g.dir);
  console.assert(guidanceMarker===null,'MAP-UX-9: map arrow returned (retired 16 Aug)');
  console.assert(saidMatching(/turn right/i).length===0,'MAP-UX-9: junction still spoke');
  console.log(`MAP-UX-9. junction ${Math.abs(g.deltaDeg).toFixed(0)}° over ${g.overM} m → TURN right, silent OK`);
})();

// ── MAP-UX-10 / 11: guidance bearing is orientation-agnostic ──
(function(){
  // SPEC CHANGE (field, 16 Aug): with the map marker retired, what must hold
  // is that the computed guidance carries the ABSOLUTE route bearing and is
  // unaffected by how the map happens to be rotated — the card shows the
  // relative shape (glyph), the map container handles its own rotation.
  uxDrive(uxJunction,160,72,25,0);
  const norm=a=>((a%360)+360)%360;
  el('rng-follow').value='0'; setMapBearing(0);
  const gN=computeGuidance(routeProgressM,25);
  setMapBearing(-90);
  const gH=computeGuidance(routeProgressM,25);
  console.assert(gN.bearing!=null,'MAP-UX-11: no bearing computed');
  console.assert(Math.abs(norm(gN.bearing)-norm(gH.bearing))<1,
    'MAP-UX-10: guidance bearing changed with map rotation: '+gN.bearing+' vs '+gH.bearing);
  console.assert(gN.kind===gH.kind&&gN.dir===gH.dir,'MAP-UX-10: guidance kind/dir depend on rotation');
  console.assert(guidanceMarker===null,'MAP-UX-10/11: map arrow returned (retired 16 Aug)');
  setMapBearing(0); el('rng-follow').value='1';
  console.log(`MAP-UX-10/11. bearing ${gN.bearing.toFixed(0)}° stable across rotations, no marker OK`);
})();

// ── MAP-UX-12 / 13: no "Turn left"/"Turn right" anywhere during playback ──
(function(){
  uxDrive(uxJunction,160,20,30,0);
  _spoken=[];lastVoiceKey='';lastVoiceManeuver='';
  const rec=savedRecs[savedRecs.length-1];
  drivePts(rec,21,120,30,0);
  console.assert(saidMatching(/turn left/i).length===0,'MAP-UX-12: "Turn left" spoken');
  console.assert(saidMatching(/turn right/i).length===0,'MAP-UX-13: "Turn right" spoken');
  console.assert(saidMatching(/keep (left|right)/i).length===0,'MAP-UX-12/13: "Keep ..." spoken');
  console.log('MAP-UX-12/13. no turn/keep voice across a junction during playback OK');
})();

// ── MAP-UX-14 / §6: the Voice Scheduler is untouched by the suppression ──
(function(){
  const rec=mkRec('ux14',200,uxStraight,[100]);
  rec.stops[0].events=['openDoor','kneeling','handBrake'];
  beginPlayback(rec,1);
  el('rng-radius').value='80';
  drivePts(rec,60,101,20,0);
  console.assert(saidMatching(/Stop 1 in 200 meters/).length===1,'MAP-UX-14: approach voice lost');
  console.assert(saidMatching(/open doors, kneeling and hand brake required/).length>=1,
    'MAP-UX-14: event voice lost: '+JSON.stringify(_spoken));
  console.assert(saidMatching(/Prepare to stop/).length===1,'MAP-UX-14: prepare voice lost');
  console.log('MAP-UX-14. scheduler intact: approach + prepare + events OK');
})();

// ── MAP-UX-15 / 16 / 17: bigger type, dominant distance, bigger photo ──
(function(){
  const css=document.__cssText||'';
  const px=(sel,prop)=>{
    const m=new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{[^}]*'+prop+':(\\d+)px').exec(css);
    return m?+m[1]:null;
  };
  const dist=px('.nsc-dist','font-size'), name=px('.nsc-name','font-size'),
        photo=px('.nsc-photo','height');
  console.assert(dist>=40,'MAP-UX-16: distance font only '+dist+'px');
  console.assert(name>=16,'MAP-UX-15: stop name font only '+name+'px');
  console.assert(dist>name,'MAP-UX-16: distance is not the dominant element');
  console.assert(photo>=140,'MAP-UX-17: photo only '+photo+'px tall');
  console.assert(photo>96,'MAP-UX-17: photo not larger than the previous 96px');
  console.log(`MAP-UX-15/16/17. name ${name}px · distance ${dist}px · photo ${photo}px OK`);
})();

// ── MAP-UX-18 / 19: three SVG events, belonging to the right occurrence ──
(function(){
  const loop=i=>i<150?{lat:LAT0+i*DLAT,lng:LNG0}
                     :{lat:LAT0+(299-i)*DLAT,lng:LNG0+0.00012};
  const rec=mkRec('ux19',300,loop,[60,239]);
  rec.stops[0].events=['openDoor','kneeling','handBrake'];
  rec.stops[0].photo='data:image/jpeg;base64,AAAAOCC1';
  rec.stops[1].events=['kneeling'];
  rec.stops[1].photo='data:image/jpeg;base64,BBBBOCC2';
  beginPlayback(rec,1);
  updNextStopCard(LAT0,LNG0);
  const b=el('nsc-events').innerHTML;
  console.assert((b.match(/<svg/g)||[]).length===3,'MAP-UX-18: expected 3 SVG icons, got '+
    (b.match(/<svg/g)||[]).length);
  console.assert(!/[\u{1F300}-\u{1FAFF}]/u.test(b),'MAP-UX-18: emoji returned to the events row');
  console.assert(/Open Door/.test(b)&&/Kneeling/.test(b)&&/Hand Brake/.test(b),'MAP-UX-18: labels missing');
  console.assert(/aria-label/.test(b),'MAP-UX-29: no aria-label on the event icons');
  console.assert(el('nsc-photo').src==='data:image/jpeg;base64,AAAAOCC1',
    'MAP-UX-19: wrong occurrence photo: '+el('nsc-photo').src);
  markDone(stops[0].id);
  updNextStopCard(LAT0,LNG0);
  console.assert(el('nsc-photo').src==='data:image/jpeg;base64,BBBBOCC2',
    'MAP-UX-19: photo did not follow to occurrence 2');
  console.assert(!/Hand Brake/.test(el('nsc-events').innerHTML),
    'MAP-UX-19: occurrence 1 events leaked into occurrence 2');
  console.log('MAP-UX-18/19. 3 SVG events with labels; photo+events follow the occurrence OK');
})();

// ── MAP-UX-20: no photo → no empty frame ──
(function(){
  const rec=mkRec('ux20',200,uxStraight,[100]);
  rec.stops[0].events=['openDoor'];rec.stops[0].photo=null;
  beginPlayback(rec,1);
  updNextStopCard(LAT0,LNG0);
  console.assert(el('nsc-photo').style.display==='none','MAP-UX-20: empty photo frame left visible');
  console.assert(el('nsc-name').textContent.length>0,'MAP-UX-20: card broke without a photo');
  console.assert(el('nsc-events').style.display!=='none','MAP-UX-20: events hidden with no photo');
  console.log('MAP-UX-20. no photo → frame hidden, card still complete OK');
})();

// ── MAP-UX-21 / §32: diagnostics stay in Navigation Debug, off the driving UI ──
(function(){
  const rec=mkRec('ux21',200,uxStraight,[100]);
  beginPlayback(rec,1);
  toggleNavDebug(true);
  drivePts(rec,10,40,30,0);
  const dbg=el('nav-debug-txt').textContent;
  console.assert(/x-track/.test(dbg)&&/conf/.test(dbg)&&/segment/.test(dbg),
    'MAP-UX-21: Navigation Debug lost its technical fields');
  console.assert(/PLAYBACK/.test(dbg)||/STOP ANCHOR/.test(dbg),'MAP-UX-21: debug blocks missing');
  // and none of it leaked into the driver-facing card
  const card=(el('nsc-name').textContent||'')+(el('nsc-dist').textContent||'')+
             (el('nsc-events').innerHTML||'')+(el('nsc-plan').textContent||'');
  console.assert(!/x-track|conf |cross|matcher|routeIdx/i.test(card),
    'MAP-UX-21: diagnostics leaked into the Next Stop Card');
  toggleNavDebug(false);
  console.assert(el('nav-debug').classList.contains('on')===false,'MAP-UX-21: debug did not close');
  console.log('MAP-UX-21. debug intact and separate from the driving UI OK');
})();

// ── MAP-UX-22 / §40: the visual layer does not disturb occurrence identity ──
(function(){
  const loop=i=>i<150?{lat:LAT0+i*DLAT,lng:LNG0}
                     :{lat:LAT0+(299-i)*DLAT,lng:LNG0+0.00012};
  const rec=mkRec('ux22',300,loop,[60,239]);
  rec.stops[0].events=['openDoor'];rec.stops[1].events=['kneeling'];
  beginPlayback(rec,1);
  el('rng-radius').value='80';
  drivePts(rec,0,62,25,0);
  console.assert(stops[0].state==='current','MAP-UX-22: occ1 did not arrive');
  markDone(stops[0].id);
  _spoken=[];
  for(let i=0;i<6;i++) gpsH(rec.points[62].lat,rec.points[62].lng,5,0);
  console.assert(saidMatching(/Stop \d/).length===0,
    'MAP-UX-22: out-and-back identification broke: '+JSON.stringify(_spoken));
  console.assert(stops[1].state==='waiting','MAP-UX-22: wrong occurrence arrived');
  console.log('MAP-UX-22. out-and-back occurrence identity unaffected by the visual layer OK');
})();

// ── MAP-UX-23 / §41: laps still work with guidance active ──
(function(){
  const loop=i=>i<150?{lat:LAT0+i*DLAT,lng:LNG0}
                     :{lat:LAT0+(299-i)*DLAT,lng:LNG0+0.00012};
  const rec=mkRec('ux23',300,loop,[70]);
  beginPlayback(rec,3);
  drivePts(rec,0,71,25,0); markDone(stops[0].id);
  drivePts(rec,72,149,30,0); drivePts(rec,150,299,30,180);
  console.assert(LapManager.currentLap===2,'MAP-UX-23: lap did not advance: '+LapManager.currentLap);
  console.assert(lastGuidance!=null,'MAP-UX-23: guidance lost across the lap boundary');
  console.log('MAP-UX-23. LAP 2/3 reached with guidance active OK');
})();

speakText=_realSpeak3;
console.log('ALL DRIVER-UX TESTS PASSED');
__group('Driver UX tests');

// ══════════════════════════════════════════════════════════════════════════
//  COCKPIT v6 — driver-mode layout, orientation, footer, stop dock
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── cockpit v6 ──');
const _realSpeakCk=speakText;
speakText=(t,f)=>{_spoken.push(String(t));};

const ckCss=()=>document.__cssText||'';
const ckPx=(sel,prop)=>{
  const m=new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{[^}]*'+prop+':(\\d+)px').exec(ckCss());
  return m?+m[1]:null;
};
function ckDrive(){
  const rec=mkRec('ck',200,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[120]);
  rec.stops[0].events=['openDoor','kneeling','handBrake'];
  rec.stops[0].photo='data:image/jpeg;base64,CKCKCKCK';
  beginPlayback(rec,1);
  el('rng-follow').value='1'; el('rng-radius').value='80';
  navActive=true; setCockpit(true);
  drivePts(rec,0,40,30,0);
  return rec;
}

// ── CK-1: Driver Mode puts the body in cockpit and hides the chrome ──
(function(){
  ckDrive();
  console.assert(document.body.classList.contains('cockpit'),'CK-1: cockpit class not applied');
  const css=ckCss();
  console.assert(/body\.cockpit \.topbar[^{]*\{display:none/.test(css.replace(/\s*,\s*/g,',')) ||
    /body\.cockpit \.topbar,[\s\S]{0,400}?display:none!important/.test(css),
    'CK-1: top chrome not hidden in cockpit');
  console.assert(/body\.cockpit \.map-wrap\{position:fixed/.test(css),'CK-1: map is not full-bleed');
  console.log('CK-1. cockpit active, chrome hidden, map full-bleed OK');
})();

// ── CK-2: manoeuvre card is the dominant element (top-left) ──
(function(){
  const dist=ckPx('body.cockpit .hud-instr-dist','font-size');
  const act =ckPx('body.cockpit .hud-instr-action','font-size');
  const arrow=ckPx('body.cockpit .hud-instr-icon svg','width');
  // 48px is intentional since the overflow fix (16 Aug): 56px 'xx.x km' rows
  // were wider than the 300px card under the v7 rule conflict.
  console.assert(dist>=44,'CK-2: manoeuvre distance only '+dist+'px');
  console.assert(arrow>=96,'CK-2: manoeuvre arrow only '+arrow+'px');
  console.assert(dist>act,'CK-2: distance is not dominant over the action line');
  console.assert(/body\.cockpit \.hud-instr\{[^}]*left:14px/.test(ckCss()),'CK-2: card not top-left');
  console.log(`CK-2. distance ${dist}px · arrow ${arrow}px · action ${act}px OK`);
})();

// ── CK-3: speed dial is round and top-right ──
(function(){
  const css=ckCss();
  const m=/body\.cockpit \.cockpit-speed\{([^}]*)\}/.exec(css);
  console.assert(m,'CK-3: no cockpit speed rule');
  console.assert(/border-radius:50%/.test(m[1]),'CK-3: speed dial is not round');
  console.assert(/right:16px/.test(m[1])&&/top:64px/.test(m[1]),'CK-3: dial not top-right');
  console.assert(ckPx('body.cockpit .cockpit-speed-value','font-size')>=34,'CK-3: speed value too small');
  console.log('CK-3. round speed dial, top-right OK');
})();

// ── CK-4: orientation toggle flips heading-up / north-up ──
(function(){
  orientMode='HEADING';
  console.assert(toggleOrientMode()==='NORTH','CK-4: did not switch to NORTH');
  console.assert(el('ck-orient-lbl').textContent==='NORTH UP','CK-4: label not updated');
  console.assert(_lastBearing===0,'CK-4: north-up did not level the map: '+_lastBearing);
  // and heading-up rotation resumes when switched back
  // an explicit heading: drivePts only produces a movement bearing when one
  // is supplied, and the assertion here is about rotation, not heading source
  const rec=mkRec('ck4',120,i=>({lat:LAT0+i*DLAT,lng:LNG0+i*0.00012}),[]);
  beginPlayback(rec,1); el('rng-follow').value='1'; navActive=true;
  drivePts(rec,0,10,40,45);
  console.assert(_lastBearing===0,'CK-4: map rotated while in NORTH UP: '+_lastBearing);
  console.assert(toggleOrientMode()==='HEADING','CK-4: did not switch back');
  drivePts(rec,11,20,40,45);
  console.assert(_lastBearing!==0,'CK-4: heading-up did not resume rotating');
  console.log('CK-4. NORTH UP holds the map level; HEADING UP resumes OK');
})();

// ── CK-5: manoeuvre footer shows distance left and a progress bar ──
(function(){
  const rec=ckDrive();
  const total=(totalRouteDist||0)*1000;
  updCockpitFooter();
  const w=parseFloat(el('ck-minifill').style.width);
  console.assert(w>0&&w<100,'CK-5: progress bar at '+w+'%');
  const txt=el('ck-foot-dist').textContent;
  console.assert(/\d/.test(txt),'CK-5: no remaining distance: '+txt);
  const remM=total-routeProgressM;
  const shown=/km/.test(txt)?parseFloat(txt)*1000:parseFloat(txt);
  console.assert(Math.abs(shown-remM)<60,'CK-5: remaining '+txt+' vs actual '+remM.toFixed(0)+' m');
  console.log(`CK-5. footer ${w.toFixed(0)}% · ${txt} remaining OK`);
})();

// ── CK-6: stop dock keeps photo, distance and the three coloured events ──
(function(){
  ckDrive();
  updNextStopCard(LAT0,LNG0);
  console.assert(el('nsc-photo').style.display==='block','CK-6: photo missing from the dock');
  console.assert((el('nsc-events').innerHTML.match(/<svg/g)||[]).length===3,'CK-6: three events not shown');
  const css=ckCss();
  console.assert(/body\.cockpit \.evt-chip\[title="Open Door"\]\{color:#3fb950/.test(css),'CK-6: door not green');
  console.assert(/body\.cockpit \.evt-chip\[title="Kneeling"\]\{color:#4c9dff/.test(css),'CK-6: kneeling not blue');
  console.assert(/body\.cockpit \.evt-chip\[title="Hand Brake"\]\{color:#f85149/.test(css),'CK-6: brake not red');
  console.assert(/body\.cockpit \.nsc\{[^}]*bottom:86px/.test(css),'CK-6: dock not anchored bottom-right');
  console.log('CK-6. stop dock: photo + 3 colour-coded events, bottom-right OK');
})();

// ── CK-7: GPS quality pill reflects accuracy, clock is set ──
(function(){
  updCockpitChrome(8);
  const g=el('ck-gps');
  console.assert(!g.classList.contains('weak')&&!g.classList.contains('bad'),'CK-7: good fix flagged');
  updCockpitChrome(25);
  console.assert(g.classList.contains('weak'),'CK-7: 25 m not flagged weak');
  updCockpitChrome(60);
  console.assert(g.classList.contains('bad'),'CK-7: 60 m not flagged bad');
  console.assert(/^\d\d:\d\d$/.test(el('ck-clock').textContent),'CK-7: clock not set: '+el('ck-clock').textContent);
  console.log('CK-7. GPS pill good/weak/bad + clock OK');
})();

// ── CK-8: leaving navigation leaves cockpit; engine untouched by the UI ──
(function(){
  ckDrive();
  const progBefore=routeProgressM, occBefore=(Playback._currentOccurrence()||{}).occurrenceId;
  setCockpit(false); setCockpit(true); toggleOrientMode(); toggleOrientMode();
  console.assert(routeProgressM===progBefore,'CK-8: UI changed route progress');
  console.assert((Playback._currentOccurrence()||{}).occurrenceId===occBefore,'CK-8: UI changed the occurrence');
  stopNav();
  console.assert(!document.body.classList.contains('cockpit'),'CK-8: cockpit survived stopNav');
  console.log('CK-8. cockpit toggles are inert on engine state; exits with nav OK');
})();

speakText=_realSpeakCk;
console.log('ALL COCKPIT TESTS PASSED');
__group('Cockpit tests');

// ══════════════════════════════════════════════════════════════════════════
//  SHELL v6.1 — cockpit field fixes + one-thumb app shell
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── shell v6.1 ──');
const shCss=()=>document.__cssText||'';

// ── SH-1: the diagonal-wedge regression can never return ──
(function(){
  const css=shCss();
  // base rule keeps the 200% oversize…
  console.assert(/#map\{position:absolute;top:-50%;left:-50%;width:200%;height:200%/.test(css),
    'SH-1: base #map oversize rule lost');
  // …and no cockpit rule shrinks it again
  const bad=/body\.cockpit #map\{[^}]*(width|height):100%/.test(css);
  console.assert(!bad,'SH-1: cockpit overrides #map size — the black wedge is back');
  console.log('SH-1. rotated map keeps 200% oversize in cockpit OK');
})();

// ── SH-2: manoeuvre card is a column — dist, arrow, action, footer in order ──
(function(){
  const css=shCss();
  const m=/body\.cockpit \.hud-instr\{([^}]*)\}/.exec(css);
  console.assert(m&&/flex-direction:column/.test(m[1]),'SH-2: card is not a column');
  // DOM order inside the card is the visual order
  const html=(function(){
    const fs=require('fs'),path=require('path');
    const f=[path.join(__dirname,'index.html'),'/tmp/dev/gpx_nav_dev-main/index.html']
      .find(p=>fs.existsSync(p));
    const h=fs.readFileSync(f,'utf8');
    const i=h.indexOf('<div class="hud-instr" id="hud-instr">');
    return h.slice(i,h.indexOf('hud-instr-speed',i));
  })();
  const order=['ck-dist-row','hud-icon','hud-instr-body','ck-foot'].map(id=>html.indexOf(id));
  console.assert(order.every((v,i)=>v>=0&&(i===0||v>order[i-1])),
    'SH-2: card children out of order: '+order.join(','));
  console.log('SH-2. cockpit card: distance → arrow → action → footer OK');
})();

// ── SH-3: top-right stack has distinct, non-overlapping slots ──
(function(){
  const css=shCss();
  const exit=/body\.cockpit \.cockpit-exit\{[^}]*top:12px/.test(css);
  const dial=/body\.cockpit \.cockpit-speed\{[^}]*top:64px/.test(css)||
             /body\.cockpit \.cockpit-speed\{top:64px\}/.test(css);
  const voice=/body\.cockpit #hud-voice\{[^}]*top:216px/.test(css);
  console.assert(exit,'SH-3: exit button not pinned to the corner');
  console.assert(dial,'SH-3: dial position not fixed');
  console.assert(voice,'SH-3: voice button still floats over the dial');
  console.log('SH-3. exit 12px · dial 64px · voice 212px — separate slots OK');
})();

// ── SH-4: app bar — four areas, icons, ≥56px targets ──
(function(){
  const css=shCss();
  console.assert(/\.stab\{[^}]*min-height:56px/.test(css),'SH-4: tab targets below 56px');
  console.assert(/\.sheet-tabs\{height:62px/.test(css),'SH-4: app bar not 62px');
  const fs=require('fs'),path=require('path');
  const f=[path.join(__dirname,'index.html'),'/tmp/dev/gpx_nav_dev-main/index.html']
    .find(p=>fs.existsSync(p));
  const h=fs.readFileSync(f,'utf8');
  const bar=h.slice(h.indexOf('class="sheet-tabs"'),h.indexOf('<!-- ROTA PANE -->'));
  ['stab-rota','stab-nav','stab-paradas','stab-gravadas'].forEach(id=>{
    const seg=bar.slice(bar.indexOf(id),bar.indexOf(id)+520);
    console.assert(/<svg/.test(seg),'SH-4: tab '+id+' has no icon');
  });
  console.assert(/role="tablist"/.test(bar),'SH-4: tablist role missing');
  console.log('SH-4. app bar: 4 areas with icons, 56px+ targets OK');
})();

// ── SH-5: switching areas still works after the redesign ──
(function(){
  switchTab('gravadas',true);
  console.assert(el('pane-gravadas').classList.contains('active'),'SH-5: recordings pane not active');
  console.assert(el('stab-gravadas').classList.contains('active'),'SH-5: recordings tab not active');
  console.assert(!el('pane-rota').classList.contains('active'),'SH-5: route pane still active');
  switchTab('rota',true);
  console.assert(el('pane-rota').classList.contains('active'),'SH-5: route pane did not return');
  console.log('SH-5. tab switching intact OK');
})();

// ── SH-6: the primary button follows the state machine ──
(function(){
  // no route → the button routes to the Route pane
  const savedPts=routePts; routePts=[]; navActive=false; updBigStart();
  console.assert(/LOAD ROUTE/.test(el('big-start').textContent),'SH-6: empty state label wrong');
  switchTab('gravadas',true);
  bigStartTap();
  console.assert(el('pane-rota').classList.contains('active'),'SH-6: empty tap did not open Route');
  console.assert(navActive===false,'SH-6: navigation started with no route');
  routePts=savedPts;
  // route loaded → START; while navigating → STOP
  const rec=mkRec('sh6',150,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[]);
  loadFresh(rec); navActive=false; updBigStart();
  console.assert(/START/.test(el('big-start').textContent),'SH-6: loaded state label wrong');
  navActive=true; updBigStart();
  console.assert(/STOP/.test(el('big-start').textContent)&&
                 el('big-start').classList.contains('stopping'),'SH-6: nav state label wrong');
  navActive=false; updBigStart();
  console.log('SH-6. LOAD ROUTE → START → STOP state machine OK');
})();

// ── SH-7: engine untouched by any shell interaction ──
(function(){
  const rec=mkRec('sh7',150,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[70]);
  beginPlayback(rec,1);
  drivePts(rec,0,30,30,0);
  const prog=routeProgressM, seg=Playback.lastSegIdx;
  switchTab('paradas',true);switchTab('nav',true);switchTab('rota',true);
  updBigStart();toggleSheetCollapse();toggleSheetCollapse();
  console.assert(routeProgressM===prog&&Playback.lastSegIdx===seg,
    'SH-7: shell interaction moved engine state');
  console.log('SH-7. shell interactions inert on the engine OK');
})();

console.log('ALL SHELL TESTS PASSED');
__group('Shell tests');

// ══════════════════════════════════════════════════════════════════════════
//  FIELD FIXES — 16 Aug screenshots: overflow, sim exit, laps, photo, arrow
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── field fixes 16 aug ──');
const ffCss=()=>document.__cssText||'';

// ── FF-1: no on-map arrow, ever — even after driving through a junction ──
(function(){
  const j=i=>i<=80?{lat:LAT0+i*DLAT,lng:LNG0}:{lat:LAT0+80*DLAT,lng:LNG0+(i-80)*0.00017};
  const rec=mkRec('ff1',160,j,[]);
  beginPlayback(rec,1); el('rng-follow').value='1'; navActive=true; setCockpit(true);
  drivePts(rec,0,120,30,0);
  console.assert(guidanceMarker===null,'FF-1: an arrow marker appeared on the map');
  console.assert(lastGuidance!=null,'FF-1: guidance stopped computing for the card');
  console.log('FF-1. junction driven end to end: card guidance yes, map arrow no OK');
})();

// ── FF-2: the manoeuvre card can never stretch full-width again ──
(function(){
  const css=ffCss();
  const m=/body\.cockpit \.hud-instr\{([^}]*)\}/.exec(css);
  console.assert(m,'FF-2: cockpit card rule missing');
  console.assert(/right:auto!important/.test(m[1]),'FF-2: right not neutralised — v7 stretch returns');
  console.assert(/width:300px!important/.test(m[1]),'FF-2: width not pinned');
  console.assert(/overflow:hidden!important/.test(m[1]),'FF-2: overflow not clipped');
  console.assert(/white-space:nowrap/.test(/body\.cockpit \.hud-instr-dist\{([^}]*)\}/.exec(css)[1]),
    'FF-2: distance can wrap');
  console.log('FF-2. card pinned at 300px, right:auto, overflow hidden OK');
})();

// ── FF-3: ✕ stops a RUNNING SIMULATION, not just navigation ──
(function(){
  const rec=mkRec('ff3',150,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[70]);
  loadFresh(rec);
  startSim(savedRecs.length-1);
  console.assert(simTimer!=null,'FF-3: setup — simulation did not start');
  console.assert(navActive===true,'FF-3: setup — sim did not enter navigation');
  exitNavigation();                       // the cockpit ✕
  console.assert(simTimer===null,'FF-3: simulation still running after ✕');
  console.assert(navActive===false,'FF-3: navigation still active after ✕');
  console.assert(!document.body.classList.contains('cockpit'),'FF-3: cockpit still shown');
  console.log('FF-3. ✕ ends simulation + navigation + cockpit OK');
})();

// ── FF-4: repetitions — stepper reaches ANY count (spec change 16 Aug) ──
(function(){
  // SPEC CHANGE: the original chip cycled presets 1→2→3→5→10→∞ and the field
  // request was explicit — "se quiser 4 vezes, 6, outro número não consigo
  // setar". The chip is now a −/＋ stepper writing through #lap-select
  // (which gained real options 1..20 + ∞; a <select> cannot hold a value it
  // has no option for, which is what made presets the only choice before).
  el('lap-select').value='1'; updLapChip();
  console.assert(el('lap-chip-val').textContent==='1×','FF-4: label wrong: '+el('lap-chip-val').textContent);
  lapChipStep(null,1);lapChipStep(null,1);lapChipStep(null,1);      // 1→4
  console.assert(el('lap-select').value==='4','FF-4: cannot set 4×: '+el('lap-select').value);
  lapChipStep(null,1);lapChipStep(null,1);                          // →6
  console.assert(el('lap-select').value==='6','FF-4: cannot set 6×: '+el('lap-select').value);
  for(let k=0;k<14;k++)lapChipStep(null,1);                         // 6→20
  console.assert(el('lap-select').value==='20','FF-4: upper range wrong: '+el('lap-select').value);
  lapChipStep(null,1);
  console.assert(el('lap-select').value==='inf','FF-4: ∞ unreachable');
  lapChipStep(null,1);
  console.assert(el('lap-select').value==='inf','FF-4: stepped past ∞');
  lapChipStep(null,-1);
  console.assert(el('lap-select').value==='20','FF-4: − from ∞ broken');
  el('lap-select').value='1';lapChipStep(null,-1);
  console.assert(el('lap-select').value==='1','FF-4: lower clamp broken');
  // and playback actually consumes an arbitrary count
  el('lap-select').value='4';
  const rec=mkRec('ff4',150,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[]);
  loadFresh(rec); Playback.begin(el('lap-select').value);
  console.assert(LapManager.totalLaps===4,'FF-4: Playback ignored 4×: '+LapManager.totalLaps);
  Playback.stop(); el('lap-select').value='1'; updLapChip();
  console.log('FF-4. stepper reaches 4×, 6×, 20, ∞; Playback consumes 4× OK');
})();

// ── FF-5: the dock photo is the dominant element ──
(function(){
  const css=ffCss();
  const ph=/body\.cockpit \.nsc-photo\{[^}]*height:(\d+)px/.exec(css);
  const w =/body\.cockpit \.nsc\{[^}]*width:(\d+)px/.exec(css);
  console.assert(ph&&+ph[1]>=180,'FF-5: dock photo only '+(ph&&ph[1])+'px');
  console.assert(w&&+w[1]>=290,'FF-5: dock only '+(w&&w[1])+'px wide');
  console.assert(+ph[1]>48,'FF-5: photo smaller than the distance type');
  console.log(`FF-5. dock ${w[1]}px wide, photo ${ph[1]}px tall OK`);
})();

// ── FF-6: right-edge stack — four distinct vertical slots ──
(function(){
  const css=ffCss();
  const at=(sel,prop='top')=>{
    const m=new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{[^}]*'+prop+':(\\d+)px').exec(css);
    return m?+m[1]:null;
  };
  const exit=at('body.cockpit .cockpit-exit'), dial=at('body.cockpit .cockpit-speed'),
        chip=at('body.cockpit .cockpit-speed-target'), voice=at('body.cockpit #hud-voice');
  console.assert(exit!=null&&dial!=null&&chip!=null&&voice!=null,'FF-6: a slot is unpinned');
  console.assert(exit+44<=dial,'FF-6: exit overlaps the dial');
  console.assert(dial+chip>dial,'FF-6: avg chip above the dial');
  console.assert(voice>=dial+104+chip-70,'FF-6: voice button overlaps the chip zone');
  console.log(`FF-6. exit ${exit} · dial ${dial} · chip +${chip} · voice ${voice} — stacked OK`);
})();

console.log('ALL FIELD-FIX TESTS PASSED');
__group('Field fix tests');

// ══════════════════════════════════════════════════════════════════════════
//  FIELD FIXES 2 — cascade lock, dock fit, vehicle contrast
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── field fixes 2 ──');
const f2Css=()=>document.__cssText||'';

// ── F2-1: ID-locked geometry beats every legacy class rule ──
(function(){
  const css=f2Css();
  const instr=/body\.cockpit #hud-instr\{([^}]*)\}/.exec(css);
  console.assert(instr,'F2-1: no ID rule for the manoeuvre card');
  console.assert(/padding:18px 20px 14px!important/.test(instr[1]),
    'F2-1: padding not locked — v7 padding:0 wins again');
  console.assert(/max-height:none!important/.test(instr[1]),'F2-1: min/max-height not neutralised');
  console.assert(/width:300px!important/.test(instr[1]),'F2-1: width not locked');
  // CSS CLEANUP (16 Aug, by request): the v4-v7 conflicting generations were
  // REMOVED, so this sentinel flips — the padding:0 rule must now be absent.
  console.assert(!/body\.driver-mode \.hud-instr\{[^}]*padding:0!important/.test(css),
    'F2-1: a driver-mode padding:0 card rule crept back in');
  console.log('F2-1. #hud-instr ID lock: padding, width, heights OK');
})();

// ── F2-2: the dock can no longer be clipped at 310px ──
(function(){
  const css=f2Css();
  const nsc=/body\.cockpit #nsc\{([^}]*)\}/.exec(css);
  console.assert(nsc,'F2-2: no ID rule for the stop dock');
  console.assert(/bottom:86px!important/.test(nsc[1]),'F2-2: dock not bottom-anchored');
  console.assert(/max-height:calc\(100vh - 170px\)!important/.test(nsc[1]),
    'F2-2: dock max-height not viewport-derived');
  console.assert(/min-height:0!important/.test(nsc[1]),'F2-2: v7 min-height:188 can still win');
  // CSS CLEANUP (16 Aug): the 310px clipping rule was removed with the rest
  // of the v4-v7 generations — it must stay gone.
  console.assert(!/body\.driver-mode \.nsc\{[^}]*max-height:310px!important/.test(css),
    'F2-2: the 310px dock-clipping rule crept back in');
  // content budget fits: photo 180 + chrome must stay under the max at 1060px
  const ph=/body\.cockpit #nsc \.nsc-photo\{height:(\d+)px!important/.exec(css);
  console.assert(ph&&+ph[1]<=180,'F2-2: photo '+(ph&&ph[1])+'px busts the height budget');
  console.assert(/body\.cockpit #nsc \.nsc-leg\{display:none!important/.test(css),
    'F2-2: dev pacing row still occupies dock space');
  console.log(`F2-2. #nsc bottom-anchored, max-height viewport-derived, photo ${ph[1]}px OK`);
})();

// ── F2-3: every cockpit card is ID-locked, not class-locked ──
(function(){
  const css=f2Css();
  // two generations of body.cockpit ID rules can coexist (the earlier round
  // wrote one without position); the LOCK is satisfied if any block carries
  // the full set — in the cascade the later one wins anyway.
  ['#cockpit-speed','#cockpit-exit','#hud-voice'].forEach(id=>{
    const re=new RegExp('body\\.cockpit '+id+'\\{([^}]*)\\}','g');
    let m,ok=false;
    while((m=re.exec(css)))if(/position:absolute!important/.test(m[1])&&/right:14px!important/.test(m[1]))ok=true;
    console.assert(ok,'F2-3: '+id+' not ID-locked');
  });
  console.log('F2-3. speed dial, exit, voice — ID-locked OK');
})();

// ── F2-4: vehicle marker carries the white contrast puck ──
(function(){
  const rec=mkRec('f24',150,i=>({lat:LAT0+i*DLAT,lng:LNG0}),[]);
  beginPlayback(rec,1); el('rng-follow').value='1'; navActive=true; posMarker=null;
  drivePts(rec,0,8,30,0);
  const html=posMarker._icon.html;
  console.assert(/veh-puck/.test(html),'F2-4: no puck behind the bus');
  console.assert(html.indexOf('veh-puck')<html.indexOf('veh-bus'),
    'F2-4: puck drawn over the bus, not under');
  console.assert(/fill="#1a6ef5"/.test(html),'F2-4: bus body still the pale route blue');
  console.assert(/stroke-width="3.2"/.test(html),'F2-4: bus outline not thickened');
  const css=f2Css();
  console.assert(/\.veh-puck\{[^}]*background:#fff/.test(css),'F2-4: puck is not solid white');
  console.log('F2-4. white puck under a deep-blue, heavy-outline bus OK');
})();

console.log('ALL FIELD-FIX-2 TESTS PASSED');
__group('Field fix 2 tests');

// ══════════════════════════════════════════════════════════════════════════
//  CSS HYGIENE — the cleaned stylesheet must stay clean
//  (The scanner is depth-aware: a responsive override inside @media is the
//  intended mechanism, not a duplicated generation — the first version of
//  these checks flagged exactly that and was wrong, not the CSS.)
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── css hygiene ──');
(function(){
  const css=document.__cssText||'';
  const strip=s=>s.replace(/\/\*[\s\S]*?\*\//g,'');
  // level-aware rule walk: returns [{sel,level}] where level 0 = top,
  // and rules inside a media query carry that media's own scope id
  function walk(text,scope,out){
    let i=0;
    while(true){
      const j=text.indexOf('{',i); if(j<0)break;
      const sel=text.slice(i,j).trim();
      let d=0,k=j;
      for(;k<text.length;k++){if(text[k]==='{')d++;else if(text[k]==='}'){d--;if(!d)break;}}
      if(sel.startsWith('@media')) walk(text.slice(j+1,k),scope+'|'+sel.replace(/\s+/g,''),out);
      else out.push({sel,scope});
      i=k+1;
    }
    return out;
  }
  const sels=walk(strip(css),'top',[]);
  const CARD=/hud-instr|\.nsc|cockpit-speed|hud-voice|hud-strip|lap-badge|hud-compass|hud-spd|hud-tgt|hud-icon/;

  // H-1: zero driver-mode card rules — the five dead generations stay dead
  const zombie=sels.filter(r=>/driver-mode/.test(r.sel)&&(CARD.test(r.sel)||/evt-chip|cockpit-exit/.test(r.sel)));
  console.assert(zombie.length===0,'H-1: driver-mode card rules returned: '+zombie.slice(0,3).map(r=>r.sel).join(' | '));
  console.log('H-1. zero driver-mode card rules OK');

  // H-2: the guidance-marker css died with the marker
  console.assert(!/\.guid-(wrap|icon)/.test(strip(css)),'H-2: retired .guid-* css returned');
  console.log('H-2. no orphan .guid-* rules OK');

  // H-3: exactly ONE top-level lock generation per cockpit card
  //      (the @media copy is the responsive override, counted separately)
  ['#hud-instr','#nsc'].forEach(id=>{
    const top=sels.filter(r=>r.scope==='top'&&r.sel==='body.cockpit '+id).length;
    console.assert(top===1,'H-3: '+id+' has '+top+' top-level lock generations (must be 1)');
    const med=sels.filter(r=>r.scope!=='top'&&r.sel==='body.cockpit '+id).length;
    console.assert(med<=1,'H-3: '+id+' has '+med+' media overrides (max 1)');
  });
  console.log('H-3. one top-level lock + at most one media override per card OK');

  // H-4: within any single scope, no selector appears twice — stacked
  //      same-level generations are the conflict pattern we just removed
  const seen={};let dup=null;
  sels.filter(r=>/driver-mode/.test(r.sel)).forEach(r=>{
    const k=r.scope+'::'+r.sel.replace(/\s+/g,' ');
    if(seen[k])dup=k; seen[k]=1;
  });
  console.assert(!dup,'H-4: duplicated driver-mode generation in one scope: '+dup);
  console.log('H-4. no same-scope duplicated driver-mode selectors OK');

  // H-5: the layer contract is documented at the top of the sheet
  console.assert(/STYLE LAYERS/.test(css)&&/CASCADE LOCK/.test(css),'H-5: layer banner missing');
  console.log('H-5. layer contract banner present OK');
})();
console.log('ALL CSS-HYGIENE TESTS PASSED');
__group('CSS hygiene tests');

// ══════════════════════════════════════════════════════════════════════════
//  CYCLE SEQUENCE — playlist of recordings with per-item repetitions
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── cycle sequence ──');
const _realSpeakSq=speakText;
speakText=(t,f)=>{_spoken.push(String(t));};

/* two small closed loops, geometrically apart, each with one stop */
const sqLoopA=i=>i<75?{lat:LAT0+i*DLAT,lng:LNG0}
                    :{lat:LAT0+(149-i)*DLAT,lng:LNG0+0.00012};
const sqLoopB=i=>i<75?{lat:LAT0+0.02+i*DLAT,lng:LNG0+0.02}
                    :{lat:LAT0+0.02+(149-i)*DLAT,lng:LNG0+0.02+0.00012};
function sqSetup(){
  Sequence.clear(); _spoken=[];
  const A=mkRec('seqA',150,sqLoopA,[40]); A.name='city loop';
  const B=mkRec('seqB',150,sqLoopB,[40]); B.name='rural loop';
  B.stops[0].events=['openDoor'];
  savedRecs.push(A); const ia=savedRecs.length-1;
  savedRecs.push(B); const ib=savedRecs.length-1;
  return {A,B,ia,ib};
}
function sqDriveLap(rec,base,hdgAdj){
  // one full loop: north leg then south leg back to start
  for(let i=0;i<75;i++){const p=rec.points[i];gpsH(p.lat,p.lng,30,0);}
  for(let i=75;i<150;i++){const p=rec.points[i];gpsH(p.lat,p.lng,30,180);}
}

// ── SEQ-1: builder — add, per-item laps, remove, persistence round-trip ──
(function(){
  const {ia,ib}=sqSetup();
  Sequence.add(ia,1); Sequence.add(ib,1); Sequence.add(ia,1);
  console.assert(Sequence.items.length===3,'SEQ-1: add failed');
  // steppers (spec change 16 Aug): any count, including the 4 the presets
  // could never express
  Sequence.setLaps(0,1);Sequence.setLaps(0,1);Sequence.setLaps(0,1);  // 1→4
  console.assert(Sequence.items[0].laps===4,'SEQ-1: cannot set 4 laps: '+Sequence.items[0].laps);
  Sequence.setLaps(0,-1);Sequence.setLaps(0,-1);Sequence.setLaps(0,-1);Sequence.setLaps(0,-1);
  console.assert(Sequence.items[0].laps===1,'SEQ-1: lower clamp broken');
  Sequence.setLaps(0,1);Sequence.setLaps(0,1);Sequence.setLaps(0,1);Sequence.setLaps(0,1);  // →5
  console.assert(Sequence.items[0].laps===5,'SEQ-1: stepper drifted: '+Sequence.items[0].laps);
  Sequence.remove(2);
  console.assert(Sequence.items.length===2,'SEQ-1: remove failed');
  const saved=JSON.parse(localStorage.getItem('gpx-seq'));
  console.assert(saved.items.length===2&&saved.items[0].laps===5,'SEQ-1: not persisted');
  Sequence.items=[];Sequence.restore();
  console.assert(Sequence.items.length===2&&Sequence.items[0].name==='city loop',
    'SEQ-1: restore lost the builder');
  console.log('SEQ-1. builder + persistence round-trip OK');
})();

// ── SEQ-2: start loads the first cycle with its lap count ──
(function(){
  const {A,ia,ib}=sqSetup();
  Sequence.add(ia,2); Sequence.add(ib,1);
  console.assert(Sequence.start()===true,'SEQ-2: start refused');
  console.assert(routePts.length===A.points.length,'SEQ-2: first cycle not loaded');
  console.assert(LapManager.totalLaps===2,'SEQ-2: item laps not applied: '+LapManager.totalLaps);
  console.assert(Playback.active===true&&Sequence.active===true,'SEQ-2: not running');
  console.assert(saidMatching(/Sequence started\. Cycle 1 of 2: city loop/).length===1,
    'SEQ-2: start voice missing');
  console.assert(/CYCLE 1\/2/.test(el('seq-badge').textContent),'SEQ-2: badge wrong: '+el('seq-badge').textContent);
  exitNavigation();
  console.log('SEQ-2. start → city loop, 2 laps, badge CYCLE 1/2 OK');
})();

// ── SEQ-3: full progression — laps within item, then advance to next item ──
(function(){
  // COMPLETE fires ~40 m before the loop closes and the advance runs on the
  // very next fix, i.e. INSIDE a naive full-loop drive. The observation
  // points therefore sit fix-by-fix around the boundary.
  const {A,B,ia,ib}=sqSetup();
  Sequence.add(ia,2); Sequence.add(ib,1);
  Sequence.start(); markDone(stops[0].id);
  sqDriveLap(A);                                   // lap 1 of city
  console.assert(LapManager.currentLap===2,'SEQ-3: lap 1→2 did not advance');
  console.assert(Sequence.cur===0,'SEQ-3: sequence advanced too early');
  markDone(stops[0].id);
  // lap 2: stop short of the boundary, then step fix-by-fix
  for(let i=0;i<140;i++){const p=A.points[i];gpsH(p.lat,p.lng,30,i<75?0:180);}
  console.assert(Sequence.cur===0&&Playback.state!=='COMPLETE','SEQ-3: completed too early');
  let sawComplete=false;
  for(let i=140;i<150;i++){
    const p=A.points[i];gpsH(p.lat,p.lng,30,180);
    if(Playback.state==='COMPLETE'){sawComplete=true;
      console.assert(Sequence._pendingAdvance===true,'SEQ-3: COMPLETE without advance flag');
      break;}
  }
  console.assert(sawComplete,'SEQ-3: item 1 never completed');
  console.assert(Sequence.cur===0,'SEQ-3: advance ran mid-fix instead of between fixes');
  const p0=B.points[0]; gpsH(p0.lat,p0.lng,20,0);  // next fix executes the advance
  console.assert(Sequence.cur===1,'SEQ-3: did not advance to item 2');
  console.assert(routePts.length===B.points.length&&
    Math.abs(routePts[0].lat-B.points[0].lat)<1e-9,'SEQ-3: rural loop not loaded');
  console.assert(Playback.active&&Playback.state!=='COMPLETE','SEQ-3: playback not re-armed');
  console.assert(LapManager.totalLaps===1&&LapManager.currentLap===1,'SEQ-3: item 2 laps wrong');
  console.assert(saidMatching(/Cycle 2 of 2: rural loop/).length===1,'SEQ-3: transition voice missing');
  console.assert(routeProgressM<100,'SEQ-3: matcher not reset on new cycle: '+routeProgressM.toFixed(0));
  console.assert(stops[0].state==='waiting','SEQ-3: rural stop not fresh');
  console.log('SEQ-3. city ×2 → COMPLETE at boundary → advance on next fix → rural ×1 OK');
})();

// ── SEQ-4: voice ownership intact in the SECOND cycle of a sequence ──
(function(){
  _spoken=[];
  el('rng-radius').value='80';
  const B=savedRecs[savedRecs.length-1];
  for(let i=1;i<=41;i++){const p=B.points[i];gpsH(p.lat,p.lng,25,0);}
  console.assert(saidMatching(/Stop 1 in 200 meters/).length===1,
    'SEQ-4: scheduler approach voice lost after transition: '+JSON.stringify(_spoken.slice(0,4)));
  console.assert(saidMatching(/open doors required/).length>=1,'SEQ-4: event voice lost');
  console.assert(saidMatching(/^Arrived at stop/).length===0,'SEQ-4: engine arrival voice leaked');
  console.log('SEQ-4. scheduler owns stop voice in cycle 2 OK');
})();

// ── SEQ-5: sequence completion — one line, then silence, no restart ──
(function(){
  const B=savedRecs[savedRecs.length-1];
  markDone(stops[0].id); _spoken=[];
  sqDriveLap(B);                                   // only lap of rural → COMPLETE
  const p0=B.points[0]; gpsH(p0.lat,p0.lng,20,0);  // fix that would advance
  console.assert(saidMatching(/Sequence complete/).length===1,'SEQ-5: completion voice missing/dup');
  console.assert(Sequence.active===false,'SEQ-5: sequence still active');
  console.assert(el('seq-badge').textContent==='SEQUENCE COMPLETE','SEQ-5: badge not final');
  const lapBefore=LapManager.currentLap;
  for(let i=0;i<10;i++)gpsH(p0.lat,p0.lng,20,0);
  console.assert(LapManager.currentLap===lapBefore&&Playback.state==='COMPLETE',
    'SEQ-5: something restarted after completion');
  console.assert(saidMatching(/Sequence complete/).length===1,'SEQ-5: completion voice repeated');
  exitNavigation();
  console.log('SEQ-5. one completion line, then silence — §22 held OK');
})();

// ── SEQ-6: recordings reordered between sessions → resolved by NAME ──
(function(){
  const {ia,ib}=sqSetup();
  Sequence.add(ia,1);
  // simulate a reload where an extra rec shifted every index
  savedRecs.splice(ia,0,null);
  const idx=Sequence._recIdx(Sequence.items[0]);
  console.assert(savedRecs[idx]&&savedRecs[idx].name==='city loop',
    'SEQ-6: name fallback failed — would load the wrong cycle');
  savedRecs.splice(ia,1);
  console.log('SEQ-6. index shift resolved by name OK');
})();

// ── SEQ-7: guards — empty start refused; ✕ mid-sequence stops it ──
(function(){
  Sequence.clear();
  console.assert(Sequence.start()===false,'SEQ-7: empty sequence started');
  console.assert(!Sequence.active&&!navActive,'SEQ-7: state leaked');
  const {ia,ib}=sqSetup();
  Sequence.add(ia,1);Sequence.add(ib,1);
  Sequence.start();
  exitNavigation();                                 // driver presses ✕ mid-sequence
  console.assert(Sequence.active===false,'SEQ-7: ✕ did not stop the sequence');
  console.assert(Playback.active===false&&navActive===false,'SEQ-7: playback survived ✕');
  console.log('SEQ-7. empty-start refused; ✕ ends the whole sequence OK');
})();

// ── SEQ-8: adding gives visible confirmation ──
(function(){
  const {ia}=sqSetup();
  const btn={textContent:'＋ Seq',classList:{_s:new Set(),
    add(c){this._s.add(c)},remove(c){this._s.delete(c)},contains(c){return this._s.has(c)}}};
  // The harness runs timers ≤1000 ms inline (runner.js:87), so the 900 ms
  // pulse-removal executes synchronously and the class can't be observed
  // AFTER seqAdd returns. Observed through a spy on classList.add instead —
  // the app behaviour (add then timed remove) is exactly what's asserted.
  const barCl=el('seq-bar').classList; const seen=[];
  const _add=barCl.add.bind(barCl);
  barCl.add=(...c)=>{seen.push(...c);return _add(...c);};
  seqAdd(ia,btn);
  barCl.add=_add;
  console.assert(/✓ Added \(1\)/.test(btn.textContent),'SEQ-8: button did not confirm: '+btn.textContent);
  console.assert(btn.classList.contains('seq-added'),'SEQ-8: button not highlighted');
  console.assert(seen.includes('pulse'),'SEQ-8: sequence bar never pulsed');
  console.assert(!barCl.contains('pulse'),'SEQ-8: pulse not scheduled for removal');
  console.assert(/1 recordings · 1 cycles/.test(el('seq-total').textContent),
    'SEQ-8: total counter wrong: '+el('seq-total').textContent);
  console.assert(/city loop/.test(el('seq-chips').innerHTML),'SEQ-8: chip not rendered');
  const css=document.__cssText||'';
  console.assert(/\.seq-bar\{position:sticky/.test(css),'SEQ-8: bar not sticky — invisible while scrolling');
  console.log('SEQ-8. add confirms on the button, pulses the sticky bar, updates totals OK');
})();

// ── SEQ-9: the exact field scenario — 4× city, 2× rural, 1× highway ──
(function(){
  Sequence.clear();
  const C=mkRec('sq9c',150,sqLoopA,[40]); C.name='Cycle city';
  const R=mkRec('sq9r',150,sqLoopB,[40]); R.name='Cycle rural';
  const H=mkRec('sq9h',150,sqLoopA,[]);   H.name='Cycle highway';
  savedRecs.push(C,R,H);
  const b=savedRecs.length;
  Sequence.add(b-3,1);Sequence.add(b-2,1);Sequence.add(b-1,1);
  Sequence.setLaps(0,1);Sequence.setLaps(0,1);Sequence.setLaps(0,1);   // city → 4
  Sequence.setLaps(1,1);                                               // rural → 2
  console.assert(Sequence.items.map(x=>x.laps).join(',')==='4,2,1',
    'SEQ-9: 4/2/1 not expressible: '+Sequence.items.map(x=>x.laps));
  console.assert(/3 recordings · 7 cycles/.test(el('seq-total').textContent),
    'SEQ-9: total wrong: '+el('seq-total').textContent);
  console.assert(Sequence.start()===true,'SEQ-9: start refused');
  console.assert(LapManager.totalLaps===4,'SEQ-9: city not 4 laps');
  console.assert(/CYCLE 1\/3 · Cycle city/.test(el('seq-badge').textContent),'SEQ-9: badge wrong');
  exitNavigation();
  console.log('SEQ-9. 4× city → 2× rural → 1× highway: built, counted 7, started OK');
})();


// ── SEQ-10: the sequence is visible and startable WITHOUT scrolling ──
(function(){
  const {ia,ib}=sqSetup();
  console.assert(el('seq-peek').style.display==='none','SEQ-10: pill visible with empty sequence');
  Sequence.add(ia,1); Sequence.add(ib,1);
  Sequence.setLaps(0,1);Sequence.setLaps(0,1);Sequence.setLaps(0,1);   // 4×
  Sequence.setLaps(1,1);                                               // 2×
  console.assert(el('seq-peek').style.display!=='none','SEQ-10: pill hidden with items');
  console.assert(el('seq-peek').textContent==='▶ SEQ 2·6×',
    'SEQ-10: pill label wrong: '+el('seq-peek').textContent);
  // one tap starts the sequence from the always-visible row
  seqPeekTap();
  console.assert(Sequence.active===true&&navActive===true,'SEQ-10: pill tap did not start');
  console.assert(LapManager.totalLaps===4,'SEQ-10: first item laps wrong');
  console.assert(el('seq-peek').style.display==='none','SEQ-10: pill still visible while running');
  seqPeekTap();                                            // tap while active = no-op
  console.assert(Sequence.cur===0,'SEQ-10: tap while active restarted the sequence');
  exitNavigation();
  console.assert(el('seq-peek').style.display!=='none','SEQ-10: pill did not return after exit');
  // and the in-pane bar now lives in a REAL scroller so sticky can pin
  const fs=require('fs'),path=require('path');
  const f=[path.join(__dirname,'index.html'),'/tmp/dev/gpx_nav_dev-main/index.html'].find(p=>fs.existsSync(p));
  const html=fs.readFileSync(f,'utf8');
  console.assert(/id="pane-gravadas" style="overflow-y:auto/.test(html),
    'SEQ-10: recordings pane is not its own scroller — sticky dies at .pane overflow:hidden');
  Sequence.clear();
  console.assert(el('seq-peek').style.display==='none','SEQ-10: pill survived clear');
  console.log('SEQ-10. pill: hidden→"▶ SEQ 2·6×"→starts→hides→returns; pane scrolls itself OK');
})();


// ── SEQ-11: DOM CONTRACT — every id the JS references must exist in the
//    REAL html. The el() mock auto-creates any id on demand, which is how
//    61 sequence tests passed while 7 of these elements were missing from
//    the shipped file (16 Aug). This check reads the source, not the mock.
(function(){
  const fs=require('fs'),path=require('path');
  const f=[path.join(__dirname,'index.html'),'/tmp/dev/gpx_nav_dev-main/index.html']
    .find(p=>fs.existsSync(p));
  const html=fs.readFileSync(f,'utf8');
  const need=['seq-bar','seq-total','seq-clear','seq-chips','seq-start',
              'seq-resume','seq-badge','seq-peek'];
  const miss=need.filter(id=>!html.includes('id="'+id+'"'));
  console.assert(miss.length===0,'SEQ-11: ids referenced by JS but absent from the DOM: '+miss.join(', '));
  // structure per spec: builder inside the recordings pane, before the list;
  // badge inside the nav layer
  const iPane=html.indexOf('id="pane-gravadas"'),iBar=html.indexOf('id="seq-bar"'),
        iList=html.indexOf('id="rec-list"');
  console.assert(iPane>=0&&iPane<iBar&&iBar<iList,'SEQ-11: seq-bar not inside pane-gravadas before rec-list');
  const iHud=html.indexOf('class="nav-hud"'),iBadge=html.indexOf('id="seq-badge"');
  console.assert(iHud>=0&&iHud<iBadge,'SEQ-11: seq-badge outside the nav layer');
  // buttons wired to the single source of truth (§8)
  console.assert(/id="seq-clear" onclick="Sequence\.clear\(\)"/.test(html),'SEQ-11: CLEAR not wired');
  console.assert(/id="seq-start" onclick="Sequence\.start\(\)"/.test(html),'SEQ-11: START not wired');
  console.assert(/id="seq-resume" onclick="Sequence\.resume\(\)"/.test(html),'SEQ-11: RESUME not wired');
  // init order (§13): restore() runs after the markup exists
  console.assert(html.indexOf('Sequence.restore()')>iBar,'SEQ-11: restore() called before the DOM');
  console.log('SEQ-11. DOM contract: all 8 ids real, correctly nested and wired OK');
})();

speakText=_realSpeakSq;
console.log('ALL SEQUENCE TESTS PASSED');
__group('Sequence tests');
