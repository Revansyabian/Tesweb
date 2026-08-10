import CryptoJS from 'crypto-js';
import admin from 'firebase-admin';

const ADMIN_KEY = process.env.ADMIN_KEY;
const RECAPTCHA_V2_SECRET_KEY = process.env.RECAPTCHA_V2_SECRET_KEY;
const RECAPTCHA_V3_SECRET_KEY = process.env.RECAPTCHA_V3_SECRET_KEY;
const API_SECRET = process.env.API_SECRET || 'bussid_api_secret_2024';

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

export default async function handler(req, res) {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',');
  const origin = req.headers.origin;
  
  if (origin && allowedOrigins.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  else if (allowedOrigins.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*');
  
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, X-Fingerprint, X-Operator');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const ip = req.headers['x-forwarded-for'] || 'unknown';
  const fp = req.headers['x-fingerprint'] || '';
  
  let operator = '';
  try {
    const encryptedOperator = req.headers['x-operator'] || '';
    if (encryptedOperator) operator = CryptoJS.AES.decrypt(encryptedOperator, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
  } catch(e) {}
  
  if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Terlalu banyak request. Coba lagi nanti.' });

  try {
    let path, method, data;
    
    const publicPaths = [
      'login',
      'check_blocked',
      'check_account_status',
      'login_failed',
      'login_success'
    ];
    
    if (req.body?.data && typeof req.body.data === 'string') {
      const decrypted = decryptPayload(req.body.data);
      if (!decrypted || !decrypted.path) return res.status(400).json({ error: 'Invalid payload' });
      path = decrypted.path;
      method = decrypted.method;
      data = decrypted.data;
    } else if (req.body?.path) {
      if (!publicPaths.includes(req.body.path)) {
        const apiKey = req.headers['x-api-key'];
        if (!apiKey || apiKey !== process.env.API_KEY) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
      }
      path = req.body.path;
      method = req.body.method;
      data = req.body.data;
    } else {
      return res.status(400).json({ error: 'Invalid request' });
    }
    
    if (!path || typeof path !== 'string' || path.length > 200) return res.status(400).json({ error: 'Invalid path' });
    
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
      const user = await decryptData(raw);
      
      if (!user || user.username !== username) {
        return res.status(200).json(encryptResponse({ valid: false, message: 'Session tidak valid' }));
      }

      if (user.banned === true) {
        return res.status(200).json(encryptResponse({ banned: true, bannedUntil: user.bannedUntil || 0 }));
      }

      if (user.banAkses === true) {
        if (user.banAksesUntil && user.banAksesUntil !== 0 && user.banAksesUntil < Date.now()) {
          const updatedData = { ...user, banAkses: false, banAksesUntil: 0 };
          const enc = CryptoJS.AES.encrypt(JSON.stringify(updatedData), ADMIN_KEY).toString();
          await db.ref('users/' + user_id).update({ data: enc });
        } else {
          return res.status(200).json(encryptResponse({ banAkses: true, banAksesUntil: user.banAksesUntil || 0 }));
        }
      }

      if (user.forceLogout === true) {
        return res.status(200).json(encryptResponse({ forceLogout: true }));
      }

      return res.status(200).json(encryptResponse({ valid: true, user: { id: user_id, username: user.username, role: user.role || 'Operator', full_name: user.full_name || user.username, expiry_date: user.expiry_date || '' } }));
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
        
        if (decryptedUser && decryptedUser.username === username && decryptedUser.password === password) {

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
              id: key, username: decryptedUser.username, role: decryptedUser.role || 'Operator',
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

    return res.status(400).json(encryptResponse({ error: 'Invalid method' }));
  } catch (error) {
    return res.status(500).json(encryptResponse({ error: error.message }));
  }
}