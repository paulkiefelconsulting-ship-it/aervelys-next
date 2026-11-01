// Offline check for the read-only local bridge data mapping.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../app/lib/localBridgeTelemetry.ts'),'utf8');
const transpiled=ts.transpileModule(source,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,strict:true
}}).outputText;
const moduleExports={};
new Function('exports',transpiled)(moduleExports);
const {decodeLocalBridgeTelemetry:parse}=moduleExports;
const local={
  phase:'Cruise',latitude:50.38209,longitude:12.60261,
  altitude:29395,groundSpeed:455,airspeed:238,
  vertical_speed_fpm:0,elapsed_seconds:600
};
const initial=parse(local);
assert.equal(initial.phase,'Cruise');
assert.equal(initial.altitude_ft,null,'unqualified altitude must not be assumed feet');
assert.equal(initial.agl_ft,null,'MSL must not be displayed as AGL');
assert.equal(initial.groundspeed_kt,null,'unqualified speed must not be assumed knots');
assert.equal(initial.indicated_airspeed_kt,null);
assert.equal(initial.vertical_speed_fpm,0);
assert.ok(initial.missingForCloudBridge.some(s=>s.includes('altitude_ft')));
const mapped=parse(local,{
 altitude_ft:{key:'altitude',unit:'ft'},
 groundspeed_kt:{key:'groundSpeed',unit:'kt'},
 indicated_airspeed_kt:{key:'airspeed',unit:'kt'}
});
assert.equal(mapped.altitude_ft,29395);
assert.equal(mapped.agl_ft,null,'MSL must not become AGL automatically');
assert.equal(mapped.groundspeed_kt,455);
assert.equal(mapped.indicated_airspeed_kt,238);
assert.equal(mapped.missingForCloudBridge.some(s=>s.includes('altitude_ft')),false);
assert.ok(mapped.missingForSimMission.some(s=>s.includes('agl_ft')));
const meters=parse({altitude_m:1200,groundspeed_ms:100,ias_ms:80,agl_m:900,vs_ms:-3},{
 altitude_ft:{key:'altitude_m',unit:'m'},
 agl_ft:{key:'agl_m',unit:'m'},
 groundspeed_kt:{key:'groundspeed_ms',unit:'mps'},
 indicated_airspeed_kt:{key:'ias_ms',unit:'mps'},
 vertical_speed_fpm:{key:'vs_ms',unit:'mps'}
});
assert.ok(Math.abs(meters.altitude_ft-3937.007874)<0.01);
assert.ok(Math.abs(meters.agl_ft-2952.755905)<0.01);
assert.ok(Math.abs(meters.groundspeed_kt-194.3844492)<0.01);
assert.ok(Math.abs(meters.indicated_airspeed_kt-155.50755936)<0.01);
assert.ok(Math.abs(meters.vertical_speed_fpm+590.5511811)<0.01);
assert.equal(parse({altitude_m:2000},{altitude_ft:{key:'altitude_m',unit:'invalid'}}).altitude_ft,null);
assert.equal(parse({altitude_m:150000},{altitude_ft:{key:'altitude_m',unit:'m'}}).altitude_ft,null);
assert.equal(parse({altitudeFt:30000,groundSpeedKt:410,iasKt:270,aglFt:29000}).altitude_ft,30000);
assert.equal(parse({altitudeFt:30000,groundSpeedKt:410,iasKt:270,aglFt:29000}).groundspeed_kt,410);
assert.equal(parse({altitudeFt:30000,groundSpeedKt:410,iasKt:270,aglFt:29000}).indicated_airspeed_kt,270);
console.log('PASS: local bridge telemetry names, explicit source units, ranges, MSL/AGL separation');
