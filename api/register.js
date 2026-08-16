import CryptoJS from 'crypto-js';
import admin from 'firebase-admin';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const ADMIN_KEY = process.env.ADMIN_KEY;
if (!ADMIN_KEY) {
    throw new Error('ADMIN_KEY is required!');
}

const API_SECRET = process.env.API_SECRET || '1417-1426-1527-1517';
const RECAPTCHA_V2_SECRET_KEY = process.env.RECAPTCHA_V2_SECRET_KEY || '';
const SALT_ROUNDS = 12;

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

function encryptResponse(data) {
    return CryptoJS.AES.encrypt(JSON.stringify(data), API_SECRET).toString();
}

function encryptData(data) {
    return CryptoJS.AES.encrypt(JSON.stringify(data), ADMIN_KEY).toString();
}

function decryptPayload(raw) {
    if (!raw) return null;
    try {
        const dec = CryptoJS.AES.decrypt(raw, API_SECRET).toString(CryptoJS.enc.Utf8);
        if (!dec) return null;
        return JSON.parse(dec);
    } catch (e) {
        return null;
    }
}

function decryptData(raw) {
    if (!raw) return raw;
    try {
        if (typeof raw === 'string') {
            const dec = CryptoJS.AES.decrypt(raw, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
            if (!dec) return raw;
            return JSON.parse(dec);
        }
        if (raw.data) {
            const dec = CryptoJS.AES.decrypt(raw.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
            if (!dec) return raw;
            return JSON.parse(dec);
        }
        return raw;
    } catch (e) { return raw; }
}

function sanitizeInput(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/`/g, '&#96;')
        .replace(/=/g, '&#61;')
        .replace(/javascript:/gi, '')
        .replace(/on\w+=/gi, '')
        .replace(/<script/gi, '')
        .replace(/<\/script/gi, '')
        .replace(/<img/gi, '')
        .replace(/<svg/gi, '')
        .replace(/<iframe/gi, '');
}

async function hashPassword(password) {
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    return await bcrypt.hash(password, salt);
}

async function verifyRecaptcha(token) {
    if (!token || !RECAPTCHA_V2_SECRET_KEY) return false;
    
    try {
        const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `secret=${RECAPTCHA_V2_SECRET_KEY}&response=${token}`
        });
        const data = await res.json();
        return data.success === true;
    } catch (e) {
        return false;
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Fingerprint');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const fp = req.headers['x-fingerprint'] || '';

    try {
        const body = req.body;
        if (!body || !body.data) {
            return res.status(400).json({ data: encryptResponse({ success: false, error: 'no_data' }) });
        }

        const decrypted = decryptPayload(body.data);
        if (!decrypted || !decrypted.action) {
            return res.status(403).json({ data: encryptResponse({ success: false, error: 'access_denied' }) });
        }

        const action = decrypted.action;

        // ==================== GENERATE TOKEN ====================
        if (action === 'generate_token') {
            try {
                const userIP = decrypted.ip || ip;
                const userFP = decrypted.fingerprint || fp;

                const token = crypto.randomBytes(32).toString('hex');
                const expiry = Date.now() + (15 * 60 * 1000);

                const tokenData = {
                    token: token,
                    ip: userIP,
                    fingerprint: userFP,
                    createdAt: Date.now(),
                    expiry: expiry,
                    used: false
                };

                await db.ref('register_tokens/' + token).set({ data: encryptData(tokenData) });

                return res.status(200).json({ data: encryptResponse({ success: true, token: token, expiry: expiry }) });
            } catch (e) {
                console.error('Generate token error:', e);
                return res.status(500).json({ data: encryptResponse({ success: false, error: 'server_error' }) });
            }
        }

        // ==================== REGISTER ====================
        if (action === 'register') {
            const username = sanitizeInput(decrypted.username || '');
            const password = decrypted.password || '';
            const phone = sanitizeInput(decrypted.phone || '');
            const email = sanitizeInput(decrypted.email || '');
            const paket = sanitizeInput(decrypted.paket || '');
            const harga = decrypted.harga || 0;
            const captchaToken = decrypted.captchaToken || '';
            const userIP = decrypted.ip || ip;
            const userFP = decrypted.fingerprint || fp;
            const registerToken = sanitizeInput(decrypted.registerToken || '');

            if (!registerToken) {
                return res.status(200).json({ data: encryptResponse({ success: false, error: 'token_required' }) });
            }

            const tokenSnap = await db.ref('register_tokens/' + registerToken).once('value');
            const tokenRaw = tokenSnap.val();

            if (!tokenRaw || !tokenRaw.data) {
                return res.status(200).json({ data: encryptResponse({ success: false, error: 'token_invalid' }) });
            }

            const tokenData = decryptData(tokenRaw.data);

            if (!tokenData || !tokenData.token) {
                return res.status(200).json({ data: encryptResponse({ success: false, error: 'token_invalid' }) });
            }

            if (tokenData.used === true) {
                return res.status(200).json({ data: encryptResponse({ success: false, error: 'token_used' }) });
            }

            if (tokenData.expiry && Date.now() > tokenData.expiry) {
                return res.status(200).json({ data: encryptResponse({ success: false, error: 'token_expired' }) });
            }

            const captchaValid = await verifyRecaptcha(captchaToken);
            if (!captchaValid) {
                return res.status(200).json({ data: encryptResponse({ success: false, error: 'invalid_captcha' }) });
            }

            const ipKey = 'register_ip_' + userIP.replace(/\./g, '_');
            const ipRef = db.ref('register_limits/' + ipKey);
            const ipSnap = await ipRef.once('value');
            const ipRaw = ipSnap.val();
            
            if (ipRaw && ipRaw.data) {
                try {
                    const ipData = decryptData(ipRaw.data);
                    if (Date.now() - (ipData.lastRegister || 0) < 86400000) {
                        return res.status(200).json({ data: encryptResponse({ success: false, error: 'ip_limit' }) });
                    }
                } catch (e) {}
            }
            
            if (userFP) {
                const fpKey = 'register_fp_' + userFP;
                const fpRef = db.ref('register_limits/' + fpKey);
                const fpSnap = await fpRef.once('value');
                const fpRaw = fpSnap.val();
                
                if (fpRaw && fpRaw.data) {
                    try {
                        const fpData = decryptData(fpRaw.data);
                        if (Date.now() - (fpData.lastRegister || 0) < 86400000) {
                            return res.status(200).json({ data: encryptResponse({ success: false, error: 'fp_limit' }) });
                        }
                    } catch (e) {}
                }
            }

            const usersSnap = await db.ref('users').once('value');
            const users = usersSnap.val();
            
            if (users) {
                for (const key in users) {
                    const userData = decryptData(users[key].data);
                    if (userData && userData.username === username) {
                        return res.status(200).json({ data: encryptResponse({ success: false, error: 'username_exists' }) });
                    }
                    if (userData && email && userData.email === email) {
                        return res.status(200).json({ data: encryptResponse({ success: false, error: 'email_exists' }) });
                    }
                }
            }

            const hashedPassword = await hashPassword(password);
            if (!hashedPassword) {
                return res.status(200).json({ data: encryptResponse({ success: false, error: 'server_error' }) });
            }

            const registerData = {
                username: username,
                password_hash: hashedPassword,
                phone: phone,
                email: email,
                paket: paket,
                harga: harga,
                ip: userIP,
                fingerprint: userFP,
                status: 'pending',
                isActive: false,
                needsActivation: true,
                activationStatus: 'pending',
                role: 'User',
                banned: false,
                banAkses: false,
                forceLogout: false,
                expiry_date: '',
                createdAt: Date.now()
            };

            const enc = encryptData(registerData);
            const newRef = db.ref('users').push();
            await newRef.set({ data: enc });

            await ipRef.set({ data: encryptData({ lastRegister: Date.now() }) });
            if (userFP) {
                await db.ref('register_limits/register_fp_' + userFP).set({ data: encryptData({ lastRegister: Date.now() }) });
            }

            await db.ref('register_tokens/' + registerToken).update({ data: encryptData({ ...tokenData, used: true, usedAt: Date.now(), usedBy: username }) });

            return res.status(200).json({ data: encryptResponse({ success: true, message: 'Pendaftaran berhasil!' }) });
        }

        return res.status(400).json({ data: encryptResponse({ success: false, error: 'invalid_action' }) });
    } catch (error) {
        console.error('Register error:', error);
        return res.status(500).json({ data: encryptResponse({ success: false, error: 'server_error' }) });
    }
}