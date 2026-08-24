const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const CryptoJS = require('crypto-js');
const crypto = require('crypto');

const RSA_PRIVATE_KEY = process.env.RSA_PRIVATE_KEY;

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS'
});

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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Authorization, X-Requested-With, X-Fingerprint');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.url.startsWith('/api/playfab')) {
    return limiter(req, res, () => proxy(req, res));
  }

  return limiter(req, res, async () => {
    try {
      let path = null;
      let method = 'POST';
      let data = null;
      let aesKey = null;
      
      if (req.body?.key && req.body?.data && req.body?.iv) {
        try {
          const cleanPrivateKey = RSA_PRIVATE_KEY.replace(/\\n/g, '\n');
          
          const encryptedKey = Buffer.from(req.body.key, 'base64');
          const decryptedKey = crypto.privateDecrypt(
            {
              key: cleanPrivateKey,
              padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
              oaepHash: 'sha256'
            },
            encryptedKey
          );
          
          aesKey = decryptedKey.toString('utf8');
          
          const decrypted = CryptoJS.AES.decrypt(req.body.data, CryptoJS.enc.Hex.parse(aesKey), {
            iv: CryptoJS.enc.Hex.parse(req.body.iv),
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
          });
          
          const decryptedStr = decrypted.toString(CryptoJS.enc.Utf8);
          if (!decryptedStr) {
            return res.status(401).json({ error: 'Invalid encryption' });
          }
          
          const payload = JSON.parse(decryptedStr);
          path = payload.path;
          method = payload.method || 'POST';
          data = payload.data || null;
        } catch (e) {
          console.error('Decrypt error:', e.message);
          return res.status(401).json({ error: 'Invalid encryption: ' + e.message });
        }
      } else if (req.body?.path) {
        path = req.body.path;
        method = req.body.method || 'POST';
        data = req.body.data || null;
      } else {
        return res.status(400).json({ error: 'Path required' });
      }
      
      if (!path) {
        return res.status(400).json({ error: 'Path required' });
      }
      
      let playfabEndpoint = '';
      let playfabBody = null;
      
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
      
      if (playfabBody && playfabBody.authToken) {
        headers['X-Authorization'] = playfabBody.authToken;
        delete playfabBody.authToken;
      }
      
      const response = await fetch(`https://4AE9.playfabapi.com${playfabEndpoint}`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(playfabBody)
      });
      
      const result = await response.json();
      
      if (aesKey) {
        try {
          const newIV = crypto.randomBytes(16).toString('hex');
          const encryptedResponse = CryptoJS.AES.encrypt(JSON.stringify(result), CryptoJS.enc.Hex.parse(aesKey), {
            iv: CryptoJS.enc.Hex.parse(newIV),
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
          });
          
          return res.status(200).json({
            encrypted: encryptedResponse.toString(),
            iv: newIV
          });
        } catch (e) {
          console.error('Encrypt response error:', e.message);
          return res.status(200).json(result);
        }
      }
      
      return res.status(200).json(result);
    } catch (error) {
      console.error('rvnstore error:', error.message);
      return res.status(500).json({ error: error.message });
    }
  });
};