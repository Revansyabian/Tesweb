import crypto from 'crypto';

const PUBLIC_KEY = process.env.RSA_PUBLIC_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Fingerprint');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  if (!PUBLIC_KEY) {
    return res.status(500).json({ error: 'Public key not configured' });
  }
  
  return res.status(200).json({
    publicKey: PUBLIC_KEY.replace(/\\n/g, '\n')
  });
}