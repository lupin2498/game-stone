'use strict';
/* Khung test tối giản: mỗi file test là một script Node độc lập, in PASS/FAIL/SKIP từng dòng,
   thoát mã 1 nếu có FAIL. Dùng Playwright (Chromium) để chạy game thật. */
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const GAME_FILE = path.join(ROOT, 'stone-balance.html');
const GAME_URL = 'file://' + GAME_FILE;
const SKIP = Symbol('skip');
const results = [];

function trunc(s, n) { n = n || 320; return s.length > n ? s.slice(0, n) + '…' : s; }
function line(status, name, detail) {
  let l = status + ' | ' + name;
  if (detail !== undefined && detail !== null && detail !== '') l += ' | ' + trunc(typeof detail === 'string' ? detail : JSON.stringify(detail));
  console.log(l);
}
async function test(name, fn) {
  try {
    const r = await fn();
    if (r === SKIP) { results.push({ name, status: 'SKIP' }); line('SKIP', name); return; }
    results.push({ name, status: 'PASS' }); line('PASS', name, r);
  } catch (e) {
    results.push({ name, status: 'FAIL' }); line('FAIL', name, (e && e.message) || String(e));
  }
}
function check(cond, msg, detail) {
  if (!cond) throw new Error(msg + (detail !== undefined ? ' ' + trunc(JSON.stringify(detail), 500) : ''));
}

let _browser = null;
async function browser() {
  if (!_browser) {
    const { chromium } = require('playwright');
    _browser = await chromium.launch({
      // CHROMIUM_PATH: dùng bản Chromium có sẵn; nếu không thì dùng Chromium đầy đủ của Playwright (không phải headless-shell) cho giống nhau ở mọi nơi
      executablePath: process.env.CHROMIUM_PATH || undefined,
      channel: process.env.CHROMIUM_PATH ? undefined : 'chromium',
      args: ['--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--js-flags=--expose-gc']
    });
  }
  return _browser;
}
/* Trang mới; page.errs gom lỗi JS + console.error */
async function newPage(opts, init) {
  const b = await browser();
  const ctx = await b.newContext(Object.assign({ viewport: { width: 412, height: 860 } }, opts || {}));
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') page.errs.push('console: ' + m.text()); });
  page.on('crash', () => page.errs.push('CRASH'));
  if (init) await page.addInitScript(init);
  return page;
}
async function openGame(opts, init, url) {
  const page = await newPage(opts, init);
  await page.goto(url || GAME_URL);
  await page.waitForFunction('typeof startGame === "function" && typeof world !== "undefined"', null, { timeout: 15000 });
  return page;
}
/* Vô hiệu vòng rAF của game để test tự gọi update()/render() (tua nhanh, tất định hơn) */
const FREEZE_RAF = () => { window.__realRAF = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = () => 0; };
const inpage = name => fs.readFileSync(path.join(__dirname, name), 'utf8');

async function finish() {
  if (_browser) { try { await _browser.close(); } catch (e) {} }
  const f = results.filter(r => r.status === 'FAIL').length, s = results.filter(r => r.status === 'SKIP').length;
  console.log('\n' + path.basename(process.argv[1]) + ': ' + (results.length - f - s) + ' PASS, ' + f + ' FAIL, ' + s + ' SKIP');
  process.exit(f ? 1 : 0);
}
process.on('unhandledRejection', e => { console.log('FAIL | (harness) unhandledRejection | ' + ((e && e.stack) || e)); process.exit(1); });

module.exports = { ROOT, GAME_FILE, GAME_URL, SKIP, test, check, browser, newPage, openGame, FREEZE_RAF, inpage, finish, results };
