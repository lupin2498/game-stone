'use strict';
/* Tiện ích cho test với Firebase Emulator (auth :9099, firestore :8080, hosting :5000) */
const BASE = 'http://127.0.0.1:5000/';
const FS = 'http://127.0.0.1:8080';
const AUTH = 'http://127.0.0.1:9099';
const PROJECT = 'demo-stone';
const DOCS = `${FS}/v1/projects/${PROJECT}/databases/(default)/documents`;
const OWNER = { Authorization: 'Bearer owner' };

async function clearAll() {
  await fetch(`${FS}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}
async function seed(entries) {            // ghi thẳng bằng quyền admin của emulator (bỏ qua luật)
  for (const e of entries) {
    const fields = { name: { stringValue: e.name }, provider: { stringValue: e.provider || 'google.com' }, best: { integerValue: String(e.best) },
      height: { integerValue: String(e.height) }, rankKey: { integerValue: String(e.best * 100000 + e.height) },
      updatedAt: { timestampValue: new Date().toISOString() }, photo: e.photo ? { stringValue: e.photo } : { nullValue: null } };
    const r = await fetch(`${DOCS}/leaderboard?documentId=${encodeURIComponent(e.uid)}`, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, OWNER), body: JSON.stringify({ fields }) });
    if (!r.ok) throw new Error('seed ' + r.status + ' ' + (await r.text()));
  }
}
async function getEntry(uid) {
  const r = await fetch(`${DOCS}/leaderboard/${encodeURIComponent(uid)}`, { headers: OWNER });
  if (r.status === 404) return null;
  const j = await r.json(); if (!j.fields) return null;
  const f = j.fields; return { best: +f.best.integerValue, height: +f.height.integerValue, name: f.name.stringValue, rankKey: +f.rankKey.integerValue };
}
const fakeIdToken = (sub, name, email, picture) => JSON.stringify({ sub, email, email_verified: true, name, picture: picture || undefined });
/* Giả lập app nhận deep link sau khi đăng nhập ở trình duyệt hệ thống */
async function deepLinkLogin(page, provider, token, opts) {
  opts = opts || {};
  return page.evaluate(async ({ provider, token, opts }) => {
    const s = opts.state || '0123456789abcdef0123456789abcdef';
    if (!opts.noSaved) localStorage.setItem('sb_auth_state', JSON.stringify({ s: opts.saved || s, p: provider, t: Date.now() - (opts.age || 0) }));
    const h = new URLSearchParams({ p: provider, s }); if (provider === 'google') h.set('id', token); else h.set('at', token);
    if (opts.extra) for (const k of Object.keys(opts.extra)) h.set(k, opts.extra[k]);
    return Online.api._handleReturn('com.luoin.stonebalance://auth#' + h.toString() + (opts.suffix || ''));
  }, { provider, token, opts });
}
const waitUser = (page, ms) => page.waitForFunction('!!Online.user', null, { timeout: ms || 10000 }).then(() => true).catch(() => false);
const waitApi = page => page.waitForFunction('!!(Online.api && Online.api.known)', null, { timeout: 20000 });
async function gameOverWith(page, sc, h) {
  await page.evaluate(`(()=>{ if(state!=='aim') startGame(); score=${sc}; heightCm=${h}; gameOver('test'); })()`);
  await page.waitForFunction(`over.classList.contains('on')`, null, { timeout: 8000 });
}
async function reachable(url) { try { const c = new AbortController(); const t = setTimeout(() => c.abort(), 8000); const r = await fetch(url, { signal: c.signal }); clearTimeout(t); return r.ok; } catch (e) { return false; } }
module.exports = { BASE, FS, AUTH, PROJECT, DOCS, OWNER, clearAll, seed, getEntry, fakeIdToken, deepLinkLogin, waitUser, waitApi, gameOverWith, reachable };
