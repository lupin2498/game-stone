/* Cân Bằng Đá — đăng nhập (Google/Facebook) + bảng xếp hạng toàn cầu.
   Build: `npm run build:online` -> ../online.js (IIFE, biến toàn cục `StoneOnline`).
   Backend: Firebase Auth + Cloud Firestore (bản lite, REST — nhẹ, chạy tốt trong WebView).

   Web:    signInWithPopup (iOS PWA / popup bị chặn -> signInWithRedirect).
   Native: Google/Facebook chặn đăng nhập trong WebView, nên app mở auth.html (host trên authDomain)
           bằng trình duyệt hệ thống, nhận lại token qua deep link <scheme>://auth và signInWithCredential. */
import { initializeApp } from 'firebase/app';
import {
  getAuth, initializeAuth, indexedDBLocalPersistence, connectAuthEmulator,
  GoogleAuthProvider, FacebookAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  signInWithCredential, onAuthStateChanged, signOut
} from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, collection, query, orderBy, limit,
  where, getDocs, getCount, serverTimestamp
} from 'firebase/firestore/lite';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

const COL = 'leaderboard';
const MAX_NAME = 40;
const MAX_HEIGHT = 99999;
const STATE_KEY = 'sb_auth_state';
const BRIDGE_KEY = 'sb_bridge';
const PROVIDERS = ['google', 'facebook'];

export const rankKey = (best, height) => (best | 0) * 100000 + Math.max(0, Math.min(MAX_HEIGHT, height | 0));

function cleanName(s) {
  s = String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (s || 'Người chơi').slice(0, MAX_NAME);
}
// Chỉ nhận ảnh đại diện từ máy chủ Google/Facebook (khớp firestore.rules) — URL khác bị bỏ để lần ghi điểm không bị luật từ chối
const PHOTO_OK = /^https:\/\/(lh[3-6]\.googleusercontent\.com|graph\.facebook\.com|platform-lookaside\.fbsbx\.com)\//;
function cleanPhoto(u) {
  return typeof u === 'string' && PHOTO_OK.test(u) && u.length <= 500 ? u : null;
}
function toUser(u) {
  if (!u) return null;
  const p = (u.providerData || []).find(x => x && /^(google|facebook)\.com$/.test(x.providerId));
  return { uid: u.uid, name: cleanName(u.displayName || (p && p.displayName)), photo: cleanPhoto(u.photoURL || (p && p.photoURL)),
           provider: p ? p.providerId : 'google.com' };
}
const code = e => (e && e.code) || (e && e.message) || String(e);

function makeProvider(id) {
  if (id === 'google') { const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); return p; }
  if (id === 'facebook') { const p = new FacebookAuthProvider(); p.addScope('public_profile'); return p; }
  throw Object.assign(new Error('Unknown provider'), { code: 'auth/unknown-provider' });
}
function randomState() {
  const a = new Uint8Array(16); crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}
function useEmulators(auth, db, emu) {
  if (!emu) return;
  if (auth && emu.auth) connectAuthEmulator(auth, emu.auth, { disableWarnings: true });
  if (db && emu.firestoreHost) connectFirestoreEmulator(db, emu.firestoreHost, emu.firestorePort || 8080);
}

/* ------------------------------------------------------------ game client */
export function create(config, opts = {}) {
  const native = Capacitor.isNativePlatform();
  const scheme = opts.appScheme || 'com.luoin.stonebalance';
  const app = initializeApp(config);
  // Trên iOS/Android WebView: không dùng popup/redirect resolver (nó tải iframe của authDomain và có thể treo)
  const auth = native ? initializeAuth(app, { persistence: indexedDBLocalPersistence }) : getAuth(app);
  const db = getFirestore(app);
  useEmulators(auth, db, opts.emulator);

  let current = null, known = false;
  const userCbs = new Set(), errCbs = new Set();
  const emitErr = c => errCbs.forEach(f => { try { f(c); } catch (e) {} });

  onAuthStateChanged(auth, u => { current = toUser(u); known = true; userCbs.forEach(f => { try { f(current); } catch (e) {} }); });

  if (native) {
    App.addListener('appUrlOpen', ev => handleReturn(ev && ev.url));
    App.getLaunchUrl().then(r => r && r.url && handleReturn(r.url)).catch(() => {});
    // người chơi đóng trình duyệt mà không đăng nhập -> xoá thông báo "Đang mở…"
    Browser.addListener('browserFinished', () => { setTimeout(() => { if (!current) emitErr('auth/cancelled'); }, 1500); }).catch(() => {});
  } else {
    getRedirectResult(auth).catch(e => emitErr(code(e)));
  }

  async function login(id) {
    if (!PROVIDERS.includes(id)) throw Object.assign(new Error('provider'), { code: 'auth/unknown-provider' });
    if (native) return nativeLogin(id);
    const p = makeProvider(id);
    if (navigator.standalone === true) return signInWithRedirect(auth, p);    // PWA trên iOS: popup không quay về được
    try { await signInWithPopup(auth, p); }
    catch (e) {
      const c = code(e);
      if (c === 'auth/popup-blocked' || c === 'auth/operation-not-supported-in-this-environment') return signInWithRedirect(auth, p);
      throw e;
    }
  }

  async function nativeLogin(id) {
    const s = randomState();
    try { localStorage.setItem(STATE_KEY, JSON.stringify({ s, p: id, t: Date.now() })); } catch (e) {}
    const base = opts.authPage || `https://${config.authDomain}/auth.html`;
    const url = `${base}?p=${encodeURIComponent(id)}&s=${s}&r=${encodeURIComponent(scheme + '://auth')}`;
    try { await Browser.open({ url }); }
    catch (e) { throw Object.assign(new Error('browser'), { code: 'auth/bridge-failed' }); }
  }

  let lastUrl = null;
  async function handleReturn(url) {
    if (!url || url.indexOf(scheme + '://auth') !== 0) return false;
    if (url === lastUrl) return false;            // khởi động lạnh: getLaunchUrl và appUrlOpen có thể cùng báo 1 URL
    lastUrl = url;
    const h = new URLSearchParams(url.split('#')[1] || '');
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); localStorage.removeItem(STATE_KEY); } catch (e) {}
    Browser.close().catch(() => {});
    // state chống giả mạo: chỉ nhận kết quả của đúng lần đăng nhập app vừa mở, hạn 10 phút
    if (!saved || !h.get('s') || saved.s !== h.get('s') || Date.now() - saved.t > 10 * 60 * 1000) { emitErr('auth/state-mismatch'); return false; }
    if (h.get('error')) { emitErr(h.get('error')); return false; }
    const p = h.get('p');
    let cred = null;
    if (p === 'google' && (h.get('id') || h.get('at'))) cred = GoogleAuthProvider.credential(h.get('id') || null, h.get('id') ? null : h.get('at'));
    if (p === 'facebook' && h.get('at')) cred = FacebookAuthProvider.credential(h.get('at'));
    if (!cred) { emitErr('auth/invalid-credential'); return false; }
    try { await signInWithCredential(auth, cred); return true; }
    catch (e) { emitErr(code(e)); return false; }
  }

  async function myEntry() {
    if (!current) return null;
    const s = await getDoc(doc(db, COL, current.uid));
    return s.exists() ? s.data() : null;
  }

  /* Ghi kỷ lục nếu tốt hơn kỷ lục trên máy chủ. Trả về {saved, entry} */
  async function submit(best, height) {
    if (!current) return { saved: false, reason: 'signed-out' };
    best = Math.max(0, best | 0); height = Math.max(0, Math.min(MAX_HEIGHT, height | 0));
    const key = rankKey(best, height);
    const prev = await myEntry();
    if (prev && prev.rankKey >= key) return { saved: false, entry: prev };
    const data = { name: current.name, photo: current.photo, provider: current.provider, best, height, rankKey: key, updatedAt: serverTimestamp() };
    await setDoc(doc(db, COL, current.uid), data);
    return { saved: true, entry: Object.assign({}, data, { updatedAt: null }) };
  }

  /* Hạng của một điểm số bất kỳ = số người có điểm cao hơn + 1 */
  async function rankOf(best, height) {
    const snap = await getCount(query(collection(db, COL), where('rankKey', '>', rankKey(best, height))));
    return snap.data().count + 1;
  }

  async function top(n = 50) {
    const r = await getDocs(query(collection(db, COL), orderBy('rankKey', 'desc'), limit(Math.min(100, n))));
    return r.docs.map(d => Object.assign({ uid: d.id }, d.data()));
  }

  return {
    native,
    get user() { return current; },
    get known() { return known; },
    onUser(f) { userCbs.add(f); if (known) f(current); return () => userCbs.delete(f); },
    onError(f) { errCbs.add(f); return () => errCbs.delete(f); },
    login, logout: () => signOut(auth), submit, rankOf, top, myEntry,
    _handleReturn: handleReturn          // để test
  };
}

/* ------------------------------------------------------------ auth.html (trình duyệt hệ thống) */
export async function authBridge(config, opts = {}) {
  const ui = Object.assign({ status() {}, done() {} }, opts.ui || {});
  const allowed = (opts.appScheme || 'com.luoin.stonebalance') + '://auth';
  const app = initializeApp(config);
  const auth = getAuth(app);
  useEmulators(auth, null, opts.emulator);
  const q = new URLSearchParams(location.search);
  const cleanUrl = () => { try { history.replaceState(null, '', location.pathname); } catch (e) {} };
  let st = null;
  try { st = JSON.parse(sessionStorage.getItem(BRIDGE_KEY) || 'null'); } catch (e) {}
  if (st && !(Date.now() - st.t < 10 * 60 * 1000)) st = null;            // yêu cầu cũ quá 10 phút: bỏ

  // Firebase đưa trình duyệt quay về ĐÚNG địa chỉ lúc bắt đầu (kèm ?p=…): phải phân biệt "yêu cầu mới từ app"
  // với "lượt quay về của yêu cầu đang chờ", nếu không trang sẽ gửi người chơi đi đăng nhập lặp vô hạn.
  const fresh = !!q.get('p') && !(st && st.s === q.get('s'));
  if (fresh) {                                          // bước 1: app vừa mở trang này
    const p = q.get('p'), s = q.get('s') || '', r = q.get('r') || allowed;
    // chỉ trả token về đúng app này -> không thể bị lợi dụng để gửi token đi nơi khác
    if (r !== allowed) { ui.status('Địa chỉ quay lại không hợp lệ.'); return { error: 'bad-return' }; }
    if (!PROVIDERS.includes(p) || !/^[a-f0-9]{16,64}$/.test(s)) { ui.status('Yêu cầu đăng nhập không hợp lệ.'); return { error: 'bad-request' }; }
    sessionStorage.setItem(BRIDGE_KEY, JSON.stringify({ p, s, r, t: Date.now() }));
    cleanUrl();                                         // URL sạch -> lượt quay về không còn mang tham số
    ui.status(p === 'google' ? 'Đang mở Google…' : 'Đang mở Facebook…');
    try { await signInWithRedirect(auth, makeProvider(p)); }
    catch (e) {                                         // không đi được tới nhà cung cấp: báo lỗi về app thay vì treo ở đây
      sessionStorage.removeItem(BRIDGE_KEY);
      const url = r + '#' + new URLSearchParams({ p, s, error: code(e) }).toString();
      ui.done(url, false); return { url };
    }
    return { redirecting: true };
  }

  cleanUrl();
  if (!st) { ui.status('Không có yêu cầu đăng nhập nào đang chờ. Hãy quay lại game và bấm đăng nhập.'); return { error: 'no-request' }; }
  const out = new URLSearchParams({ p: st.p, s: st.s });
  try {
    ui.status('Đang hoàn tất đăng nhập…');
    const res = await getRedirectResult(auth);
    if (!res) out.set('error', 'auth/cancelled');
    else {
      const cred = st.p === 'google' ? GoogleAuthProvider.credentialFromResult(res) : FacebookAuthProvider.credentialFromResult(res);
      // Google: ID token là đủ để đăng nhập Firebase -> không chuyển access token (quyền rộng hơn) qua deep link
      if (cred && cred.idToken) out.set('id', cred.idToken);
      else if (cred && cred.accessToken) out.set('at', cred.accessToken);
      if (!out.get('id') && !out.get('at')) out.set('error', 'auth/invalid-credential');
    }
  } catch (e) { out.set('error', code(e)); }
  sessionStorage.removeItem(BRIDGE_KEY);
  await signOut(auth).catch(() => {});             // không giữ phiên trong trình duyệt
  const url = st.r + '#' + out.toString();
  ui.done(url, !out.get('error'));
  return { url };
}
