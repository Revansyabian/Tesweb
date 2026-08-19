import CryptoJS from 'crypto-js';
import admin from 'firebase-admin';
import bcrypt from 'bcryptjs';

const ADMIN_KEY = process.env.ADMIN_KEY;
if (!ADMIN_KEY) {
    throw new Error('ADMIN_KEY is required!');
}

const API_SECRET = process.env.API_SECRET || '1417-1426-1527-1517';
const RECAPTCHA_V2_SECRET_KEY = process.env.RECAPTCHA_V2_SECRET_KEY || '';
const SALT_ROUNDS = 12;
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 60000;

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
        .replace(/on\w+=/gi, '');
}

async function hashPassword(password) {
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    return await bcrypt.hash(password, salt);
}

async function checkRateLimit(ip) {
    const key = ip.replace(/\./g, '_');
    const ref = db.ref('rate_limits_register/' + key);
    const snap = await ref.once('value');
    const raw = snap.val();
    const now = Date.now();

    if (raw && raw.data) {
        try {
            const data = decryptData(raw.data);
            if (now - (data.timestamp || 0) < RATE_LIMIT_WINDOW) {
                if ((data.count || 0) >= RATE_LIMIT_MAX) return false;
                data.count = (data.count || 0) + 1;
                await ref.set({ data: encryptData(data) });
                return true;
            }
        } catch (e) {}
    }

    await ref.set({ data: encryptData({ count: 1, timestamp: now }) });
    return true;
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

function getClientIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        const ips = forwarded.split(',');
        return ips[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
}

// ==================== FUNGSI CEK MAINTENANCE & BLOCK ====================
async function isIPBlocked(ip) {
    if (!ip || ip === 'unknown' || ip === '::1' || ip === '127.0.0.1') return false;
    
    const keys = [
        ip.replace(/\./g, '_'),
        ip,
        ip.replace(/:/g, '_')
    ];
    
    for (const key of keys) {
        const snap = await db.ref('blocked_ips/' + key).once('value');
        const raw = snap.val();
        if (raw && raw.data) {
            try {
                const data = decryptData(raw.data);
                if (data && data.blocked === true) {
                    return true;
                }
            } catch (e) {}
        }
    }
    return false;
}

async function isFPBlocked(fp) {
    if (!fp) return false;
    const snap = await db.ref('blocked_fp/' + fp).once('value');
    const raw = snap.val();
    if (raw && raw.data) {
        try {
            const data = decryptData(raw.data);
            if (data && data.blocked === true) {
                return true;
            }
        } catch (e) {}
    }
    return false;
}

async function checkMaintenance() {
    try {
        const snap = await db.ref('maintenance_status').once('value');
        const raw = snap.val();
        if (raw && raw.data) {
            const data = decryptData(raw.data);
            if (data && data.maintenance === true) {
                return {
                    maintenance: true,
                    title: data.title || 'SEDANG PERBAIKAN SISTEM',
                    message: data.message || 'Website sedang dalam perbaikan oleh admin. Silakan kembali beberapa saat lagi.',
                    until: data.until || null
                };
            }
        }
        return null;
    } catch (e) {
        return null;
    }
}

// ==================== VALIDASI USERNAME ====================
function isValidUsername(username) {
    if (!username || typeof username !== 'string') {
        return { valid: false, message: 'Username tidak valid!' };
    }
    
    const trimmed = username.trim();
    if (trimmed.length < 3) {
        return { valid: false, message: 'Username minimal 3 karakter!' };
    }
    
    if (trimmed.length > 30) {
        return { valid: false, message: 'Username maksimal 30 karakter!' };
    }
    
    const usernameRegex = /^[a-zA-Z0-9_.]+$/;
    if (!usernameRegex.test(trimmed)) {
        return { valid: false, message: 'Username hanya boleh huruf, angka, underscore (_), dan titik (.)!' };
    }
    
    return { valid: true, username: trimmed };
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

    const ip = getClientIP(req);
    const fp = req.headers['x-fingerprint'] || '';

    if (!await checkRateLimit(ip)) {
        return res.status(429).json({ data: encryptResponse({ success: false, error: 'rate_limit', message: 'Terlalu banyak percobaan.' }) });
    }

    try {
        const body = req.body;
        if (!body || !body.data) {
            return res.status(400).json({ data: encryptResponse({ success: false, error: 'no_data', message: 'Data tidak ditemukan!' }) });
        }

        const decrypted = decryptPayload(body.data);
        if (!decrypted || !decrypted.action) {
            return res.status(403).json({ data: encryptResponse({ success: false, error: 'access_denied', message: 'Akses ditolak!' }) });
        }

        const action = decrypted.action;

        if (action === 'check_status') {
            const maintenance = await checkMaintenance();
            const ipBlocked = await isIPBlocked(ip);
            const fpBlocked = fp ? await isFPBlocked(fp) : false;

            if (ipBlocked || fpBlocked) {
                return res.status(200).json({
                    data: encryptResponse({
                        blocked: true,
                        maintenance: false,
                        message: 'Akses ditolak, jika ingin dibuka silakan hubungi admin.'
                    })
                });
            }

            if (maintenance) {
                return res.status(200).json({
                    data: encryptResponse({
                        blocked: false,
                        maintenance: true,
                        title: maintenance.title,
                        message: maintenance.message,
                        until: maintenance.until
                    })
                });
            }

            return res.status(200).json({
                data: encryptResponse({
                    blocked: false,
                    maintenance: false
                })
            });
        }

        if (action === 'register') {
            // ==================== CEK MAINTENANCE & BAN AKSES ====================
            // Ditambahkan supaya request register yang langsung nembak API ini
            // (skip frontend/tanpa lewat checkMaintenanceAndBlock di browser)
            // tetap ketolak kalau maintenance aktif atau IP/Fingerprint diban.
            // Urutan cek: ban akses DULU baru maintenance, jadi kalau dua-duanya
            // aktif bersamaan, ban akses yang menang (sama seperti action check_status).
            const ipBlockedRegister = await isIPBlocked(ip);
            const fpBlockedRegister = fp ? await isFPBlocked(fp) : false;

            if (ipBlockedRegister || fpBlockedRegister) {
                return res.status(200).json({
                    data: encryptResponse({
                        success: false,
                        error: 'access_denied',
                        message: 'Akses ditolak, jika ingin dibuka silakan hubungi admin.'
                    })
                });
            }

            const maintenanceRegister = await checkMaintenance();
            if (maintenanceRegister) {
                return res.status(200).json({
                    data: encryptResponse({
                        success: false,
                        error: 'maintenance',
                        message: maintenanceRegister.message
                    })
                });
            }

            // ==================== VALIDASI USERNAME ====================
            const rawUsername = decrypted.username || '';
            const usernameValidation = isValidUsername(rawUsername);
            
            if (!usernameValidation.valid) {
                return res.status(200).json({ 
                    data: encryptResponse({ 
                        success: false, 
                        error: 'invalid_username', 
                        message: usernameValidation.message 
                    }) 
                });
            }
            
            const username = usernameValidation.username;

            const password = decrypted.password || '';
            const confirmPassword = decrypted.confirmPassword || '';
            const phone = sanitizeInput(decrypted.phone || '');
            const email = sanitizeInput(decrypted.email || '');
            const paket = sanitizeInput(decrypted.paket || '');
            const harga = decrypted.harga || 0;
            const captchaToken = decrypted.captchaToken || '';
            const userIP = decrypted.ip || ip;
            const userFP = decrypted.fingerprint || fp;
            const sessionFingerprint = decrypted.sessionFingerprint || '';

            if (!password || password.length < 6) {
                return res.status(200).json({ data: encryptResponse({ success: false, error: 'weak_password', message: 'Password minimal 6 karakter!' }) });
            }

            if (password !== confirmPassword) {
                return res.status(200).json({ data: encryptResponse({ success: false, error: 'password_mismatch', message: 'Password tidak cocok!' }) });
            }

            if (!phone || phone.length < 10) {
                return res.status(200).json({ data: encryptResponse({ success: false, error: 'invalid_phone', message: 'Nomor telepon tidak valid!' }) });
            }

            if (!email || !email.includes('@')) {
                return res.status(200).json({ data: encryptResponse({ success: false, error: 'invalid_email', message: 'Email tidak valid!' }) });
            }

            if (!paket) {
                return res.status(200).json({ data: encryptResponse({ success: false, error: 'paket_not_selected', message: 'Pilih paket terlebih dahulu!' }) });
            }

            const captchaValid = await verifyRecaptcha(captchaToken);
            if (!captchaValid) {
                return res.status(200).json({ data: encryptResponse({ success: false, error: 'invalid_captcha', message: 'reCAPTCHA tidak valid!' }) });
            }

            const ipKey = 'register_ip_' + userIP.replace(/\./g, '_');
            const ipRef = db.ref('register_limits/' + ipKey);
            const ipSnap = await ipRef.once('value');
            const ipRaw = ipSnap.val();

            if (ipRaw && ipRaw.data) {
                try {
                    const ipData = decryptData(ipRaw.data);
                    if (Date.now() - (ipData.lastRegister || 0) < 86400000) {
                        return res.status(200).json({ data: encryptResponse({ success: false, error: 'ip_limit', message: 'IP sudah mendaftar hari ini.' }) });
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
                            return res.status(200).json({ data: encryptResponse({ success: false, error: 'fp_limit', message: 'Perangkat sudah mendaftar hari ini.' }) });
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
                        return res.status(200).json({ data: encryptResponse({ success: false, error: 'username_exists', message: 'Username sudah terdaftar!' }) });
                    }
                    if (userData && email && userData.email === email) {
                        return res.status(200).json({ data: encryptResponse({ success: false, error: 'email_exists', message: 'Email sudah terdaftar!' }) });
                    }
                }
            }

            const hashedPassword = await hashPassword(password);
            if (!hashedPassword) {
                return res.status(200).json({ data: encryptResponse({ success: false, error: 'server_error', message: 'Gagal memproses password.' }) });
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
                sessionFingerprint: sessionFingerprint,
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

            return res.status(200).json({ data: encryptResponse({ success: true, message: 'Pendaftaran berhasil! Tunggu aktivasi admin.' }) });
        }

        return res.status(400).json({ data: encryptResponse({ success: false, error: 'invalid_action', message: 'Aksi tidak valid!' }) });
    } catch (error) {
        console.error('Register error:', error);
        return res.status(500).json({ data: encryptResponse({ success: false, error: 'server_error', message: 'Terjadi kesalahan pada server.' }) });
    }
}
