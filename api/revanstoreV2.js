import CryptoJS from 'crypto-js';
import admin from 'firebase-admin';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const ADMIN_KEY = process.env.ADMIN_KEY;
const RECAPTCHA_V2_SECRET_KEY = process.env.RECAPTCHA_V2_SECRET_KEY;
const RECAPTCHA_V3_SECRET_KEY = process.env.RECAPTCHA_V3_SECRET_KEY;
const RSA_PRIVATE_KEY = process.env.RSA_PRIVATE_KEY;
const SALT_ROUNDS = 12;

if (!admin.apps.length) {
  const key = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
  admin.initializeApp({
    credential: admin.credential.cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: key }),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
}

const db = admin.database();
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW = 60000;
const TRX_MAX_AGE = 172800000;

function checkRateLimit(ip) {
  const now = Date.now();
  if (!rateLimitMap.has(ip)) rateLimitMap.set(ip, []);
  const requests = rateLimitMap.get(ip).filter(t => now - t < RATE_LIMIT_WINDOW);
  if (requests.length >= RATE_LIMIT_MAX) return false;
  requests.push(now);
  rateLimitMap.set(ip, requests);
  return true;
}

async function decryptData(raw) {
  if (!raw) return raw;
  if (raw.data) {
    try {
      const dec = CryptoJS.AES.decrypt(raw.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
      const parsed = JSON.parse(dec);
      return parsed;
    } catch(e) { 
      return raw.data || raw; 
    }
  }
  return raw;
}

async function hashPassword(password) {
  try {
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    return await bcrypt.hash(password, salt);
  } catch (e) { return null; }
}

async function verifyPassword(password, hash) {
  try { return await bcrypt.compare(password, hash); } catch (e) { return false; }
}

async function verifyRecaptchaV2(token) {
  if (!token || !RECAPTCHA_V2_SECRET_KEY) return true;
  try {
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${RECAPTCHA_V2_SECRET_KEY}&response=${token}`
    });
    const data = await res.json();
    return data.success === true;
  } catch (e) { return true; }
}

async function verifyRecaptchaV3(token) {
  if (!token || !RECAPTCHA_V3_SECRET_KEY) return true;
  try {
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${RECAPTCHA_V3_SECRET_KEY}&response=${token}`
    });
    const data = await res.json();
    if (data.success && data.score >= 0.5) return true;
    return false;
  } catch (e) { return true; }
}

async function isIPBlocked(ip) {
  if (!ip) return false;
  const snap = await db.ref('blocked_ips/' + ip.replace(/\./g, '_')).once('value');
  const raw = snap.val();
  if (raw?.data) {
    try {
      const dec = CryptoJS.AES.decrypt(raw.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
      if (JSON.parse(dec)?.blocked) return true;
    } catch(e) {}
  }
  return false;
}

async function isFPBlocked(fp) {
  if (!fp) return false;
  const snap = await db.ref('blocked_fp/' + fp).once('value');
  const raw = snap.val();
  if (raw?.data) {
    try {
      const dec = CryptoJS.AES.decrypt(raw.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
      if (JSON.parse(dec)?.blocked) return true;
    } catch(e) {}
  }
  return false;
}

async function blockIP(ip) {
  if (!ip) return;
  const enc = CryptoJS.AES.encrypt(JSON.stringify({ ip, blocked: true, blocked_at: new Date().toISOString() }), ADMIN_KEY).toString();
  await db.ref('blocked_ips/' + ip.replace(/\./g, '_')).set({ data: enc });
}

async function blockFP(fp) {
  if (!fp) return;
  const enc = CryptoJS.AES.encrypt(JSON.stringify({ fingerprint: fp, blocked: true, blocked_at: new Date().toISOString() }), ADMIN_KEY).toString();
  await db.ref('blocked_fp/' + fp).set({ data: enc });
}

async function trackLoginAttempt(ip, fp) {
  const key = ip.replace(/\./g, '_') + '_' + (fp || 'nofp');
  const ref = db.ref('login_attempts/' + key);
  const snap = await ref.once('value');
  const raw = snap.val();
  const now = Date.now();
  if (raw?.data) {
    try {
      const data = JSON.parse(CryptoJS.AES.decrypt(raw.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8));
      if (now - (data.last_attempt || 0) > 3600000) {
        await ref.remove();
        const enc = CryptoJS.AES.encrypt(JSON.stringify({ count: 1, last_attempt: now, fingerprint: fp }), ADMIN_KEY).toString();
        await ref.set({ data: enc });
        return 1;
      }
      const newCount = (data.count || 0) + 1;
      const enc = CryptoJS.AES.encrypt(JSON.stringify({ count: newCount, last_attempt: now, fingerprint: fp }), ADMIN_KEY).toString();
      await ref.set({ data: enc });
      return newCount;
    } catch(e) {}
  }
  const enc = CryptoJS.AES.encrypt(JSON.stringify({ count: 1, last_attempt: now, fingerprint: fp }), ADMIN_KEY).toString();
  await ref.set({ data: enc });
  return 1;
}

async function resetLoginAttempt(ip, fp) {
  await db.ref('login_attempts/' + ip.replace(/\./g, '_') + '_' + (fp || 'nofp')).remove();
}

async function logActivity(username, action, details, ip, fp) {
  try {
    const enc = CryptoJS.AES.encrypt(JSON.stringify({ username, action, details: details || '', ip: ip || '', fingerprint: fp || '', timestamp: Date.now() }), ADMIN_KEY).toString();
    const newRef = db.ref('activity_logs').push();
    await newRef.set({ data: enc });
  } catch(e) {}
}

function sanitizeKey(str) { return String(str || '').replace(/[.#$\[\]\/]/g, '_'); }

async function checkTransactionRateLimit(user) {
  const key = 'trx_rate_' + sanitizeKey(user || 'anon');
  const ref = db.ref('transaction_rate_limits/' + key);
  const snap = await ref.once('value');
  const raw = snap.val();
  const now = Date.now();
  let timestamps = [];
  if (raw?.data) {
    try {
      const dec = JSON.parse(CryptoJS.AES.decrypt(raw.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8));
      timestamps = dec.timestamps || [];
    } catch(e) {}
  }
  timestamps = timestamps.filter(t => now - t < 60000);
  if (timestamps.length >= 5) return false;
  timestamps.push(now);
  const enc = CryptoJS.AES.encrypt(JSON.stringify({ timestamps }), ADMIN_KEY).toString();
  await ref.set({ data: enc });
  return true;
}

async function cleanupOldTransactions() {
  try {
    const snap = await db.ref('transactions').once('value');
    const raw = snap.val();
    if (!raw) return;
    const now = Date.now();
    const updates = {};
    for (const key in raw) {
      const decrypted = await decryptData(raw[key]);
      if (decrypted && decrypted.timestamp && (now - decrypted.timestamp > TRX_MAX_AGE)) {
        updates[key] = null;
      }
    }
    if (Object.keys(updates).length > 0) await db.ref('transactions').update(updates);
  } catch(e) {}
}

async function getUserTrxCode(username) {
  const safeUsername = sanitizeKey(username);
  const codeRef = db.ref('user_trx_codes/' + safeUsername);
  const snap = await codeRef.once('value');
  const raw = snap.val();
  if (raw?.data) {
    try {
      const dec = JSON.parse(CryptoJS.AES.decrypt(raw.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8));
      if (dec && dec.code) return dec.code;
    } catch(e) {}
  }
  const allCodesSnap = await db.ref('user_trx_codes').once('value');
  const allCodes = allCodesSnap.val() || {};
  const usedCodes = new Set();
  for (const k in allCodes) {
    try {
      const dec = JSON.parse(CryptoJS.AES.decrypt(allCodes[k].data, ADMIN_KEY).toString(CryptoJS.enc.Utf8));
      if (dec && dec.code) usedCodes.add(dec.code);
    } catch(e) {}
  }
  let code;
  do { code = String(Math.floor(1000 + Math.random() * 9000)); } while (usedCodes.has(code));
  const enc = CryptoJS.AES.encrypt(JSON.stringify({ code, username, createdAt: Date.now() }), ADMIN_KEY).toString();
  await codeRef.set({ data: enc });
  return code;
}

async function countUserTransactions(username, transactionsRaw) {
  let count = 0;
  if (transactionsRaw) {
    for (const key in transactionsRaw) {
      const d = await decryptData(transactionsRaw[key]);
      const userField = d?.user || d?.operator || '';
      if (d && userField === username) count++;
    }
  }
  return count;
}

export default async function handler(req, res) {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',');
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  else if (allowedOrigins.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, X-Fingerprint, X-User');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ip = req.headers['x-forwarded-for'] || 'unknown';
  const fp = req.headers['x-fingerprint'] || '';
  if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Terlalu banyak request.' });

  try {
    let path, method, data;
    let useHybridEncryption = false;
    let hybridAESKey = null;
    
    if (req.body?.key && req.body?.data && req.body?.iv && RSA_PRIVATE_KEY) {
      try {
        const cleanPrivateKey = RSA_PRIVATE_KEY.replace(/\\n/g, '\n');
        const encryptedKey = Buffer.from(req.body.key, 'base64');
        const decryptedKey = crypto.privateDecrypt(
          { key: cleanPrivateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
          encryptedKey
        );
        hybridAESKey = decryptedKey.toString('utf8');
        const decrypted = CryptoJS.AES.decrypt(req.body.data, CryptoJS.enc.Hex.parse(hybridAESKey), {
          iv: CryptoJS.enc.Hex.parse(req.body.iv),
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.Pkcs7
        });
        const payload = JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
        path = payload.path;
        method = payload.method || 'GET';
        data = payload.data || null;
        useHybridEncryption = true;
      } catch(e) {
        return res.status(401).json({ error: 'Invalid encryption' });
      }
    } else if (req.body?.path) {
      path = req.body.path;
      method = req.body.method || 'GET';
      data = req.body.data || null;
    } else {
      return res.status(400).json({ error: 'Permintaan tidak valid' });
    }
    
    if (!path || typeof path !== 'string' || path.length > 200) return res.status(400).json({ error: 'Path tidak valid' });

    const sendResponse = (responseData) => {
      if (useHybridEncryption && hybridAESKey) {
        const newIV = crypto.randomBytes(16).toString('hex');
        const encrypted = CryptoJS.AES.encrypt(JSON.stringify(responseData), CryptoJS.enc.Hex.parse(hybridAESKey), {
          iv: CryptoJS.enc.Hex.parse(newIV),
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.Pkcs7
        });
        return res.status(200).json({ encrypted: encrypted.toString(), iv: newIV });
      }
      return res.status(200).json(responseData);
    };

    const ref = db.ref(path);

    if (path === 'check_blocked' && method === 'POST') {
      const ipBlocked = await isIPBlocked(ip);
      const fpBlocked = fp ? await isFPBlocked(fp) : false;
      return sendResponse({ blocked: ipBlocked || fpBlocked });
    }

    if (path === 'maintenance_status') {
      if (method === 'GET') {
        const snap = await ref.once('value');
        const raw = snap.val();
        const result = raw ? await decryptData(raw) : {};
        return sendResponse(result || {});
      }
    }

    if (path === 'check_account_status' && method === 'POST') {
      const username = data.username;
      const user_id = data.user_id;
      const snap = await db.ref('users/' + user_id).once('value');
      const raw = snap.val();
      const userData = await decryptData(raw);
      if (!userData || userData.username !== username) return sendResponse({ valid: false });
      if (userData.banned === true) return sendResponse({ banned: true, bannedUntil: userData.bannedUntil || 0 });
      if (userData.banAkses === true) return sendResponse({ banAkses: true, banAksesUntil: userData.banAksesUntil || 0 });
      if (userData.forceLogout === true) return sendResponse({ forceLogout: true });
      return sendResponse({ valid: true, user: { id: user_id, username: userData.username, role: userData.role || 'User', full_name: userData.full_name || userData.username, expiry_date: userData.expiry_date || '' } });
    }

    // ==================== TRANSAKSI ====================
    if (path === 'transactions' && method === 'POST') {
      const trxUser = data?.user || data?.operator || '';
      const rateOk = await checkTransactionRateLimit(trxUser || ip);
      if (!rateOk) return sendResponse({ success: false, error: 'rate_limit_trx' });
      
      const code = await getUserTrxCode(trxUser || 'unknown');
      const existingSnap = await db.ref('transactions').once('value');
      const existingRaw = existingSnap.val() || {};
      const existingCount = await countUserTransactions(trxUser || 'unknown', existingRaw);
      const seq = existingCount + 1;
      const trxId = code + '-' + String(seq).padStart(3, '0');
      
      const trxData = {
        ...data,
        user: trxUser,
        trxId: trxId,
        timestamp: data?.timestamp || Date.now()
      };
      
      const enc = CryptoJS.AES.encrypt(JSON.stringify(trxData), ADMIN_KEY).toString();
      const r = db.ref('transactions').push();
      await r.set({ data: enc });
      
      return sendResponse({ success: true, id: r.key, trxId: trxId });
    }

    if (path === 'transactions' && method === 'GET') {
      const trxUsername = data?.username || '';
      const snap = await db.ref('transactions').once('value');
      const raw = snap.val() || {};
      const result = {};
      for (const key in raw) {
        const d = await decryptData(raw[key]);
        const userField = d?.user || d?.operator || '';
        if (d && (!trxUsername || userField === trxUsername)) {
          d.trxId = d.trxId || '-';
          d.timestamp = d.timestamp || Date.now();
          result[key] = d;
        }
      }
      return sendResponse(result);
    }

    if (path === 'transactions' && method === 'DELETE') {
      const trxUsername = data?.username || '';
      const snap = await db.ref('transactions').once('value');
      const raw = snap.val() || {};
      const updates = {};
      for (const key in raw) {
        const d = await decryptData(raw[key]);
        const userField = d?.user || d?.operator || '';
        if (d && userField === trxUsername) updates[key] = null;
      }
      if (Object.keys(updates).length > 0) await db.ref('transactions').update(updates);
      return sendResponse({ success: true });
    }

    return res.status(400).json({ error: 'Metode tidak valid' });
  } catch (error) {
    console.error('Server error:', error.message);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
  }
}