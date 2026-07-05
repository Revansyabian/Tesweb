import CryptoJS from 'crypto-js';
import admin from 'firebase-admin';

const ADMIN_KEY = process.env.ADMIN_KEY;

if (!admin.apps.length) {
  const key = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: key
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
}

const db = admin.database();

async function isIPBlocked(ip) {
  const snap = await db.ref('blocked_ips/' + ip.replace(/\./g, '_')).once('value');
  const raw = snap.val();
  if (raw && raw.data) {
    try {
      const dec = CryptoJS.AES.decrypt(raw.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
      const data = JSON.parse(dec);
      if (data && data.blocked) return true;
    } catch(e) {}
  }
  return false;
}

async function isFPBlocked(fp) {
  const snap = await db.ref('blocked_fp/' + fp).once('value');
  const raw = snap.val();
  if (raw && raw.data) {
    try {
      const dec = CryptoJS.AES.decrypt(raw.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
      const data = JSON.parse(dec);
      if (data && data.blocked) return true;
    } catch(e) {}
  }
  return false;
}

async function blockIP(ip) {
  const enc = CryptoJS.AES.encrypt(JSON.stringify({ ip: ip, blocked: true, blocked_at: new Date().toISOString() }), ADMIN_KEY).toString();
  await db.ref('blocked_ips/' + ip.replace(/\./g, '_')).set({ data: enc });
}

async function blockFP(fp) {
  const enc = CryptoJS.AES.encrypt(JSON.stringify({ fingerprint: fp, blocked: true, blocked_at: new Date().toISOString() }), ADMIN_KEY).toString();
  await db.ref('blocked_fp/' + fp).set({ data: enc });
}

async function trackLoginAttempt(ip, fp) {
  const key = ip.replace(/\./g, '_') + '_' + (fp || 'nofp');
  const ref = db.ref('login_attempts/' + key);
  const snap = await ref.once('value');
  const raw = snap.val();
  const now = Date.now();
  let attempts = 0, lastAttempt = 0;
  
  if (raw && raw.data) {
    try {
      const dec = CryptoJS.AES.decrypt(raw.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
      const data = JSON.parse(dec);
      attempts = data.count || 0;
      lastAttempt = data.last_attempt || 0;
    } catch(e) {}
  }
  
  if (now - lastAttempt > 3600000) {
    const enc = CryptoJS.AES.encrypt(JSON.stringify({ count: 1, last_attempt: now, fingerprint: fp }), ADMIN_KEY).toString();
    await ref.set({ data: enc });
    return 1;
  }
  
  const newCount = attempts + 1;
  const enc = CryptoJS.AES.encrypt(JSON.stringify({ count: newCount, last_attempt: now, fingerprint: fp }), ADMIN_KEY).toString();
  await ref.update({ data: enc });
  return newCount;
}

async function resetLoginAttempt(ip, fp) {
  const key = ip.replace(/\./g, '_') + '_' + (fp || 'nofp');
  await db.ref('login_attempts/' + key).remove();
}

export default async function handler(req, res) {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',');
  const origin = req.headers.origin;
  
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (allowedOrigins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, X-Fingerprint');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const ip = req.headers['x-forwarded-for'] || 'unknown';
  const fp = req.headers['x-fingerprint'] || '';
  
  if (req.method === 'GET') return res.status(200).json({ status: 'OK' });

  try {
    const { path, method, data } = req.body;
    const ref = db.ref(path);

    if (path === 'login' && method === 'POST') {
      const ipBlocked = await isIPBlocked(ip);
      const fpBlocked = fp ? await isFPBlocked(fp) : false;
      if (ipBlocked || fpBlocked) return res.status(200).json({ blocked: true });
      
      const snap = await db.ref('users').once('value');
      const users = snap.val();
      
      for (const key in users) {
        const user = users[key];
        let username = user.username;
        let password = user.password;
        
        if (user.data) {
          try {
            const dec = CryptoJS.AES.decrypt(user.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
            const decData = JSON.parse(dec);
            username = decData.username;
            password = decData.password;
          } catch(e) {}
        }
        
        if (username === data.username && password === data.password) {
          return res.status(200).json({
            success: true,
            data: { id: key, username: username, role: user.role || 'User', full_name: user.full_name || '', expiry_date: user.expiry_date || '' }
          });
        }
      }
      return res.status(200).json({ success: false });
    }

    if (path === 'login_failed' && method === 'POST') {
      const attempts = await trackLoginAttempt(ip, fp);
      await new Promise(r => setTimeout(r, attempts * 500));
      if (attempts >= 5) { await blockIP(ip); if (fp) await blockFP(fp); return res.status(200).json({ blocked: true }); }
      return res.status(200).json({ attempts: attempts });
    }

    if (path === 'login_success' && method === 'POST') {
      await resetLoginAttempt(ip, fp);
      return res.status(200).json({ success: true });
    }

    if (method === 'GET') {
      const snap = await ref.once('value');
      const raw = snap.val();
      const result = {};
      if (raw) {
        for (const key in raw) {
          if (raw[key] && raw[key].data) {
            try { const dec = CryptoJS.AES.decrypt(raw[key].data, ADMIN_KEY).toString(CryptoJS.enc.Utf8); result[key] = JSON.parse(dec); result[key].id = key; } catch(e) {}
          } else if (raw[key]) { result[key] = raw[key]; result[key].id = key; }
        }
      }
      return res.status(200).json(result);
    }

    if (method === 'POST') { const newRef = ref.push(); await newRef.set(data); return res.status(200).json({ success: true, id: newRef.key }); }
    if (method === 'PUT') { await ref.set(data); return res.status(200).json({ success: true }); }
    if (method === 'PATCH') { await ref.update(data); return res.status(200).json({ success: true }); }
    if (method === 'DELETE') { await ref.remove(); return res.status(200).json({ success: true }); }

    return res.status(400).json({ error: 'Invalid method' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}