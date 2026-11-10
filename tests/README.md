# Bộ test của Cân Bằng Đá

```bash
cd tests && npm ci && npx playwright install chromium

npm run test:game     # game: kiểm tra tĩnh, tình huống biên, bàn phím, vật lý, service worker, vỏ app giả lập, fuzz
npm run test:e2e      # đăng nhập + bảng xếp hạng + luật Firestore trên Firebase Emulator (cần Java 21)
```

| Thư mục | Nội dung |
|---|---|
| `game/` | Chạy thẳng `stone-balance.html` bằng Chromium (Playwright). `FUZZ_MIN` / `MONKEY_MIN` = số phút fuzz. |
| `e2e/` | `01-rules`: luật bảo mật · `02-online`: luồng deep link của app, đồng bộ kỷ lục, bảng xếp hạng · `03-webauth`: popup/redirect của web và trang cầu nối `auth.html` (phần cần `apis.google.com` tự bỏ qua nếu mạng chặn). |
| `native/` | Chỉ chạy trên CI: `prepare.js` chèn `selftest.js` vào bản build thử, `android-run.js` lái Android emulator bằng adb (chạm thật, nút Back, deep link), `ios-run.js` lái iOS Simulator. |
| `lib/` | Khung test tối giản, máy chủ tĩnh, bộ giám sát bất biến chạy trong trang, cầu nối Capacitor giả. |

Mỗi file test in `PASS | …` / `FAIL | …` từng dòng và thoát mã 1 nếu có lỗi. Workflow **Tests** chạy tất cả mỗi lần push.
Biến `CHROMIUM_PATH` dùng để chỉ định sẵn một bản Chromium thay vì tải về.
