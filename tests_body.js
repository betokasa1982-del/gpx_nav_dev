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

// ── PLAYBACK-23: turn instructions still speak during playback ──
(function(){
  // straight north, then a 90° right — a genuine maneuver, no stops nearby
  const corner=i=>i<=80?{lat:LAT0+i*DLAT,lng:LNG0}
                       :{lat:LAT0+80*DLAT,lng:LNG0+(i-80)*0.00017};
  const rec=mkRec('pb23',160,corner,[]);
  beginPlayback(rec,1);
  lastVoiceKey='';lastVoiceManeuver='';
  console.assert(Playback.active===true,'PB-23: playback not active');
  console.assert(maneuvers.some(m=>m.type==='right'),'PB-23: setup — no turn in the route');
  drivePts(rec,20,72,40,0);
  const turnVoice=saidMatching(/right|left|turn/i);
  console.assert(turnVoice.length>=1,
    'PB-23: turn voice suppressed during playback: '+JSON.stringify(_spoken));
  console.log('PB-23. turn voice still speaks during playback: "'+turnVoice[0]+'" OK');
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
