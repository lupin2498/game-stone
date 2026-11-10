'use strict';
/* Kiểm tra tĩnh: cú pháp/tương thích JS + CSS, tính nhất quán giữa các file cấu hình. */
const fs = require('fs');
const path = require('path');
const { ROOT, SKIP, test, check, finish } = require('../lib/harness');

const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = read('stone-balance.html');
const css = html.split('<style>')[1].split('</style>')[0];
const js = html.split('<script>')[1].split('</script>')[0];

(async () => {
  await test('S1 script game phân tích được theo ES2018 (chạy được trên WebView/Safari cũ)', async () => {
    const acorn = require('acorn');
    acorn.parse(js, { ecmaVersion: 2018, sourceType: 'script' });
    acorn.parse(read('sw.js'), { ecmaVersion: 2018, sourceType: 'script' });
    acorn.parse(read('firebase-config.js'), { ecmaVersion: 2018, sourceType: 'script' });
    const authJs = read('auth.html').split('<script>')[1].split('</script>')[0];
    acorn.parse(authJs, { ecmaVersion: 2015, sourceType: 'script' });
  });

  await test('S2 không dùng API quá mới trong script game', async () => {
    const deny = [/\.replaceChildren\(/, /\bstructuredClone\(/, /\.at\(/, /Object\.hasOwn\(/, /\.flat\(/, /\.flatMap\(/, /\.replaceAll\(/,
      /Promise\.(any|allSettled)\(/, /\.toSorted\(/, /\.findLast\(/, /globalThis\b/];
    const hits = deny.filter(r => r.test(js)).map(String);
    check(hits.length === 0, 'API mới:', hits);
  });

  await test('S3 ESLint: không biến chưa khai báo / lỗi logic', async () => {
    const { ESLint } = require('eslint');
    const globals = {};
    ['window', 'document', 'navigator', 'performance', 'localStorage', 'requestAnimationFrame', 'location', 'console', 'Image',
      'StoneOnline', 'setTimeout', 'clearTimeout', 'ResizeObserver', 'Promise', 'Map', 'Set', 'Symbol'].forEach(g => { globals[g] = 'readonly'; });
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [{
        languageOptions: { ecmaVersion: 2018, sourceType: 'script', globals },
        rules: { 'no-undef': 'error', 'no-redeclare': 'error', 'no-dupe-keys': 'error', 'no-unreachable': 'error', 'no-self-assign': 'error',
          'no-func-assign': 'error', 'use-isnan': 'error', 'valid-typeof': 'error', 'no-cond-assign': 'error', 'no-sparse-arrays': 'error',
          'no-const-assign': 'error', 'no-dupe-args': 'error', 'no-unsafe-negation': 'error', 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }] }
      }]
    });
    const [res] = await eslint.lintText(js, { filePath: 'game.js' });
    const errs = res.messages.filter(m => m.severity === 2).map(m => m.line + ': ' + m.message);
    check(errs.length === 0, 'ESLint:', errs.slice(0, 8));
    return { warnings: res.messages.filter(m => m.severity === 1).map(m => m.message.replace(/ is (assigned a value|defined) but never used.*/, '')).slice(0, 12) };
  });

  await test('S4 CSS tương thích: không dùng inset, backdrop-filter có tiền tố, safe-area có biến dự phòng', async () => {
    check(!/[;{\s]inset\s*:/.test(css), 'còn dùng "inset:" (Chrome<87, iOS<14.5 không hiểu)');
    const bf = (css.match(/[^-]backdrop-filter\s*:/g) || []).length, wbf = (css.match(/-webkit-backdrop-filter\s*:/g) || []).length;
    check(bf === wbf, 'backdrop-filter thiếu bản -webkit-', { bf, wbf });
    const env = (css.match(/env\(safe-area-inset-/g) || []).length, vr = (css.match(/var\(--safe-area-inset-[a-z]+,\s*env\(safe-area-inset-/g) || []).length;
    check(env > 0 && env === vr, 'env(safe-area-inset-*) phải bọc trong var(--safe-area-inset-*, …) cho Android WebView cũ', { env, vr });
  });

  await test('S5 file tham chiếu đều tồn tại (precache của SW, icon của manifest, script trong HTML)', async () => {
    const sw = read('sw.js');
    const pre = (sw.split('PRECACHE = [')[1] || '').split('];')[0].match(/'\.\/[^']*'/g).map(s => s.slice(3, -1)).filter(Boolean);
    const siteHas = f => f === 'index.html' || fs.existsSync(path.join(ROOT, f));
    const missing = pre.filter(f => !siteHas(f));
    check(missing.length === 0, 'precache thiếu file:', missing);
    const man = JSON.parse(read('manifest.webmanifest'));
    for (const ic of man.icons) check(fs.existsSync(path.join(ROOT, ic.src)), 'manifest thiếu icon ' + ic.src);
    for (const m of html.matchAll(/(?:src|href)="([^"#:]+\.(?:js|png|webmanifest))"/g)) check(fs.existsSync(path.join(ROOT, m[1])), 'HTML tham chiếu file không có: ' + m[1]);
    check(/const VERSION = '[^']+'/.test(sw), 'sw.js thiếu VERSION');
    return { precache: pre.length };
  });

  await test('S6 online.js khớp với mã nguồn app/online/online.src.js (không quên build lại)', async () => {
    const esb = path.join(ROOT, 'app', 'node_modules', '.bin', 'esbuild');
    if (!fs.existsSync(esb)) return SKIP;
    const { execFileSync } = require('child_process');
    const out = path.join(require('os').tmpdir(), 'online-check-' + process.pid + '.js');
    execFileSync(esb, ['online/online.src.js', '--bundle', '--minify', '--format=iife', '--global-name=StoneOnline', '--target=es2019', '--legal-comments=none', '--log-level=error', '--outfile=' + out], { cwd: path.join(ROOT, 'app') });
    const same = fs.readFileSync(out, 'utf8') === read('online.js');
    fs.unlinkSync(out);
    check(same, 'online.js đã cũ: chạy "cd app && npm run build:online"');
  });

  await test('S7 phiên bản + scheme nhất quán giữa Android / iOS / web', async () => {
    const gradle = read('app/android/app/build.gradle'), pbx = read('app/ios/App/App.xcodeproj/project.pbxproj');
    const vCode = +gradle.match(/versionCode (\d+)/)[1], vName = gradle.match(/versionName "([^"]+)"/)[1];
    const iosBuild = [...new Set([...pbx.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map(m => +m[1]))];
    const iosVer = [...new Set([...pbx.matchAll(/MARKETING_VERSION = ([\d.]+);/g)].map(m => m[1]))];
    check(iosBuild.length === 1 && iosBuild[0] === vCode, 'versionCode Android ≠ build iOS', { vCode, iosBuild });
    check(iosVer.length === 1 && iosVer[0] === vName, 'versionName Android ≠ iOS', { vName, iosVer });
    const appId = JSON.parse(read('app/capacitor.config.json')).appId;
    const scheme = read('firebase-config.js').match(/appScheme:\s*'([^']+)'/)[1];
    const strings = read('app/android/app/src/main/res/values/strings.xml').match(/custom_url_scheme">([^<]+)</)[1];
    const plist = read('app/ios/App/App/Info.plist').split('CFBundleURLSchemes')[1].match(/<string>([^<]+)<\/string>/)[1];
    const srcDefault = read('app/online/online.src.js').match(/opts\.appScheme \|\| '([^']+)'/)[1];
    const manifest = read('app/android/app/src/main/AndroidManifest.xml');
    check(/android:scheme="@string\/custom_url_scheme"\s+android:host="auth"/.test(manifest), 'AndroidManifest thiếu deep link auth');
    check(new Set([appId, scheme, strings, plist, srcDefault]).size === 1, 'scheme không khớp', { appId, scheme, strings, plist, srcDefault });
    return { version: vName + ' (' + vCode + ')', scheme };
  });

  await finish();
})();
