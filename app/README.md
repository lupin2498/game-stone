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

App ID: `com.luoin.stonebalance` · Tên: **Cân Bằng Đá** · Khoá hướng dọc · Offline hoàn toàn.

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
