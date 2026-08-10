var API_REVANSTORE = '/api/revanstoreV2';
var API_RVNSTORE = '/api/rvnstore';
var ADMIN_KEY = 'dhagwxwhu:f4afc5aa03e73130f5e055dfe6a708c4dc40759b';
var WHATSAPP_NUMBER = "6285199120995";
var MAX_PASSWORD_LENGTH = 20;

var currentUser = null;
var currentAccount = null;
var currentAuthToken = null;
var fingerprint = '';
var isBlocked = false;
var blockedChecked = false;
var loginInProgress = false;

var STORAGE_KEY = 'bussid_data';
var STORAGE_SECRET = ADMIN_KEY;

function storageSet(key, value) {
    try {
        var allData = storageGetAll();
        allData[key] = value;
        var encrypted = CryptoJS.AES.encrypt(JSON.stringify(allData), STORAGE_SECRET).toString();
        localStorage.setItem(STORAGE_KEY, encrypted);
    } catch (e) {}
}

function storageGet(key) {
    var allData = storageGetAll();
    return allData[key] !== undefined ? allData[key] : null;
}

function storageRemove(key) {
    var allData = storageGetAll();
    delete allData[key];
    var encrypted = CryptoJS.AES.encrypt(JSON.stringify(allData), STORAGE_SECRET).toString();
    localStorage.setItem(STORAGE_KEY, encrypted);
}

function storageGetAll() {
    try {
        var encrypted = localStorage.getItem(STORAGE_KEY);
        if (!encrypted) return {};
        var decrypted = CryptoJS.AES.decrypt(encrypted, STORAGE_SECRET).toString(CryptoJS.enc.Utf8);
        return JSON.parse(decrypted) || {};
    } catch (e) { return {}; }
}

function getBlockKey(username) { return 'bussid_block_' + (username || 'global'); }

function getBlockData(username) {
    var data = storageGet(getBlockKey(username));
    if (data) {
        try {
            if (data.blockedUntil && Date.now() > data.blockedUntil) {
                storageRemove(getBlockKey(username));
                return { attempts: 0, blockedUntil: null, level: 0 };
            }
            return data;
        } catch (e) { return { attempts: 0, blockedUntil: null, level: 0 }; }
    }
    return { attempts: 0, blockedUntil: null, level: 0 };
}

function saveBlockData(username, data) { storageSet(getBlockKey(username), data); }

function sanitize(str) { if (!str) return ''; return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;'); }

async function getFingerprint() {
    var fp = '';
    fp += navigator.userAgent || ''; fp += navigator.language || '';
    fp += (screen.width || 0) + 'x' + (screen.height || 0); fp += screen.colorDepth || '';
    fp += new Date().getTimezoneOffset(); fp += navigator.hardwareConcurrency || '';
    fp += navigator.deviceMemory || ''; fp += navigator.platform || '';
    return CryptoJS.MD5(fp).toString();
}

function getBlockDuration(attempts) { if (attempts >= 15) return 1440; if (attempts >= 10) return 60; if (attempts >= 5) return 15; return 0; }

async function checkIfBlocked() {
    if (blockedChecked) return isBlocked;
    if (!fingerprint) fingerprint = await getFingerprint();
    try {
        var result = await callRevanstore('check_blocked', 'POST', { fingerprint: fingerprint });
        if (result && result.blocked) { isBlocked = true; storageSet('bussid_blocked', 'true'); }
        else { isBlocked = false; storageRemove('bussid_blocked'); }
        blockedChecked = true;
    } catch (e) { isBlocked = storageGet('bussid_blocked') === 'true'; blockedChecked = true; }
    return isBlocked;
}

async function callRevanstore(path, method, data) {
    if (!fingerprint) fingerprint = await getFingerprint();
    if (isBlocked && path !== 'check_blocked') throw new Error('Akses ditolak');
    var payload = { path: path, method: method || 'GET', data: data || null, timestamp: Date.now() };
    var encryptedPayload = CryptoJS.AES.encrypt(JSON.stringify(payload), ADMIN_KEY).toString();
    var headers = { 'Content-Type': 'application/json', 'X-Fingerprint': fingerprint };
    if (currentUser && currentUser.username) headers['X-Operator'] = CryptoJS.AES.encrypt(currentUser.username, ADMIN_KEY).toString();
    var res = await fetch(API_REVANSTORE, { method: 'POST', headers: headers, body: JSON.stringify({ data: encryptedPayload }) });
    if (res.status === 429) throw new Error('Terlalu banyak request');
    var text = await res.text(); if (!text || text === 'null') return null;
    var result = JSON.parse(text);
    if (result.encrypted && result.data) { var dec = CryptoJS.AES.decrypt(result.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8); if (dec) return JSON.parse(dec); }
    return result;
}

function showLoading(message) {
    var overlay = document.getElementById('loadingOverlay');
    var msg = document.getElementById('loadingMessage');
    if (overlay && msg) { msg.textContent = message || 'Memproses...'; overlay.style.display = 'flex'; }
}

function hideLoading() {
    var overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'none';
}

function updatePasswordCounter() {
    var input = document.getElementById('password');
    var counter = document.getElementById('passwordCharCount');
    if (input && counter) counter.textContent = input.value.length + '/' + MAX_PASSWORD_LENGTH;
}

function onCaptchaVerified(token) {
    document.getElementById('btnLogin').disabled = false;
}

function onCaptchaExpired() {
    document.getElementById('btnLogin').disabled = true;
    grecaptcha.reset();
}

function showBlockedScreen() {
    document.body.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#f0f9ff,#bae6fd,#7dd3fc);padding:20px;font-family:\'Segoe UI\',sans-serif;"><div style="background:#fff;border-radius:20px;padding:40px 30px;max-width:420px;width:100%;text-align:center;box-shadow:0 25px 60px rgba(0,0,0,0.1);"><div style="font-size:70px;color:#ef4444;margin-bottom:20px;">🔒</div><h1 style="color:#0c4a6e;font-size:24px;margin-bottom:10px;">AKSES DITOLAK</h1><p style="color:#64748b;font-size:14px;">Maaf, akses Anda telah diblokir.</p></div></div>';
}

function showBannedPopup(until) {
    var untilText = (until || 0) === 0 ? 'PERMANEN' : ('sampai ' + new Date(until).toLocaleString('id-ID'));
    Swal.fire({
        icon: 'error', title: 'AKUN DIBANNED',
        html: '<p>Maaf, akun Anda telah dibanned oleh admin.</p><p style="color:#dc2626;background:#fee2e2;padding:8px;border-radius:8px;"><b>Durasi: ' + untilText + '</b></p>',
        confirmButtonText: '<i class="fab fa-whatsapp"></i> Hubungi Admin', confirmButtonColor: '#25D366',
        showCancelButton: true, cancelButtonText: 'Tutup', cancelButtonColor: '#64748b', allowOutsideClick: false
    }).then(function(r) { if (r.isConfirmed) window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=Assalamualaikum%20admin%2C%20akun%20saya%20dibanned', '_blank'); });
}

function showBanAksesPage(until) {
    var untilText = (until || 0) === 0 ? 'PERMANEN' : ('sampai ' + new Date(until).toLocaleString('id-ID'));
    document.body.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#f0f9ff 0%,#bae6fd 50%,#7dd3fc 100%);padding:20px;font-family:\'Segoe UI\',sans-serif;">' +
        '<div style="background:#ffffff;border-radius:24px;padding:48px 36px;width:100%;max-width:420px;text-align:center;box-shadow:0 20px 60px rgba(0,191,255,0.15);border:1px solid rgba(0,191,255,0.1);">' +
        '<div style="font-size:72px;color:#f59e0b;margin-bottom:12px;">🚫</div>' +
        '<h2 style="font-size:24px;font-weight:700;color:#0c4a6e;margin-bottom:8px;">AKSES DIBLOKIR</h2>' +
        '<p style="font-size:14px;color:#64748b;margin-bottom:6px;">Maaf, akses Anda diblokir oleh admin.</p>' +
        '<div style="background:#fef3c7;color:#92400e;padding:12px 16px;border-radius:12px;font-weight:600;font-size:14px;margin:16px 0 24px;">⏱️ Durasi: ' + untilText + '</div>' +
        '<button onclick="window.open(\'https://wa.me/' + WHATSAPP_NUMBER + '?text=Assalamualaikum%20admin%2C%20akses%20saya%20diblokir\',\'_blank\')" style="display:inline-flex;align-items:center;gap:10px;padding:12px 32px;background:#25D366;color:#fff;border:none;border-radius:30px;font-weight:600;font-size:15px;cursor:pointer;transition:0.2s;font-family:\'Segoe UI\',sans-serif;">' +
        '<i class="fab fa-whatsapp"></i> Hubungi Admin</button></div></div>';
}

function showForceLogoutPopup() {
    Swal.fire({
        icon: 'warning', title: 'AKUN DITANGGUHKAN',
        html: '<p>Akun Anda ditangguhkan karena indikasi sharing akun.</p><p style="font-size:12px;color:#92400e;">Silakan hubungi admin.</p>',
        confirmButtonText: '<i class="fab fa-whatsapp"></i> Hubungi Admin', confirmButtonColor: '#25D366',
        showCancelButton: true, cancelButtonText: 'Tutup', cancelButtonColor: '#64748b', allowOutsideClick: false
    }).then(function(r) { if (r.isConfirmed) window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=Assalamualaikum%20admin%2C%20akun%20saya%20ditangguhkan', '_blank'); });
}

async function login() {
    if (loginInProgress) return;
    loginInProgress = true;
    try {
        var blocked = await checkIfBlocked();
        if (blocked) { showBlockedScreen(); return; }
        var username = sanitize(document.getElementById('username').value.trim());
        var password = document.getElementById('password').value.trim();
        if (!username || !password) { Swal.fire({ icon: "warning", title: "Oops...", text: "Harap isi username dan password!", confirmButtonColor: "#0ea5e9" }); loginInProgress = false; return; }
        var blockData = getBlockData(username);
        if (blockData.blockedUntil && Date.now() < blockData.blockedUntil) { Swal.fire({ icon: "error", title: "Akses Ditolak", text: "🔒 Terlalu banyak percobaan!", confirmButtonColor: "#ef4444" }); loginInProgress = false; return; }

        var captchaResponse = grecaptcha.getResponse();
        if (!captchaResponse || captchaResponse.length === 0) {
            Swal.fire({ icon: "warning", title: "Oops...", text: "Centang \"I'm not a robot\" dulu ya!", confirmButtonColor: "#0ea5e9" });
            loginInProgress = false;
            return;
        }

        showLoading('Login...');
        var userIP = 'unknown';
        try { var ipRes = await fetch('https://api.ipify.org?format=json'); var ipData = await ipRes.json(); userIP = ipData.ip || 'unknown'; } catch (e) {}
        if (!fingerprint) fingerprint = await getFingerprint();
        var result = await callRevanstore('login', 'POST', { username: username, password: password, ip: userIP, fingerprint: fingerprint, captchaToken: captchaResponse });
        if (result && result.blocked) { isBlocked = true; storageSet('bussid_blocked', 'true'); hideLoading(); showBlockedScreen(); loginInProgress = false; return; }
        if (result && result.banned) { hideLoading(); showBannedPopup(result.bannedUntil || 0); loginInProgress = false; return; }
        if (result && result.banAkses) { hideLoading(); showBanAksesPage(result.banAksesUntil || 0); loginInProgress = false; return; }
        if (result && result.forceLogout) { hideLoading(); showForceLogoutPopup(); loginInProgress = false; return; }
        if (result && result.success) {
            storageRemove(getBlockKey(username));
            var user = result.data;
            currentUser = { id: user.id, username: user.username, password: password, role: user.role || 'Operator', full_name: user.full_name || user.username, expiry_date: user.expiry_date || '' };
            hideLoading();
            storageSet('bussid_session', JSON.stringify({ username: username, password: password, user_id: user.id, timestamp: Date.now() }));
            Swal.fire({ icon: "success", title: "Login Berhasil!", text: "Selamat datang, " + currentUser.full_name + "!", timer: 1500, showConfirmButton: false }).then(function() {
                window.location.href = 'dashboard.html';
            });
        } else {
            await callRevanstore('login_failed', 'POST', {});
            blockData.attempts += 1; var d = getBlockDuration(blockData.attempts);
            hideLoading();
            grecaptcha.reset();
            document.getElementById('btnLogin').disabled = true;
            if (d > 0) { blockData.blockedUntil = Date.now() + d * 60 * 1000; saveBlockData(username, blockData); Swal.fire({ icon: "error", title: "Akses Ditolak", text: "🔒 Terlalu banyak percobaan!", confirmButtonColor: "#ef4444" }); }
            else { saveBlockData(username, blockData); Swal.fire({ icon: "error", title: "Oops...", text: "User tidak ditemukan atau password salah!", confirmButtonColor: "#ef4444" }); }
        }
    } catch (error) {
        hideLoading();
        try { grecaptcha.reset(); document.getElementById('btnLogin').disabled = true; } catch (e) {}
        Swal.fire({ icon: "error", title: "Oops...", text: "Gagal menghubungkan ke server!", confirmButtonColor: "#ef4444" });
    }
    loginInProgress = false;
}

document.addEventListener('DOMContentLoaded', async function() {
    if (!fingerprint) fingerprint = await getFingerprint();
    var blocked = await checkIfBlocked();
    if (blocked) { showBlockedScreen(); return; }

    updatePasswordCounter();
    document.getElementById('password').addEventListener('input', updatePasswordCounter);

    document.getElementById('username').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') document.getElementById('password').focus();
    });
    document.getElementById('password').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') login();
    });

    var saved = storageGet('bussid_session');
    if (saved) {
        try {
            var session = JSON.parse(saved), age = Date.now() - (session.timestamp || 0);
            if (age > 7 * 24 * 60 * 60 * 1000) { storageRemove('bussid_session'); return; }
            document.getElementById('username').value = session.username;
            document.getElementById('password').value = session.password;
        } catch (e) { storageRemove('bussid_session'); }
    }
});