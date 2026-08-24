import crypto from 'crypto';

const sessionKeys = new Map();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Fingerprint');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const fingerprint = req.headers['x-fingerprint'] || 'unknown';
  const timestamp = req.body?.timestamp || 0;
  
  // Validasi timestamp (cegah replay attack)
  if (Math.abs(Date.now() - timestamp) > 60000) {
    return res.status(401).json({ error: 'Request expired' });
  }
  
  // Generate random key dan IV
  const key = crypto.randomBytes(32).toString('hex');
  const iv = crypto.randomBytes(16).toString('hex');
  const sessionId = key.substring(0, 32);
  
  // Simpan session key dengan expiry 5 menit
  sessionKeys.set(sessionId, {
    key: key,
    iv: iv,
    fingerprint: fingerprint,
    createdAt: Date.now(),
    expiresAt: Date.now() + (5 * 60 * 1000)
  });
  
  // Cleanup expired sessions
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

// Export sessionKeys agar bisa diakses dari file API lain
export { sessionKeys };