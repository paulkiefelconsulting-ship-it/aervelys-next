'use strict';
// OurAirports public-domain geocoordinates, checked 2026-11-02.
// Simulator entertainment only; NOT for actual navigation or dispatch.
// Source: https://ourairports.com/data/
const AIRPORTS=Object.freeze({
 EDAZ:[52.204631,13.159526],EDDB:[52.361738,13.502341],
 EDDC:[51.134123,13.767831],EDDP:[51.420657,12.232705],
 EDDE:[50.978281,10.960713],EDDH:[53.630402,9.988230],
 EDDV:[52.461102,9.685080],EDDN:[49.498699,11.078056],
 EDDM:[48.353802,11.786100],EDDK:[50.865898,7.142740],
 EDDW:[53.046786,8.789320],EDDS:[48.689899,9.221960],
 LOWW:[48.110298,16.569700],LKPR:[50.100874,14.259911],
 LSZH:[47.458056,8.548056],LFPB:[48.962276,2.436539],
 EDDG:[52.133816,7.688482]
});
function nmBetween(a,b){
 if(!Array.isArray(a)||!Array.isArray(b)||a.length!==2||b.length!==2||
   !a.concat(b).every(Number.isFinite))return Infinity;
 const d=Math.PI/180;
 const phi1=a[0]*d,phi2=b[0]*d;
 const h=Math.sin((phi2-phi1)/2)**2+
  Math.cos(phi1)*Math.cos(phi2)*Math.sin((b[1]-a[1])*d/2)**2;
 return 3440.065*2*Math.asin(Math.min(1,Math.sqrt(Math.max(0,h))));
}
function distanceFrom(icao,latitude,longitude){
 const location=AIRPORTS[icao];
 if(!location||!Number.isFinite(latitude)||!Number.isFinite(longitude)||
   Math.abs(latitude)>90||Math.abs(longitude)>180)return Infinity;
 return nmBetween(location,[latitude,longitude]);
}
module.exports={AIRPORTS,nmBetween,distanceFrom};
