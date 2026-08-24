export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Fingerprint');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const PUBLIC_KEY = process.env.RSA_PUBLIC_KEY;
  
  if (!PUBLIC_KEY) {
    return res.status(500).json({ error: 'RSA Public Key not configured' });
  }
  
  const cleanPublicKey = PUBLIC_KEY.replace(/\\n/g, '\n');
  
  return res.status(200).json({
    publicKey: cleanPublicKey
  });
}