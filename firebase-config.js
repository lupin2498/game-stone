/* Cấu hình máy chủ cho đăng nhập + bảng xếp hạng (Firebase).
   Để null = game vẫn chơi bình thường, chỉ có bảng xếp hạng trên máy.
   Lấy giá trị ở: Firebase console -> Project settings -> Your apps -> Web app -> SDK setup (Config).
   Các khoá này là công khai theo thiết kế của Firebase; bảo vệ dữ liệu nằm ở firestore.rules. */
window.FIREBASE_CONFIG = null;
/* Ví dụ:
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "ten-du-an.firebaseapp.com",
  projectId: "ten-du-an",
  appId: "1:1234567890:web:abcdef"
};
*/
window.STONE_ONLINE = {
  appScheme: 'com.luoin.stonebalance'   // phải khớp deep link trong app Android/iOS
};
