import test from 'node:test';
import assert from 'node:assert/strict';
import {bridgeLinkStatus} from '../app/lib/bridgeLinkHealth.ts';

const start=100_000;
test('unconnected browser stays demo; selected folder is connecting',()=>{
 assert.equal(bridgeLinkStatus(false,false,0,start),'disconnected');
 assert.equal(bridgeLinkStatus(true,false,0,start),'connecting');
});
test('one temporary invalid JSON read must NOT reset the flight',()=>{
 assert.equal(bridgeLinkStatus(true,true,start,start+1000),'live');
 assert.equal(bridgeLinkStatus(true,true,start,start+2400),'live');
 assert.equal(bridgeLinkStatus(true,true,start,start+5900),'live');
});
test('long interruption shows paused tracker, not disconnected/demo',()=>{
 assert.equal(bridgeLinkStatus(true,true,start,start+7000),'interrupted');
 assert.equal(bridgeLinkStatus(true,true,start,start+30000),'interrupted');
});
test('next fresh reading resumes same tracked session',()=>{
 assert.equal(bridgeLinkStatus(true,true,start+30_100,start+30_500),'live');
});
test('user disconnect is the only transition back to demo',()=>{
 assert.equal(bridgeLinkStatus(false,false,0,start+50_000),'disconnected');
});
