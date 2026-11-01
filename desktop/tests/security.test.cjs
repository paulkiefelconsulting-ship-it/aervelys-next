'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {NEXT_URL,isInternal,isExternalAllowed} = require('../security.cjs');

test('NEXT HTTPS origin is the only embedded remote website', () => {
  assert.equal(isInternal(NEXT_URL),true);
  assert.equal(isInternal(NEXT_URL + 'login?next=%2F'),true);
  assert.equal(isInternal('http://aervelys-next-paulkiefelconsulting-9108.vercel.app/'),false);
  assert.equal(isInternal('https://aervelys-next-paulkiefelconsulting-9108.vercel.app.evil.example/'),false);
  assert.equal(isInternal('https://evil.example@aervelys-next-paulkiefelconsulting-9108.vercel.app/'),false);
  assert.equal(isInternal('file:///C:/Windows/System32'),false);
  assert.equal(isInternal('javascript:alert(1)'),false);
});

test('external browser launch uses a narrow HTTPS host allowlist', () => {
  assert.equal(isExternalAllowed('https://www.simbrief.com/'),true);
  assert.equal(isExternalAllowed('https://github.com/paulkiefelconsulting-ship-it/aervelys-next'),true);
  assert.equal(isExternalAllowed('https://attacker.example/'),false);
  assert.equal(isExternalAllowed('https://www.simbrief.com.evil.example/'),false);
  assert.equal(isExternalAllowed('http://www.simbrief.com/'),false);
  assert.equal(isExternalAllowed('https://www.simbrief.com:444/'),false);
  assert.equal(isExternalAllowed('https://other.example@www.simbrief.com/'),false);
  assert.equal(isExternalAllowed('mailto:test@example.com'),false);
  assert.equal(isExternalAllowed('file:///tmp/a'),false);
});
