'use strict';
/* Mô phỏng cầu nối native của Capacitor (native-bridge.js) trong trình duyệt để test phần "vỏ app":
   Capacitor.addListener / nativeCallback / nativePromise + PluginHeaders (để @capacitor/core trong online.js tạo proxy plugin).
   Dùng làm init script của Playwright. window.__cap.fire(plugin, event, data) = native bắn sự kiện. */
module.exports = () => {
  const L = {}, calls = [];
  const m = (name, rtype) => rtype ? { name, rtype } : { name };
  window.androidBridge = { postMessage() {} };          // @capacitor/core dựa vào đây để nhận ra nền tảng "android"
  const cap = window.Capacitor = { Plugins: {}, PluginHeaders: [
    { name: 'App', methods: [m('addListener'), m('removeListener'), m('getLaunchUrl', 'promise'), m('minimizeApp', 'promise'), m('exitApp', 'promise'), m('getState', 'promise')] },
    { name: 'Browser', methods: [m('addListener'), m('removeListener'), m('open', 'promise'), m('close', 'promise')] }] };
  cap.isNativePlatform = () => true;
  cap.getPlatform = () => 'android';
  cap.nativeCallback = (plugin, method, opts, cb) => {
    if (method === 'addListener') { const k = plugin + ':' + opts.eventName; (L[k] = L[k] || []).push(cb); calls.push(plugin + '.addListener:' + opts.eventName); }
    return 'cb' + calls.length;
  };
  cap.nativePromise = (plugin, method, opts) => { calls.push(plugin + '.' + method + (opts && opts.url ? ' ' + opts.url : '')); return Promise.resolve({}); };
  cap.addListener = (plugin, ev, cb) => { cap.nativeCallback(plugin, 'addListener', { eventName: ev }, cb); return { remove() {} }; };
  window.__cap = { L, calls, fire(plugin, ev, data) { (L[plugin + ':' + ev] || []).forEach(f => f(data || {})); }, count: k => (L[k] || []).length };
};
