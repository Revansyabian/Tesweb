const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');

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
      const { endpoint, method, body, authToken } = req.body;
      
      if (!endpoint) {
        return res.status(400).json({ error: 'Endpoint required' });
      }
      
      const headers = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['X-Authorization'] = authToken;
      }
      
      const response = await fetch(`https://4AE9.playfabapi.com${endpoint}`, {
        method: method || 'POST',
        headers: headers,
        body: body ? JSON.stringify(body) : undefined
      });
      
      const result = await response.json();
      return res.status(200).json(result);
    } catch (error) {
      console.error('rvnstore error:', error.message);
      return res.status(500).json({ error: error.message });
    }
  });
};