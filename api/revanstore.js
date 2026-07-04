import CryptoJS from 'crypto-js';

const FIREBASE_URL = process.env.FIREBASE_URL || 'https://dhagwxwhu-default-rtdb.firebaseio.com';
const ADMIN_KEY = process.env.ADMIN_KEY;

async function dbGet(path) {
  const res = await fetch(FIREBASE_URL + '/' + path + '.json');
  const text = await res.text();
  if (!text || text === 'null') return null;
  return JSON.parse(text);
}

async function dbSet(path, data) {
  const res = await fetch(FIREBASE_URL + '/' + path + '.json', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return await res.json();
}

async function dbPatch(path, data) {
  const res = await fetch(FIREBASE_URL + '/' + path + '.json', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return await res.json();
}

async function dbDelete(path) {
  const res = await fetch(FIREBASE_URL + '/' + path + '.json', { method: 'DELETE' });
  return await res.json();
}

async function isIPBlocked(ip) {
  const data = await dbGet('blocked_ips/' + ip.replace(/\./g, '_'));
  if (data && data.data) {
    try {
      const dec = CryptoJS.AES.decrypt(data.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
      const result = JSON.parse(dec);
      if (result && result.blocked) return true;
    } catch(e) {}
  }
  return false;
}

async function isFPBlocked(fp) {
  const data = await dbGet('blocked_fp/' + fp);
  if (data && data.data) {
    try {
      const dec = CryptoJS.AES.decrypt(data.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
      const result = JSON.parse(dec);
      if (result && result.blocked) return true;
    } catch(e) {}
  }
  return false;
}

async function blockIP(ip) {
  const enc = CryptoJS.AES.encrypt(JSON.stringify({ ip: ip, blocked: true, blocked_at: new Date().toISOString() }), ADMIN_KEY).toString();
  await dbSet('blocked_ips/' + ip.replace(/\./g, '_'), { data: enc });
}

async function blockFP(fp) {
  const enc = CryptoJS.AES.encrypt(JSON.stringify({ fingerprint: fp, blocked: true, blocked_at: new Date().toISOString() }), ADMIN_KEY).toString();
  await dbSet('blocked_fp/' + fp, { data: enc });
}

async function trackLoginAttempt(ip, fp) {
  const key = ip.replace(/\./g, '_') + '_' + (fp || 'nofp');
  const data = await dbGet('login_attempts/' + key);
  const now = Date.now();
  let attempts = 0;
  let lastAttempt = 0;
  
  if (data && data.data) {
    try {
      const dec = CryptoJS.AES.decrypt(data.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
      const result = JSON.parse(dec);
      attempts = result.count || 0;
      lastAttempt = result.last_attempt || 0;
    } catch(e) {}
  }
  
  if (now - lastAttempt > 3600000) {
    const enc = CryptoJS.AES.encrypt(JSON.stringify({ count: 1, last_attempt: now, fingerprint: fp }), ADMIN_KEY).toString();
    await dbSet('login_attempts/' + key, { data: enc });
    return 1;
  }
  
  const newCount = attempts + 1;
  const enc = CryptoJS.AES.encrypt(JSON.stringify({ count: newCount, last_attempt: now, fingerprint: fp }), ADMIN_KEY).toString();
  await dbPatch('login_attempts/' + key, { data: enc });
  return newCount;
}

async function resetLoginAttempt(ip, fp) {
  const key = ip.replace(/\./g, '_') + '_' + (fp || 'nofp');
  await dbDelete('login_attempts/' + key);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, X-Fingerprint');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
  const fp = req.headers['x-fingerprint'] || '';
  
  if (req.method === 'GET') return res.status(200).json({ status: 'OK' });

  try {
    const { path, method, data } = req.body;
    
    if (path === 'login_failed') {
      const attempts = await trackLoginAttempt(ip, fp);
      await new Promise(r => setTimeout(r, attempts * 500));
      
      if (attempts >= 5) {
        await blockIP(ip);
        if (fp) await blockFP(fp);
        return res.status(200).json({ blocked: true });
      }
      
      return res.status(200).json({ attempts: attempts });
    }
    
    if (path === 'login_success') {
      await resetLoginAttempt(ip, fp);
      return res.status(200).json({ success: true });
    }
    
    if (path === 'login') {
      const ipBlocked = await isIPBlocked(ip);
      const fpBlocked = fp ? await isFPBlocked(fp) : false;
      
      if (ipBlocked || fpBlocked) {
        return res.status(200).json({ blocked: true });
      }
      
      const response = await fetch(FIREBASE_URL + '/users.json');
      const users = await response.json();
      
      for (const key in users) {
        if (users[key].username === data.username && users[key].password === data.password) {
          return res.status(200).json({
            success: true,
            data: {
              id: key,
              username: users[key].username,
              role: users[key].role || 'User',
              full_name: users[key].full_name || '',
              expiry_date: users[key].expiry_date || ''
            }
          });
        }
      }
      
      return res.status(200).json({ success: false });
    }
    
    if (path === 'users' && (!method || method === 'GET')) {
      const response = await fetch(FIREBASE_URL + '/users.json');
      const users = await response.json();
      const filtered = {};
      for (const key in users) {
        filtered[key] = {
          username: users[key].username,
          role: users[key].role || 'User',
          full_name: users[key].full_name || '',
          expiry_date: users[key].expiry_date || ''
        };
      }
      return res.status(200).json(filtered);
    }
    
    let url = FIREBASE_URL + '/' + path + '.json';
    const options = { method: method || 'GET', headers: { 'Content-Type': 'application/json' } };
    
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }
    
    if (method === 'DELETE') {
      options.method = 'DELETE';
    }
    
    const response = await fetch(url, options);
    const text = await response.text();
    if (!text || text === 'null') return res.status(200).json(null);
    return res.status(200).json(JSON.parse(text));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}