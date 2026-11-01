import test from 'node:test';
import assert from 'node:assert/strict';
import {liveRouteProgress,greatCircleDistanceKm} from '../app/lib/liveFlightProgress.ts';

const T='2026-11-01T17:00:00.000Z';
const a={lat:47.2602,lon:11.3439}; // LOWI Innsbruck
const via={lat:49,lon:12};
const b={lat:52.203,lon:13.16}; // EDAZ Schoenhagen

test('Distance follows SimBrief bends instead of direct shortcut',()=>{
 const metrics=liveRouteProgress([a,via,b],via,360,T,false);
 assert.equal(metrics.status,'on-route');
 assert.ok(metrics.routeKm>greatCircleDistanceKm(a,b));
 assert.ok(metrics.progress>0&&metrics.progress<100);
 assert.ok(metrics.completedKm>0&&metrics.remainingKm>0);
 assert.ok(metrics.etaMinutes>0&&metrics.etaAtUtc);
});
test('Approaching destination yields almost full progress',()=>{
 const m=liveRouteProgress([a,via,b],b,150,T,false);
 assert.equal(m.status,'on-route');
 assert.equal(m.progress,100);
 assert.equal(m.remainingKm,0);
});
test('Off-route aircraft has no invented percentage or ETA',()=>{
 const m=liveRouteProgress([a,via,b],{lat:40,lon:2},450,T,false);
 assert.equal(m.status,'off-route');
 assert.equal(m.progress,null);
 assert.equal(m.remainingKm,null);
 assert.equal(m.etaMinutes,null);
 assert.ok(m.crossTrackKm>40);
});
test('Low ground speed or ground status suppresses misleading ETA',()=>{
 const taxi=liveRouteProgress([a,b],a,7,T,true);
 assert.equal(taxi.progress,0);
 assert.equal(taxi.etaMinutes,null);
 const slow=liveRouteProgress([a,b],via,30,T,false,200);
 assert.equal(slow.etaMinutes,null);
});
test('Without a prepared route no live progress can be claimed',()=>{
 const m=liveRouteProgress([],a,300,T,false);
 assert.equal(m.status,'no-plan');
 assert.equal(m.progress,null);
});
test('Date line crossing remains finite and short',()=>{
 const m=liveRouteProgress([{lat:30,lon:179},{lat:30,lon:-179}],{lat:30,lon:180},390,T,false);
 assert.equal(m.status,'on-route');
 assert.ok(m.progress>40&&m.progress<60);
 assert.ok(m.routeKm<300);
});
