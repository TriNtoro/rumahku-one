/* Oemahku Lite — Brankas terenkripsi untuk dokumen penting.
   Hanya memakai WebCrypto bawaan peramban (PBKDF2-SHA256 + AES-256-GCM). TIDAK ada primitif kripto buatan sendiri.
   Desain & ancaman: docs/security/crypto-design.md. UMD: window.Vault / module.exports (untuk tes Node >= 19). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Vault = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const cr = (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) ? globalThis.crypto : require('node:crypto').webcrypto;
  const subtle = cr.subtle, ITER = 600000, enc = (s) => new TextEncoder().encode(s), dec = (u) => new TextDecoder().decode(u);
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); };
  const unb64 = (s) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  const rnd = (n) => cr.getRandomValues(new Uint8Array(n));
  const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // 32 karakter (Crockford tanpa I, L, O, U) -> mod 32 tanpa bias
  const COMMON = ['password', 'password1', '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123', '11111111', '00000000', 'iloveyou', 'abc12345', 'kata sandi', 'katasandi', 'rahasia1', 'indonesia'];

  function normalizeCode(c) { return String(c || '').toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1'); }
  function newRecoveryCode() { const u = rnd(25); let s = ''; for (let i = 0; i < 25; i++) { s += ALPHA[u[i] & 31]; if (i % 5 === 4 && i < 24) s += '-'; } return s; }
  function strength(pw) {
    const p = String(pw || '');
    if (p.length < 8) return { ok: false, msg: 'Minimal 8 karakter.' };
    if (COMMON.indexOf(p.toLowerCase()) >= 0 || /^(.)\1+$/.test(p)) return { ok: false, msg: 'Password terlalu mudah ditebak.' };
    if (/^\d+$/.test(p) && p.length < 10) return { ok: false, msg: 'Jangan hanya angka; tambahkan huruf atau panjangkan (10+).' };
    return { ok: true, msg: p.length >= 12 ? 'Kuat.' : 'Cukup. Lebih panjang lebih aman.' };
  }
  async function kek(secret, salt, iter) {
    const base = await subtle.importKey('raw', enc(String(secret).normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  const aad = (ctx) => enc('rkv1:' + ctx);
  async function wrapRaw(k, raw, ctx) { const iv = rnd(12), ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(ctx) }, k, raw)); return { iv: b64(iv), ct: b64(ct) }; }
  async function unwrapRaw(k, w, ctx) { try { return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(w.iv), additionalData: aad(ctx) }, k, unb64(w.ct))); } catch (e) { return null; } }
  const dekKey = (raw) => subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

  // Buat brankas baru. Kunci data (DEK) acak 256-bit dibungkus oleh password DAN oleh kode pemulihan.
  async function setup(password, o) {
    const iter = (o && o.iter) || ITER, raw = rnd(32), recovery = newRecoveryCode();
    const saltPw = rnd(16), saltRec = rnd(16);
    const meta = { v: 1, kdf: 'PBKDF2-SHA256', iter, saltPw: b64(saltPw), saltRec: b64(saltRec) };
    meta.wPw = await wrapRaw(await kek(password, saltPw, iter), raw, 'pw');
    meta.wRec = await wrapRaw(await kek(normalizeCode(recovery), saltRec, iter), raw, 'rec');
    return { meta, recovery, key: await dekKey(raw) };
  }
  async function rawFrom(meta, secret, kind) {
    if (!meta || meta.v !== 1) return null;
    const salt = unb64(kind === 'rec' ? meta.saltRec : meta.saltPw);
    return unwrapRaw(await kek(kind === 'rec' ? normalizeCode(secret) : secret, salt, meta.iter), kind === 'rec' ? meta.wRec : meta.wPw, kind);
  }
  async function unlock(meta, password) { const r = await rawFrom(meta, password, 'pw'); return r ? dekKey(r) : null; }
  async function unlockRecovery(meta, code) { const r = await rawFrom(meta, code, 'rec'); return r ? dekKey(r) : null; }
  // Ganti password: buktikan dengan password lama ('pw') atau kode pemulihan ('rec'). Data tidak perlu dienkripsi ulang.
  async function setPassword(meta, kind, secret, newPassword) {
    const raw = await rawFrom(meta, secret, kind); if (!raw) return null;
    const saltPw = rnd(16), m = Object.assign({}, meta, { saltPw: b64(saltPw) });
    m.wPw = await wrapRaw(await kek(newPassword, saltPw, meta.iter), raw, 'pw');
    return { meta: m, key: await dekKey(raw) };
  }
  // Kode pemulihan baru (yang lama tidak berlaku lagi); butuh password.
  async function newRecovery(meta, password) {
    const raw = await rawFrom(meta, password, 'pw'); if (!raw) return null;
    const recovery = newRecoveryCode(), saltRec = rnd(16), m = Object.assign({}, meta, { saltRec: b64(saltRec) });
    m.wRec = await wrapRaw(await kek(normalizeCode(recovery), saltRec, meta.iter), raw, 'rec');
    return { meta: m, recovery };
  }
  // Data: string "rkv1.<iv>.<ct>" untuk JSON; "RKV1"+iv+ct untuk berkas/foto.
  async function seal(key, obj) { const iv = rnd(12), ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad('data') }, key, enc(JSON.stringify(obj)))); return 'rkv1.' + b64(iv) + '.' + b64(ct); }
  async function open(key, s) {
    try { const p = String(s).split('.'); if (p[0] !== 'rkv1' || p.length !== 3) return null; return JSON.parse(dec(new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(p[1]), additionalData: aad('data') }, key, unb64(p[2]))))); } catch (e) { return null; }
  }
  async function sealBytes(key, u8) {
    const iv = rnd(12), ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad('file') }, key, u8)), out = new Uint8Array(16 + ct.length);
    out.set([82, 75, 86, 49], 0); out.set(iv, 4); out.set(ct, 16); return out;
  }
  async function openBytes(key, u8) {
    try { if (u8.length < 33 || u8[0] !== 82 || u8[1] !== 75 || u8[2] !== 86 || u8[3] !== 49) return null; return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: u8.subarray(4, 16), additionalData: aad('file') }, key, u8.subarray(16))); } catch (e) { return null; }
  }
  return { setup, unlock, unlockRecovery, setPassword, newRecovery, seal, open, sealBytes, openBytes, strength, normalizeCode, ITER };
}));
