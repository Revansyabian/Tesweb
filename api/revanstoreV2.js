import CryptoJS from 'crypto-js';
import admin from 'firebase-admin';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const ADMIN_KEY = process.env.ADMIN_KEY;
const RECAPTCHA_V2_SECRET_KEY = process.env.RECAPTCHA_V2_SECRET_KEY;
const RECAPTCHA_V3_SECRET_KEY = process.env.RECAPTCHA_V3_SECRET_KEY;
const API_SECRET = process.env.API_SECRET;
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
const sessionKeys = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  if (!rateLimitMap.has(ip)) rateLimitMap.set(ip, []);
  const requests = rateLimitMap.get(ip).filter(t => now - t < RATE_LIMIT_WINDOW);
  if (requests.length >= RATE_LIMIT_MAX) return false;
  requests.push(now);
  rateLimitMap.set(ip, requests);
  return true;
}

function encryptResponse(data) {
  const encrypted = CryptoJS.AES.encrypt(JSON.stringify(data), API_SECRET).toString();
  return { encrypted: true, data: encrypted };
}

function decryptPayload(encryptedData) {
  try {
    const dec = CryptoJS.AES.decrypt(encryptedData, API_SECRET).toString(CryptoJS.enc.Utf8);
    return JSON.parse(dec);
  } catch(e) { return null; }
}

async function decryptData(raw) {
  if (!raw) return raw;
  if (raw.data) {
    try {
      const dec = CryptoJS.AES.decrypt(raw.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
      return JSON.parse(dec);
    } catch(e) { return raw; }
  }
  return raw;
}

async function hashPassword(password) {
  try {
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    const hash = await bcrypt.hash(password, salt);
    return hash;
  } catch (e) {
    console.error('Error hashing password:', e);
    return null;
  }
}

async function verifyPassword(password, hash) {
  try {
    return await bcrypt.compare(password, hash);
  } catch (e) {
    console.error('Error verifying password:', e);
    return false;
  }
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

async function verifyRecaptchaV3(token, action) {
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
    const enc = CryptoJS.AES.encrypt(JSON.stringify({
      username, action, details: details || '', ip: ip || '', fingerprint: fp || '', timestamp: Date.now()
    }), ADMIN_KEY).toString();
    const newRef = db.ref('activity_logs').push();
    await newRef.set({ data: enc });
  } catch(e) {}
}

function sanitizeKey(str) {
  return String(str || '').replace(/[.#$\[\]\/]/g, '_');
}

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
    if (Object.keys(updates).length > 0) {
      await db.ref('transactions').update(updates);
    }
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
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (usedCodes.has(code));
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, X-Fingerprint, X-User, X-Session-Id');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const ip = req.headers['x-forwarded-for'] || 'unknown';
  const fp = req.headers['x-fingerprint'] || '';
  
  let user = '';
  try {
    const encryptedUser = req.headers['x-user'] || '';
    if (encryptedUser) user = CryptoJS.AES.decrypt(encryptedUser, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
  } catch(e) {}
  
  if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Terlalu banyak request. Coba lagi nanti.' });

  try {
    let path, method, data;
    
    const publicPaths = [
      'login',
      'register',
      'check_blocked',
      'check_account_status',
      'login_failed',
      'login_success',
      'maintenance_status',
      'session-key',
      'proxy'
    ];
    
    if (req.body?.data && typeof req.body.data === 'string') {
      const decrypted = decryptPayload(req.body.data);
      if (!decrypted || !decrypted.path) return res.status(400).json({ error: 'Payload tidak valid' });
      path = decrypted.path;
      method = decrypted.method;
      data = decrypted.data;
    } else if (req.body?.path) {
      if (!publicPaths.includes(req.body.path)) {
        const apiKey = req.headers['x-api-key'];
        if (!apiKey || apiKey !== process.env.API_KEY) {
          return res.status(401).json({ error: 'Tidak diizinkan' });
        }
      }
      path = req.body.path;
      method = req.body.method;
      data = req.body.data;
    } else {
      return res.status(400).json({ error: 'Permintaan tidak valid' });
    }
    
    if (!path || typeof path !== 'string' || path.length > 200) return res.status(400).json({ error: 'Path tidak valid' });
    
    // ==================== SESSION KEY ====================
    if (path === 'session-key') {
      const key = crypto.randomBytes(32).toString('hex');
      const iv = crypto.randomBytes(16).toString('hex');
      const sessionId = key.substring(0, 32);
      
      sessionKeys.set(sessionId, {
        key: key,
        iv: iv,
        fingerprint: fp,
        createdAt: Date.now(),
        expiresAt: Date.now() + (5 * 60 * 1000)
      });
      
      for (const [id, session] of sessionKeys) {
        if (Date.now() > session.expiresAt) {
          sessionKeys.delete(id);
        }
      }
      
      return res.status(200).json({
        key: key,
        iv: iv,
        expiresIn: 300
      });
    }
    
    // ==================== PROXY ====================
    if (path === 'proxy') {
      const sessionId = req.headers['x-session-id'] || '';
      const encryptedData = data?.data || '';
      const iv = data?.iv || '';
      const timestamp = data?.timestamp || 0;
      
      const session = sessionKeys.get(sessionId);
      if (!session) {
        return res.status(401).json({ error: 'Session expired' });
      }
      
      if (Date.now() > session.expiresAt) {
        sessionKeys.delete(sessionId);
        return res.status(401).json({ error: 'Session expired' });
      }
      
      if (Math.abs(Date.now() - timestamp) > 60000) {
        return res.status(401).json({ error: 'Request expired' });
      }
      
      if (session.fingerprint !== fp) {
        return res.status(401).json({ error: 'Fingerprint mismatch' });
      }
      
      let payload;
      try {
        const decrypted = CryptoJS.AES.decrypt(encryptedData, CryptoJS.enc.Hex.parse(session.key), {
          iv: CryptoJS.enc.Hex.parse(iv),
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.Pkcs7
        });
        payload = JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
      } catch (e) {
        return res.status(401).json({ error: 'Invalid encryption' });
      }
      
      if (!payload || !payload.path) {
        return res.status(400).json({ error: 'Path required' });
      }
      
      path = payload.path;
      method = payload.method || 'GET';
      data = payload.data || null;
      
      // Flag untuk menandai response harus dienkripsi dengan session key
      var useSessionEncryption = true;
    }
    
    const ref = db.ref(path);

    if (path === 'check_blocked' && method === 'POST') {
      const captchaToken = data?.captchaToken || '';
      const captchaValid = await verifyRecaptchaV3(captchaToken, 'check_blocked');
      if (!captchaValid) {
        return res.status(200).json(encryptResponse({ blocked: true, blockType: 'captcha', message: 'Verifikasi reCAPTCHA gagal.' }));
      }
      const ipBlocked = await isIPBlocked(ip);
      const fpBlocked = fp ? await isFPBlocked(fp) : false;
      return res.status(200).json(encryptResponse({ blocked: ipBlocked || fpBlocked, blockType: ipBlocked ? 'ip' : 'device' }));
    }

    if (path === 'maintenance_status') {
      if (method === 'GET') {
        const snap = await ref.once('value');
        const raw = snap.val();
        const result = raw ? await decryptData(raw) : {};
        return res.status(200).json(encryptResponse(result || {}));
      }
      if (method === 'PUT') {
        const enc = CryptoJS.AES.encrypt(JSON.stringify(data), ADMIN_KEY).toString();
        await ref.set({ data: enc });
        return res.status(200).json(encryptResponse({ success: true }));
      }
    }

    if (path === 'check_account_status' && method === 'POST') {
      const captchaToken = data?.captchaToken || '';
      const captchaValid = await verifyRecaptchaV3(captchaToken, 'check_session');
      if (!captchaValid) {
        return res.status(200).json(encryptResponse({ banAkses: true, banAksesUntil: 0, message: 'Verifikasi reCAPTCHA gagal.' }));
      }
      const username = data.username;
      const user_id = data.user_id;
      
      const snap = await db.ref('users/' + user_id).once('value');
      const raw = snap.val();
      const userData = await decryptData(raw);
      
      if (!userData || userData.username !== username) {
        return res.status(200).json(encryptResponse({ valid: false, message: 'Sesi tidak valid' }));
      }

      if (userData.banned === true) {
        return res.status(200).json(encryptResponse({ banned: true, bannedUntil: userData.bannedUntil || 0 }));
      }

      if (userData.banAkses === true) {
        if (userData.banAksesUntil && userData.banAksesUntil !== 0 && userData.banAksesUntil < Date.now()) {
          const updatedData = { ...userData, banAkses: false, banAksesUntil: 0 };
          const enc = CryptoJS.AES.encrypt(JSON.stringify(updatedData), ADMIN_KEY).toString();
          await db.ref('users/' + user_id).update({ data: enc });
        } else {
          return res.status(200).json(encryptResponse({ banAkses: true, banAksesUntil: userData.banAksesUntil || 0 }));
        }
      }

      if (userData.forceLogout === true) {
        return res.status(200).json(encryptResponse({ forceLogout: true }));
      }

      return res.status(200).json(encryptResponse({ valid: true, user: { id: user_id, username: userData.username, role: userData.role || 'User', full_name: userData.full_name || userData.username, expiry_date: userData.expiry_date || '' } }));
    }

    if (path === 'access_key' && method === 'GET') {
      const snap = await ref.once('value');
      const raw = snap.val();
      let result = { key: '' };
      if (raw && raw.data) {
        try {
          const dec = CryptoJS.AES.decrypt(raw.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
          result = JSON.parse(dec);
        } catch (e) {}
      }
      return res.status(200).json(encryptResponse(result));
    }

    if (path === 'admin/auth' && method === 'GET') {
      const ipBlocked = await isIPBlocked(ip);
      const fpBlocked = fp ? await isFPBlocked(fp) : false;
      if (ipBlocked || fpBlocked) {
        return res.status(200).json(encryptResponse({ blocked: true }));
      }
      const snap = await ref.once('value');
      const raw = snap.val();
      let result = {};
      if (raw && raw.data) {
        try {
          const dec = CryptoJS.AES.decrypt(raw.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
          result = JSON.parse(dec);
        } catch (e) {}
      }
      return res.status(200).json(encryptResponse(result));
    }

    if (path === 'register' && method === 'POST') {
      const captchaToken = data?.captchaToken || '';
      const captchaValid = await verifyRecaptchaV2(captchaToken);
      if (!captchaValid) {
        return res.status(200).json(encryptResponse({ success: false, error: 'invalid_captcha', message: 'reCAPTCHA tidak valid!' }));
      }

      const username = data?.username || '';
      const email = data?.email || '';
      const userIP = data?.ip || ip;
      const userFP = data?.fingerprint || fp;

      const ipKey = 'register_ip_' + userIP.replace(/\./g, '_');
      const ipRef = db.ref('register_limits/' + ipKey);
      const ipSnap = await ipRef.once('value');
      const ipRaw = ipSnap.val();
      if (ipRaw?.data) {
        try {
          const ipData = JSON.parse(CryptoJS.AES.decrypt(ipRaw.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8));
          if (Date.now() - (ipData.lastRegister || 0) < 86400000) {
            return res.status(200).json(encryptResponse({ success: false, error: 'ip_limit', message: 'IP sudah mendaftar hari ini.' }));
          }
        } catch(e) {}
      }

      if (userFP) {
        const fpKey = 'register_fp_' + userFP;
        const fpRef = db.ref('register_limits/' + fpKey);
        const fpSnap = await fpRef.once('value');
        const fpRaw = fpSnap.val();
        if (fpRaw?.data) {
          try {
            const fpData = JSON.parse(CryptoJS.AES.decrypt(fpRaw.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8));
            if (Date.now() - (fpData.lastRegister || 0) < 86400000) {
              return res.status(200).json(encryptResponse({ success: false, error: 'fp_limit', message: 'Perangkat sudah mendaftar hari ini.' }));
            }
          } catch(e) {}
        }
      }

      const usersSnap = await db.ref('users').once('value');
      const users = usersSnap.val();
      if (users) {
        for (const key in users) {
          const userData = await decryptData(users[key]);
          if (userData && userData.username === username) {
            return res.status(200).json(encryptResponse({ success: false, error: 'username_exists', message: 'Username sudah terdaftar!' }));
          }
          if (userData && email && userData.email === email) {
            return res.status(200).json(encryptResponse({ success: false, error: 'email_exists', message: 'Email sudah terdaftar!' }));
          }
        }
      }

      const hashedPassword = await hashPassword(data?.password || '');
      if (!hashedPassword) {
        return res.status(200).json(encryptResponse({ success: false, error: 'server_error', message: 'Gagal memproses password.' }));
      }

      const registerData = {
        ...data,
        password_hash: hashedPassword,
        password: undefined,
        status: 'pending',
        isActive: false,
        needsActivation: true,
        activationStatus: 'pending',
        role: 'User',
        createdAt: Date.now()
      };
      delete registerData.password;

      const enc = encryptData(registerData);
      const newRef = db.ref('users').push();
      await newRef.set({ data: enc });

      await ipRef.set({ data: CryptoJS.AES.encrypt(JSON.stringify({ lastRegister: Date.now() }), ADMIN_KEY).toString() });
      if (userFP) {
        await db.ref('register_limits/register_fp_' + userFP).set({ data: CryptoJS.AES.encrypt(JSON.stringify({ lastRegister: Date.now() }), ADMIN_KEY).toString() });
      }

      await logActivity(username, 'register', 'Pendaftaran baru - ' + (data?.paket || 'Trial'), userIP, userFP);
      return res.status(200).json(encryptResponse({ success: true, message: 'Pendaftaran berhasil! Tunggu aktivasi admin.' }));
    }

    if (path === 'login' && method === 'POST') {
      const captchaToken = data?.captchaToken || '';
      const captchaValid = await verifyRecaptchaV2(captchaToken);
      if (!captchaValid) {
        return res.status(200).json(encryptResponse({ blocked: true, message: 'Verifikasi reCAPTCHA gagal.' }));
      }

      if (await isIPBlocked(ip) || (fp && await isFPBlocked(fp))) {
        return res.status(200).json(encryptResponse({ blocked: true, message: 'IP atau Fingerprint diblokir.' }));
      }

      const snap = await db.ref('users').once('value');
      const users = snap.val();
      if (!users) return res.status(200).json(encryptResponse({ success: false }));

      const username = data.username;
      const password = data.password;
      const currentIP = data.ip || ip;
      const currentFP = data.fingerprint || fp;

      for (const key in users) {
        const decryptedUser = await decryptData(users[key]);
        
        if (decryptedUser && decryptedUser.username === username) {
          const isPasswordValid = await verifyPassword(password, decryptedUser.password_hash);
          
          if (!isPasswordValid) {
            continue;
          }

          if (decryptedUser.activationStatus === 'pending') {
            return res.status(200).json(encryptResponse({ success: false, error: 'pending_activation', message: 'Akun belum diaktivasi oleh admin.' }));
          }
          if (decryptedUser.activationStatus === 'rejected') {
            return res.status(200).json(encryptResponse({ success: false, error: 'rejected', message: 'Akun ditolak oleh admin.' }));
          }

          if (decryptedUser.banned === true) {
            await logActivity(username, 'login_blocked_banned', 'Login ditolak - akun dibanned', currentIP, currentFP);
            return res.status(200).json(encryptResponse({
              success: false, banned: true, bannedUntil: decryptedUser.bannedUntil || 0,
              message: 'Akun Anda telah dibanned oleh admin.'
            }));
          }

          if (decryptedUser.banAkses === true) {
            if (decryptedUser.banAksesUntil && decryptedUser.banAksesUntil !== 0 && decryptedUser.banAksesUntil < Date.now()) {
              const updatedData = { ...decryptedUser, banAkses: false, banAksesUntil: 0 };
              const enc = CryptoJS.AES.encrypt(JSON.stringify(updatedData), ADMIN_KEY).toString();
              await db.ref('users/' + key).update({ data: enc });
            } else {
              await logActivity(username, 'login_blocked_banakses', 'Login ditolak - ban akses', currentIP, currentFP);
              return res.status(200).json(encryptResponse({
                success: false, banAkses: true, banAksesUntil: decryptedUser.banAksesUntil || 0,
                message: 'Akses Anda diblokir oleh admin.'
              }));
            }
          }

          if (decryptedUser.forceLogout === true) {
            await logActivity(username, 'login_blocked_force', 'Login ditolak - ditangguhkan', currentIP, currentFP);
            return res.status(200).json(encryptResponse({
              success: false, forceLogout: true,
              message: 'Akun Anda ditangguhkan karena indikasi sharing akun.'
            }));
          }

          const prevIP = decryptedUser.ip || '';
          const prevFP = decryptedUser.fingerprint || '';
          const ipChanged = prevIP && currentIP && prevIP !== currentIP;
          const fpChanged = prevFP && currentFP && prevFP !== currentFP;

          if (ipChanged && fpChanged) {
            const updatedData = { ...decryptedUser, forceLogout: true };
            const enc = CryptoJS.AES.encrypt(JSON.stringify(updatedData), ADMIN_KEY).toString();
            await db.ref('users/' + key).update({ data: enc });
            await logActivity(username, 'sharing_detected', 'IP & FP berbeda! Auto force logout.', currentIP, currentFP);
            return res.status(200).json(encryptResponse({
              success: false, forceLogout: true,
              message: 'Akun ditangguhkan karena terdeteksi sharing. Hubungi admin.'
            }));
          }

          const ipHistory = decryptedUser.ipHistory || [];
          if (currentIP && (!ipHistory.length || ipHistory[ipHistory.length - 1] !== currentIP)) {
            ipHistory.push(currentIP);
            if (ipHistory.length > 10) ipHistory.shift();
          }

          const fpHistory = decryptedUser.fpHistory || [];
          if (currentFP && (!fpHistory.length || fpHistory[fpHistory.length - 1] !== currentFP)) {
            fpHistory.push(currentFP);
            if (fpHistory.length > 10) fpHistory.shift();
          }

          const updatedData = {
            ...decryptedUser, ip: currentIP, fingerprint: currentFP, ipHistory, fpHistory,
            lastLogin: { ip: currentIP, fingerprint: currentFP, timestamp: Date.now() }
          };

          const enc = CryptoJS.AES.encrypt(JSON.stringify(updatedData), ADMIN_KEY).toString();
          await db.ref('users/' + key).update({ data: enc });
          await resetLoginAttempt(ip, fp);
          await logActivity(username, 'login_success', 'Login berhasil', currentIP, currentFP);

          return res.status(200).json(encryptResponse({
            success: true,
            data: {
              id: key, username: decryptedUser.username, role: decryptedUser.role || 'User',
              full_name: decryptedUser.full_name || decryptedUser.username, expiry_date: decryptedUser.expiry_date || '',
              ip: currentIP, fingerprint: currentFP
            }
          }));
        }
      }

      await logActivity(username, 'login_failed', 'Password salah', currentIP, currentFP);
      return res.status(200).json(encryptResponse({ success: false }));
    }

    if (path === 'login_failed' && method === 'POST') {
      const attempts = await trackLoginAttempt(ip, fp);
      await new Promise(r => setTimeout(r, Math.min(attempts * 500, 3000)));
      if (attempts >= 5) {
        await blockIP(ip);
        if (fp) await blockFP(fp);
        return res.status(200).json(encryptResponse({ blocked: true }));
      }
      return res.status(200).json(encryptResponse({ attempts, remaining: 5 - attempts }));
    }

    if (path === 'login_success' && method === 'POST') {
      await resetLoginAttempt(ip, fp);
      return res.status(200).json(encryptResponse({ success: true }));
    }

    if (path === 'block_ip_manual' && method === 'POST') {
      await blockIP(data.ip);
      await logActivity('admin', 'block_ip', 'IP ' + data.ip + ' diblokir', ip, fp);
      return res.status(200).json(encryptResponse({ success: true }));
    }

    if (path === 'block_fp_manual' && method === 'POST') {
      await blockFP(data.fp);
      await logActivity('admin', 'block_fp', 'FP diblokir', ip, fp);
      return res.status(200).json(encryptResponse({ success: true }));
    }

    if (path === 'transactions' && method === 'POST') {
      const trxUser = data?.user || data?.operator || '';
      const rateOk = await checkTransactionRateLimit(trxUser || ip);
      if (!rateOk) {
        return res.status(200).json(encryptResponse({ success: false, error: 'rate_limit_trx', message: 'Terlalu banyak transaksi, tunggu sebentar sebelum transaksi lagi.' }));
      }
      await cleanupOldTransactions();
      const code = await getUserTrxCode(trxUser || 'unknown');
      const existingSnap = await db.ref('transactions').once('value');
      const existingCount = await countUserTransactions(trxUser || 'unknown', existingSnap.val());
      const seq = existingCount + 1;
      const trxId = code + '-' + String(seq).padStart(3, '0');
      const trxData = { ...data, user: trxUser, trxId };
      const enc = encryptData(trxData);
      const r = db.ref('transactions').push();
      await r.set({ data: enc });
      return res.status(200).json(encryptResponse({ success: true, id: r.key, trxId }));
    }

    if (path === 'transactions' && method === 'GET') {
      await cleanupOldTransactions();
      const trxUsername = data?.username || '';
      const snap = await db.ref('transactions').once('value');
      const raw = snap.val();
      const result = {};
      if (raw) {
        for (const key in raw) {
          const d = await decryptData(raw[key]);
          const userField = d?.user || d?.operator || '';
          if (d && (!trxUsername || userField === trxUsername)) result[key] = d;
        }
      }
      return res.status(200).json(encryptResponse(result));
    }

    if (path === 'transactions' && method === 'DELETE') {
      const trxUsername = data?.username || '';
      const snap = await db.ref('transactions').once('value');
      const raw = snap.val();
      if (raw) {
        const updates = {};
        for (const key in raw) {
          const d = await decryptData(raw[key]);
          const userField = d?.user || d?.operator || '';
          if (d && userField === trxUsername) updates[key] = null;
        }
        if (Object.keys(updates).length > 0) await db.ref('transactions').update(updates);
      }
      return res.status(200).json(encryptResponse({ success: true }));
    }

    if (method === 'GET') {
      const snap = await ref.once('value');
      const raw = snap.val();
      const result = {};
      if (raw) {
        for (const key in raw) {
          const d = await decryptData(raw[key]);
          if (d) result[key] = d;
        }
      }
      return res.status(200).json(encryptResponse(result));
    }

    if (method === 'POST') {
      const enc = CryptoJS.AES.encrypt(JSON.stringify(data), ADMIN_KEY).toString();
      const r = ref.push();
      await r.set({ data: enc });
      return res.status(200).json(encryptResponse({ success: true, id: r.key }));
    }

    if (method === 'PUT') {
      const enc = CryptoJS.AES.encrypt(JSON.stringify(data), ADMIN_KEY).toString();
      await ref.set({ data: enc });
      return res.status(200).json(encryptResponse({ success: true }));
    }

    if (method === 'PATCH') {
      const snap = await ref.once('value');
      const existing = await decryptData(snap.val());
      const merged = Object.assign({}, existing || {}, data);
      const enc = CryptoJS.AES.encrypt(JSON.stringify(merged), ADMIN_KEY).toString();
      await ref.update({ data: enc });
      return res.status(200).json(encryptResponse({ success: true }));
    }

    if (method === 'DELETE') {
      await ref.remove();
      return res.status(200).json(encryptResponse({ success: true }));
    }

    return res.status(400).json(encryptResponse({ error: 'Metode tidak valid' }));
  } catch (error) {
    return res.status(500).json(encryptResponse({ error: 'Terjadi kesalahan pada server.' }));
  }
}

function encryptData(data) {
  return CryptoJS.AES.encrypt(JSON.stringify(data), ADMIN_KEY).toString();
}