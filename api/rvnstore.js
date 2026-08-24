import CryptoJS from 'crypto-js';
import crypto from 'crypto';
import { createProxyMiddleware } from 'http-proxy-middleware';

const RSA_PRIVATE_KEY = process.env.RSA_PRIVATE_KEY;

const limiter = (req, res, next) => {
  next();
};

const proxy = createProxyMiddleware({
  target: 'https://4AE9.playfabapi.com',
  changeOrigin: true,
  pathRewrite: {
    '^/api/playfab': '/'
  },
  onProxyReq: (proxyReq, req, res) => {
    if (req.headers['x-authorization']) {
      proxyReq.setHeader('X-Authorization', req.headers['x-authorization']);
    }
  },
  onError: (err, req, res) => {
    res.status(500).json({ error: 'Proxy error: ' + err.message });
  }
});

async function decryptHybridData(reqBody) {
  try {
    if (!reqBody?.key || !reqBody?.data || !reqBody?.iv || !RSA_PRIVATE_KEY) {
      return null;
    }
    
    const cleanPrivateKey = RSA_PRIVATE_KEY.replace(/\\n/g, '\n');
    
    const encryptedKey = Buffer.from(reqBody.key, 'base64');
    const decryptedKey = crypto.privateDecrypt(
      {
        key: cleanPrivateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      },
      encryptedKey
    );
    
    const aesKey = decryptedKey.toString('utf8');
    
    const decrypted = CryptoJS.AES.decrypt(reqBody.data, CryptoJS.enc.Hex.parse(aesKey), {
      iv: CryptoJS.enc.Hex.parse(reqBody.iv),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
    
    const payload = JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
    
    return { payload, aesKey };
  } catch (e) {
    console.error('Hybrid decrypt error:', e.message);
    return null;
  }
}

function encryptResponse(data, aesKey) {
  try {
    const newIV = crypto.randomBytes(16).toString('hex');
    const encrypted = CryptoJS.AES.encrypt(JSON.stringify(data), CryptoJS.enc.Hex.parse(aesKey), {
      iv: CryptoJS.enc.Hex.parse(newIV),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
    return {
      encrypted: encrypted.toString(),
      iv: newIV
    };
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Authorization, X-Requested-With, X-Fingerprint');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.url.startsWith('/api/playfab')) {
    return limiter(req, res, () => proxy(req, res));
  }

  try {
    let payload = null;
    let aesKey = null;
    
    if (req.body?.key && req.body?.data && req.body?.iv) {
      const decrypted = await decryptHybridData(req.body);
      if (!decrypted) {
        return res.status(401).json({ error: 'Invalid encryption' });
      }
      payload = decrypted.payload;
      aesKey = decrypted.aesKey;
    } else {
      payload = req.body;
    }
    
    if (!payload || !payload.path) {
      return res.status(400).json({ error: 'Path required' });
    }
    
    const path = payload.path;
    const method = payload.method || 'POST';
    const data = payload.data || null;
    
    let playfabEndpoint = '';
    let playfabBody = null;
    let authToken = null;
    
    if (path === 'login') {
      playfabEndpoint = '/Client/LoginWithAndroidDeviceID';
      playfabBody = data;
    } else if (path === 'get_player_info') {
      playfabEndpoint = '/Client/GetPlayerCombinedInfo';
      playfabBody = data;
    } else if (path === 'execute_cloudscript') {
      playfabEndpoint = '/Client/ExecuteCloudScript';
      playfabBody = data;
    } else if (path === 'change_display_name') {
      playfabEndpoint = '/Client/UpdateUserTitleDisplayName';
      playfabBody = data;
    } else {
      return res.status(400).json({ error: 'Unknown path: ' + path });
    }
    
    const headers = { 'Content-Type': 'application/json' };
    if (data?.authToken) {
      headers['X-Authorization'] = data.authToken;
      delete data.authToken;
      playfabBody = data;
    }
    
    const response = await fetch(`https://4AE9.playfabapi.com${playfabEndpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(playfabBody)
    });
    
    const result = await response.json();
    
    if (aesKey) {
      const encryptedResponse = encryptResponse(result, aesKey);
      if (encryptedResponse) {
        return res.status(200).json(encryptedResponse);
      }
    }
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('rvnstore error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}