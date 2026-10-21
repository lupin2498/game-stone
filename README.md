# Cân Bằng Đá (Stone Balance)

Game xếp đá cân bằng với vật lý thật: đá rơi từ trên xuống, chạm để thả, viên đá phải tự đứng vững
trên chồng đá bên dưới. Không có lưới, không tự thẳng hàng — mọi thứ dựa vào trọng tâm.

- Đá méo mó ngẫu nhiên, động cơ vật lý 2D tự viết (SAT + sequential impulses, ma sát trượt + ma sát lăn).
- Đường dọi trọng tâm và thanh "độ lung lay"; chồng đá có thể đổ sau vài giây.
- Đăng nhập Google/Facebook và bảng xếp hạng toàn cầu (Firebase) — tuỳ chọn, chưa cấu hình vẫn chơi được.
- Chạy trên web (PWA, chơi offline), Android (APK) và iOS (IPA).

## Chơi ngay
Mở `stone-balance.html` bằng trình duyệt. Chạm / bấm Space để thả đá.

## Cấu trúc
| Đường dẫn | Nội dung |
|---|---|
| `stone-balance.html` | Toàn bộ game (vật lý, đồ hoạ, giao diện) trong một file |
| `online.js` | Module đăng nhập + bảng xếp hạng đã build (nguồn: `app/online/online.src.js`) |
| `firebase-config.js` | Cấu hình Firebase — để `null` là chế độ chơi khách |
| `auth.html` | Trang đăng nhập cho app Android/iOS (host trên Firebase Hosting) |
| `firestore.rules`, `firebase.json` | Luật bảo mật bảng xếp hạng + cấu hình Hosting |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA |
| `app/` | Dự án Capacitor: `android/`, `ios/`, icon, script build |
| `build-site.sh` | Dựng thư mục `site/` để deploy web |
| `.github/workflows/` | CI build APK, IPA, deploy Firebase / GitHub Pages |

## Bộ cài Android / iOS
Mỗi lần push lên `main`, GitHub Actions tự build:
- **Build APK (Android)** → `CanBangDa-debug.apk`
- **Build IPA (iOS)** → `CanBangDa-unsigned.ipa` (+ bản Simulator)

Tải ở tab **Actions** → run mới nhất → **Artifacts**.
Build trên máy, ký bản release, cài lên iOS và bật đăng nhập: xem [`app/README.md`](app/README.md).

## Bản web
- **Firebase Hosting** (khuyên dùng, cần cho đăng nhập trong app): workflow *Deploy Firebase* — thêm secret theo `app/README.md`.
- **GitHub Pages**: bật *Settings → Pages → Source: GitHub Actions*, rồi chạy tay workflow *Deploy web/PWA (GitHub Pages)*.
