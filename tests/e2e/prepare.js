'use strict';
/* Dựng site test (tests/e2e/.site) trỏ vào Firebase Emulator + copy luật Firestore */
const fs = require('fs');
const path = require('path');
const { buildSite } = require('../lib/server');
const ROOT = path.resolve(__dirname, '..', '..');
const cfg = `window.FIREBASE_CONFIG={apiKey:'demo-key', authDomain:'127.0.0.1:5000', projectId:'demo-stone', appId:'1:1:web:1'};
window.STONE_ONLINE={appScheme:'com.luoin.stonebalance',
  emulator:{auth:'http://127.0.0.1:9099', firestoreHost:'127.0.0.1', firestorePort:8080},
  authPage:'http://127.0.0.1:5000/auth.html'};
`;
buildSite(ROOT, path.join(__dirname, '.site'), { 'firebase-config.js': cfg });
fs.mkdirSync(path.join(__dirname, '.site-rules'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'firestore.rules'), path.join(__dirname, '.site-rules', 'firestore.rules'));
console.log('tests/e2e/.site sẵn sàng');
