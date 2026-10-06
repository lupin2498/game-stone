# Cân Bằng Đá — bộ cài Android & iOS

Dự án [Capacitor](https://capacitorjs.com) đóng gói game `stone-balance.html` (ở gốc repo)
thành app native. Web asset được copy từ gốc repo vào `www/` bằng `npm run sync:web`,
nên **chỉ cần sửa `stone-balance.html`**, mọi nền tảng tự cập nhật theo.

```
app/
├── www/                 # tự sinh (gitignore) — bản copy của game
├── android/             # project Android Studio
├── ios/App/             # project Xcode (dùng Swift Package Manager, không cần CocoaPods)
├── assets/              # icon/splash nguồn 1024px & 2732px
└── scripts/copy-web.js  # đồng bộ game -> www/
```

App ID: `com.luoin.stonebalance` · Tên: **Cân Bằng Đá** · Khoá hướng dọc · Chơi offline được.
Phiên bản 1.1 (versionCode 2) — có đăng nhập Google/Facebook và bảng xếp hạng.

---

## Cách 1 — GitHub Actions (không cần cài gì trên máy)

Vào tab **Actions** của repo, chạy workflow rồi tải file ở mục *Artifacts*:

| Workflow | Kết quả |
|---|---|
| **Build APK (Android)** | `CanBangDa-debug.apk` — cài thẳng vào máy Android |
| **Build IPA (iOS)** | `CanBangDa-unsigned.ipa` + bản chạy Simulator |
| **Deploy web/PWA** | Bản web trên GitHub Pages để cài vào màn hình chính |

### Ký bản release Android (tuỳ chọn)
Tạo keystore rồi thêm 4 secret vào repo; workflow sẽ tự build thêm APK/AAB đã ký:

```bash
keytool -genkey -v -keystore release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias stonebalance
base64 -w0 release.jks     # dán vào secret ANDROID_KEYSTORE_BASE64
```
Secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

---

## Cách 2 — Build trên máy

Yêu cầu: Node 20+, JDK 21. Android cần Android SDK (API 36); iOS cần macOS + Xcode 15+.

```bash
cd app
npm install

# Android -> app/android/app/build/outputs/apk/debug/app-debug.apk
npm run android:apk

# iOS -> mở Xcode, chọn Team của bạn ở tab Signing & Capabilities rồi Run/Archive
npm run ios:open
```

Sửa icon: thay `assets/icon.png` (1024×1024), `assets/icon-foreground.png`,
`assets/icon-background.png`, `assets/splash.png` rồi chạy `npm run icons`.

---

## Cài vào máy

**Android:** copy `CanBangDa-debug.apk` vào máy, mở file, bật *Cài từ nguồn không xác định*.

**iOS:** Apple không cho cài app ngoài App Store nếu chưa ký. Ba lựa chọn:

1. **PWA (miễn phí, nhanh nhất)** — mở trang GitHub Pages bằng Safari → nút Chia sẻ →
   *Thêm vào MH chính*. Game chạy toàn màn hình, offline, có icon riêng.
2. **Sideload file `.ipa` chưa ký** — dùng [Sideloadly](https://sideloadly.io) hoặc
   [AltStore](https://altstore.io) với Apple ID miễn phí (app hết hạn sau 7 ngày, ký lại được).
3. **Tài khoản Apple Developer ($99/năm)** — mở `app/ios/App/App.xcodeproj` trong Xcode,
   chọn Team, *Product → Archive → Distribute App* để có IPA ký chuẩn hoặc đẩy lên TestFlight.

---

## Đăng nhập Google/Facebook + bảng xếp hạng (Firebase)

Chưa cấu hình thì game vẫn chạy bình thường (ẩn nút đăng nhập, chỉ có bảng xếp hạng trên máy).
Bật bản online — làm 1 lần, khoảng 15 phút:

1. **Tạo dự án** tại <https://console.firebase.google.com> (gói Spark miễn phí là đủ).
2. **Web app**: *Project settings → Your apps → Add app → Web* → copy đoạn `firebaseConfig`
   vào `firebase-config.js` ở gốc repo (thay dòng `window.FIREBASE_CONFIG = null;`).
3. **Authentication → Sign-in method**:
   - Bật **Google**.
   - Bật **Facebook**: tạo app ở <https://developers.facebook.com> (thêm sản phẩm *Facebook Login*),
     dán *App ID* + *App Secret* vào Firebase, rồi copy *OAuth redirect URI* Firebase hiển thị
     (`https://<project>.firebaseapp.com/__/auth/handler`) vào *Facebook Login → Settings → Valid OAuth Redirect URIs*.
     Chuyển app Facebook sang chế độ *Live* để người ngoài đăng nhập được.
4. **Firestore Database → Create database** (production mode).
5. **Deploy web + luật bảo mật** (bắt buộc: app Android/iOS đăng nhập qua `https://<project>.firebaseapp.com/auth.html`):
   ```bash
   ./build-site.sh
   npx firebase-tools login
   npx firebase-tools deploy --only hosting,firestore:rules --project <project-id>
   ```
   Game web chạy tại `https://<project>.web.app`. Nếu dùng thêm GitHub Pages, thêm tên miền đó ở
   *Authentication → Settings → Authorized domains*.
6. **Build app có đăng nhập**: thêm secret `FIREBASE_CONFIG_JS` (toàn bộ nội dung `firebase-config.js` đã điền)
   vào repo → workflow APK/IPA tự nạp. Tuỳ chọn tự deploy Firebase: thêm `FIREBASE_PROJECT_ID` và
   `FIREBASE_SERVICE_ACCOUNT` (JSON key) → workflow *Deploy Firebase* chạy mỗi lần push lên `main`.

### Cách hoạt động
- **Web/PWA**: cửa sổ đăng nhập của Google/Facebook (popup; PWA trên iOS dùng redirect).
- **App Android/iOS**: Google/Facebook chặn đăng nhập trong WebView, nên app mở `auth.html` bằng trình duyệt hệ thống
  (Custom Tabs / SafariViewController), đăng nhập xong quay về app qua `com.luoin.stonebalance://auth`.
  Không cần SDK native, `google-services.json` hay SHA-1.
- **Bảng xếp hạng**: collection `leaderboard/{uid}` trên Firestore, xếp theo số đá rồi chiều cao.
  `firestore.rules`: ai cũng đọc được; mỗi người chỉ ghi bản ghi của mình, điểm trong giới hạn, chỉ được tăng,
  tối đa 1 lần ghi / 5 giây. Điểm vẫn do máy người chơi gửi lên nên không chống được gian lận tuyệt đối.
- Chơi khi chưa đăng nhập vẫn được tính: đăng nhập sau là kỷ lục tự đồng bộ (lấy điểm cao hơn giữa máy và máy chủ).

### Sửa module online
Mã nguồn ở `app/online/online.src.js`, build ra `online.js` ở gốc repo: `cd app && npm run build:online`.
