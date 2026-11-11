import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPaperwakeAccountEmail,type PaperwakeAccountEmailKind} from '../server/integrations/account-email-template.js';

const origin='https://paperwake.example.test',token='A'.repeat(43);
const input=(kind:PaperwakeAccountEmailKind)=>({kind,origin,actionUrl:kind==='password_changed'?undefined:`${origin}/${kind==='email_verification'?'verify-email/confirm':'reset-password'}#token=${token}`,supportEmail:'support@example.test',senderEmail:'accounts@example.test'});
const hrefs=(html:string)=>[...html.matchAll(/href="([^"]+)"/g)].map(match=>match[1]);

test('verification and recovery preserve exact bearer links in both alternatives, without displaying tokens in HTML copy',()=>{
  for(const kind of ['email_verification','password_reset'] as const){
    const fixture=input(kind),result=renderPaperwakeAccountEmail(fixture);
    assert.equal(hrefs(result.html).filter(url=>url===fixture.actionUrl).length,2);
    assert.match(result.text,new RegExp(`#token=${token}`));
    const visible=result.html.replace(/<[^>]*>/g,'');assert.ok(!visible.includes(token));
    assert.match(visible,kind==='email_verification'?/24 hours after your request/:/30 minutes after your request/);
    if(kind==='email_verification')assert.match(result.text,/current Paperwake password/);
    assert.match(result.text,/never ask you to send your password by email/);
    assert.equal(result.replyTo,'support@example.test');
  }
});

test('templates reject redirects, query tokens, extra fragment parameters and noncanonical action paths',()=>{
  const fixture=input('email_verification');
  for(const actionUrl of [`https://attacker.example/verify-email/confirm#token=${token}`,`${origin}.attacker.example/verify-email/confirm#token=${token}`,`${origin}/reset-password#token=${token}`,`${origin}/verify-email/confirm?token=${token}`,`${fixture.actionUrl}&next=https://attacker.example`,`${origin}/verify-email/confirm#token=short`,`javascript:alert(1)`,`${origin}/verify-email/%63onfirm#token=${token}`,`https://user:pass@paperwake.example.test/verify-email/confirm#token=${token}`]){
    assert.throws(()=>renderPaperwakeAccountEmail({...fixture,actionUrl}),{message:'Account email template input is invalid.'});
  }
});

test('origin must be an origin, with HTTPS except explicit loopback development',()=>{
  for(const origin of ['http://paperwake.example.test','https://user:pass@paperwake.example.test','https://paperwake.example.test/?redirect=x','https://paperwake.example.test/#secret','https://paperwake.example.test/path'])assert.throws(()=>renderPaperwakeAccountEmail({...input('password_changed'),origin}),/template input is invalid/);
  assert.ok(renderPaperwakeAccountEmail({kind:'password_reset',origin:'http://127.0.0.1:5189',actionUrl:`http://127.0.0.1:5189/reset-password#token=${token}`}).html);
  assert.throws(()=>renderPaperwakeAccountEmail({kind:'password_reset'}),/template input is invalid/);
});

test('password change notices describe the actual session outcome, use recovery only, and tolerate unavailable mail origin',()=>{
  const reset=renderPaperwakeAccountEmail({...input('password_changed'),passwordChangeSource:'reset'});
  assert.match(reset.text,/All previous browser sessions have been signed out/);
  assert.deepEqual(hrefs(reset.html),[`${origin}/forgot-password`,`${origin}/forgot-password`,'mailto:support@example.test']);
  const settings=renderPaperwakeAccountEmail({...input('password_changed'),passwordChangeSource:'settings'});
  assert.match(settings.text,/other browser sessions/);assert.match(settings.text,/session you used to change your password remains signed in/);
  const linkless=renderPaperwakeAccountEmail({kind:'password_changed',passwordChangeSource:'reset'});
  assert.equal(hrefs(linkless.html).length,0);assert.match(linkless.text,/Forgot password/);
  assert.throws(()=>renderPaperwakeAccountEmail({...input('password_changed'),actionUrl:'https://attacker.example'}),/template input is invalid/);
});

test('invalid optional contact fields are omitted and a supported plus-address remains usable',()=>{
  for(const bad of ['support@example.test\r\nBcc: victim@example.test','<img src=x onerror=alert(1)>','javascript:alert(1)',"o'neil&help@example.test"]){
    const result=renderPaperwakeAccountEmail({...input('password_changed'),supportEmail:bad,senderEmail:bad});
    assert.equal(result.replyTo,undefined);assert.ok(!result.html.includes(bad));assert.ok(!result.text.includes(bad));
  }
  const result=renderPaperwakeAccountEmail({...input('password_changed'),supportEmail:'support+paperwake@example.test'});
  assert.equal(result.replyTo,'support+paperwake@example.test');assert.ok(hrefs(result.html).includes('mailto:support+paperwake@example.test'));
});

test('all account alternatives are deterministic, bounded and self-contained with no active or remotely loaded content',()=>{
  for(const kind of ['email_verification','password_reset','password_changed'] as const){
    const fixture=input(kind),first=renderPaperwakeAccountEmail(fixture);
    assert.deepEqual(renderPaperwakeAccountEmail(fixture),first);
    assert.ok(Buffer.byteLength(first.html)<=6144);assert.ok(Buffer.byteLength(first.text)<=4096);
    assert.doesNotMatch(first.html,/<(?:script|iframe|img|form|input|link|svg)\b|@import|url\s*\(|\son\w+=/i);
    assert.match(first.html,/<html lang="en">/);assert.match(first.html,/<h1\b/);assert.match(first.html,/role="presentation"/);
    assert.equal(first.templateVersion,'paperwake-account-v1');
  }
});
