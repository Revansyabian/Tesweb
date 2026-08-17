var API_REVANSTORE = '/api/revanstoreV2';
var API_RESET = '/api/reset-pw';
var WHATSAPP_NUMBER = "6285199120995";
var MAX_PASSWORD_LENGTH = 20;
var API_SECRET = '1417-1426-1527-1517';

var currentUser = null;
var currentAccount = null;
var currentAuthToken = null;
var pendingAction = null;
var pendingData = null;
var lastDeviceId = null;
var fingerprint = '';
var alertTimeout = null;
var isBlocked = false;
var blockedChecked = false;
var loginInProgress = false;
var resetInProgress = false;
var registerInProgress = false;
var selectedPaket = '';
var selectedHarga = 0;
var sessionFingerprint = CryptoJS.MD5(Date.now() + Math.random() + navigator.userAgent).toString();
var FORBIDDEN_USERNAMES = ['admin', 'administrator', 'root', 'system', 'owner', 'moderator', 'staff', 'support', 'ceo', 'boss'];
var THROWAWAY_DOMAINS = ['mailinator.com', 'tempmail.com', 'guerrillamail.com', '10minutemail.com', 'yopmail.com', 'tempmail.net', 'dispostable.com'];
var COMMON_PASSWORDS = ['password', 'password123', '12345678', 'qwerty123', 'admin123', 'bismillah', 'sayang', 'cinta'];
var KEYBOARD_PATTERNS = ['asdf', 'qwer', 'zxcv', 'tyui', 'ghjk', 'bnm', 'poiuy', 'lkjh', 'mnbv'];
var SEQUENTIAL_PATTERNS = ['123456', '654321', 'abcdef', 'qwerty', '111111', '222222', '333333'];
var resetCaptchaDone = false;
var registerCaptchaDone = false;

var STORAGE_KEY = 'app_data';
var STORAGE_SECRET = 'session_local_secret';

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
    } catch (e) {
        return {};
    }
}

function getBlockKey(username) {
    return 'blok_' + (username || 'global');
}

function getBlockData(username) {
    var data = storageGet(getBlockKey(username));
    if (data) {
        try {
            if (data.blockedUntil && Date.now() > data.blockedUntil) {
                storageRemove(getBlockKey(username));
                return { attempts: 0, blockedUntil: null, level: 0 };
            }
            return data;
        } catch (e) {
            return { attempts: 0, blockedUntil: null, level: 0 };
        }
    }
    return { attempts: 0, blockedUntil: null, level: 0 };
}

function saveBlockData(username, data) {
    storageSet(getBlockKey(username), data);
}

function sanitize(str) {
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
        .replace(/<\/script/gi, '');
}

async function getFingerprint() {
    var fp = '';
    fp += navigator.userAgent || '';
    fp += navigator.language || '';
    fp += (screen.width || 0) + 'x' + (screen.height || 0);
    fp += screen.colorDepth || '';
    fp += new Date().getTimezoneOffset();
    fp += navigator.hardwareConcurrency || '';
    fp += navigator.deviceMemory || '';
    fp += navigator.platform || '';
    return CryptoJS.MD5(fp).toString();
}

function getBlockDuration(attempts) {
    if (attempts >= 15) return 1440;
    if (attempts >= 10) return 60;
    if (attempts >= 5) return 15;
    return 0;
}

async function checkIfBlocked() {
    if (blockedChecked) return isBlocked;
    if (!fingerprint) fingerprint = await getFingerprint();
    try {
        var payload = {
            path: 'check_blocked',
            method: 'POST',
            data: { fingerprint: fingerprint },
            timestamp: Date.now()
        };
        var encryptedPayload = CryptoJS.AES.encrypt(JSON.stringify(payload), API_SECRET).toString();
        var res = await fetch(API_REVANSTORE, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Fingerprint': fingerprint
            },
            body: JSON.stringify({ data: encryptedPayload })
        });
        var result = await res.json();
        if (result.encrypted && result.data) {
            var dec = CryptoJS.AES.decrypt(result.data, API_SECRET).toString(CryptoJS.enc.Utf8);
            if (dec) result = JSON.parse(dec);
        }
        if (result && result.blocked) {
            isBlocked = true;
            storageSet('perangkat_diblokir', 'true');
        } else {
            isBlocked = false;
            storageRemove('perangkat_diblokir');
        }
        blockedChecked = true;
    } catch (e) {
        isBlocked = storageGet('perangkat_diblokir') === 'true';
        blockedChecked = true;
    }
    return isBlocked;
}

async function periksaMaintenance() {
    try {
        var payload = {
            path: 'maintenance_status',
            method: 'GET',
            data: null,
            timestamp: Date.now()
        };
        var encryptedPayload = CryptoJS.AES.encrypt(JSON.stringify(payload), API_SECRET).toString();
        var res = await fetch(API_REVANSTORE, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Fingerprint': fingerprint || 'check'
            },
            body: JSON.stringify({ data: encryptedPayload })
        });
        var result = await res.json();
        if (result.encrypted && result.data) {
            var dec = CryptoJS.AES.decrypt(result.data, API_SECRET).toString(CryptoJS.enc.Utf8);
            if (dec) result = JSON.parse(dec);
        }
        if (result && (result.maintenance === true || result.title || result.message)) {
            return result;
        }
        return null;
    } catch (e) {
        return null;
    }
}

function tampilkanHalamanMaintenance(dataMaintenance) {
    var judul = sanitize((dataMaintenance && (dataMaintenance.title || dataMaintenance.judul)) ? (dataMaintenance.title || dataMaintenance.judul) : 'SEDANG PERBAIKAN SISTEM');
    var pesan = sanitize((dataMaintenance && (dataMaintenance.message || dataMaintenance.pesan)) ? (dataMaintenance.message || dataMaintenance.pesan) : 'Website sedang dalam perbaikan oleh admin. Silakan kembali beberapa saat lagi.');
    var sampai = (dataMaintenance && (dataMaintenance.until || dataMaintenance.sampai)) ? (dataMaintenance.until || dataMaintenance.sampai) : null;
    var teksEstimasi = sanitize(sampai ? 'Estimasi selesai: ' + new Date(sampai).toLocaleString('id-ID') : 'Mohon maaf atas ketidaknyamanan ini.');

    document.body.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#e0f2fe 0%,#bae6fd 50%,#7dd3fc 100%);padding:20px;font-family:\'Segoe UI\',sans-serif;">' +
        '<div style="background:#ffffff;border-radius:24px;padding:48px 36px;width:100%;max-width:440px;text-align:center;box-shadow:0 25px 60px rgba(0,0,0,0.1);">' +
        '<div style="width:90px;height:90px;background:#fef3c7;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">' +
        '<i class="fas fa-tools" style="font-size:40px;color:#f59e0b;"></i>' +
        '</div>' +
        '<h1 style="color:#0c4a6e;font-size:24px;font-weight:700;margin-bottom:8px;">' + judul + '</h1>' +
        '<p style="color:#64748b;font-size:14px;margin-bottom:6px;line-height:1.6;">' + pesan + '</p>' +
        '<div style="background:#fef3c7;color:#92400e;padding:12px 16px;border-radius:12px;font-weight:600;font-size:13px;margin:16px 0 24px;">' + teksEstimasi + '</div>' +
        '<button onclick="window.open(\'https://wa.me/' + WHATSAPP_NUMBER + '?text=Assalamualaikum%20admin%2C%20info%20perbaikan\',\'_blank\')" style="display:inline-flex;align-items:center;gap:10px;padding:12px 32px;background:#25D366;color:#fff;border:none;border-radius:30px;font-weight:600;font-size:15px;cursor:pointer;transition:0.2s;font-family:\'Segoe UI\',sans-serif;">' +
        '<i class="fab fa-whatsapp"></i> Hubungi Admin</button></div></div>';
}

function tampilkanHalamanBlokir() {
    document.body.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#f0f9ff,#bae6fd,#7dd3fc);padding:20px;font-family:\'Segoe UI\',sans-serif;"><div style="background:#fff;border-radius:20px;padding:40px 30px;max-width:420px;width:100%;text-align:center;box-shadow:0 25px 60px rgba(0,0,0,0.1);"><div style="font-size:70px;color:#ef4444;margin-bottom:20px;">🔒</div><h1 style="color:#0c4a6e;font-size:24px;margin-bottom:10px;">AKSES DITOLAK</h1><p style="color:#64748b;font-size:14px;">Maaf, akses Anda telah ditolak.</p></div></div>';
}

function tampilkanPopupBanned(until) {
    var untilText = sanitize((until || 0) === 0 ? 'PERMANEN' : ('sampai ' + new Date(until).toLocaleString('id-ID')));
    Swal.fire({
        icon: 'error',
        title: 'AKUN DIBANNED',
        html: '<p>Maaf, akun Anda telah dibanned oleh admin.</p><p style="color:#dc2626;background:#fee2e2;padding:8px;border-radius:8px;"><b>Durasi: ' + untilText + '</b></p>',
        confirmButtonText: '<i class="fab fa-whatsapp"></i> Hubungi Admin',
        confirmButtonColor: '#25D366',
        showCancelButton: true,
        cancelButtonText: 'Tutup',
        cancelButtonColor: '#64748b',
        allowOutsideClick: false
    }).then(function(r) {
        if (r.isConfirmed) window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=Assalamualaikum%20admin%2C%20akun%20saya%20dibanned', '_blank');
    });
}

function tampilkanHalamanBanAkses(until) {
    var untilText = sanitize((until || 0) === 0 ? 'PERMANEN' : ('sampai ' + new Date(until).toLocaleString('id-ID')));
    document.body.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#f0f9ff 0%,#bae6fd 50%,#7dd3fc 100%);padding:20px;font-family:\'Segoe UI\',sans-serif;">' +
        '<div style="background:#ffffff;border-radius:24px;padding:48px 36px;width:100%;max-width:420px;text-align:center;box-shadow:0 20px 60px rgba(0,191,255,0.15);border:1px solid rgba(0,191,255,0.1);">' +
        '<div style="font-size:72px;color:#f59e0b;margin-bottom:12px;">🚫</div>' +
        '<h2 style="font-size:24px;font-weight:700;color:#0c4a6e;margin-bottom:8px;">AKSES DIBLOKIR</h2>' +
        '<p style="font-size:14px;color:#64748b;margin-bottom:6px;">Maaf, akses Anda diblokir oleh admin.</p>' +
        '<div style="background:#fef3c7;color:#92400e;padding:12px 16px;border-radius:12px;font-weight:600;font-size:14px;margin:16px 0 24px;">Durasi: ' + untilText + '</div>' +
        '<button onclick="window.open(\'https://wa.me/' + WHATSAPP_NUMBER + '?text=Assalamualaikum%20admin%2C%20akses%20saya%20diblokir\',\'_blank\')" style="display:inline-flex;align-items:center;gap:10px;padding:12px 32px;background:#25D366;color:#fff;border:none;border-radius:30px;font-weight:600;font-size:15px;cursor:pointer;transition:0.2s;font-family:\'Segoe UI\',sans-serif;">' +
        '<i class="fab fa-whatsapp"></i> Hubungi Admin</button></div></div>';
}

function tampilkanPopupDitangguhkan() {
    Swal.fire({
        icon: 'warning',
        title: 'AKUN DITANGGUHKAN',
        html: '<p>Akun Anda ditangguhkan karena indikasi aktivitas mencurigakan.</p><p style="font-size:12px;color:#92400e;">Silakan hubungi admin.</p>',
        confirmButtonText: '<i class="fab fa-whatsapp"></i> Hubungi Admin',
        confirmButtonColor: '#25D366',
        showCancelButton: true,
        cancelButtonText: 'Tutup',
        cancelButtonColor: '#64748b',
        allowOutsideClick: false
    }).then(function(r) {
        if (r.isConfirmed) window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=Assalamualaikum%20admin%2C%20akun%20saya%20ditangguhkan', '_blank');
    });
}

function tampilkanPopupBelumAktif() {
    Swal.fire({
        icon: 'warning',
        title: 'AKUN BELUM AKTIF',
        html: '<p>Akun Anda belum diaktivasi oleh admin.</p><p style="color:#0ea5e9;background:#E6F9FF;padding:8px;border-radius:8px;"><b>Silakan aktivasi dengan menghubungi nomor di bawah ini:</b></p><p style="font-size:18px;font-weight:700;color:#25D366;margin-top:8px;"><i class="fab fa-whatsapp"></i> ' + WHATSAPP_NUMBER + '</p>',
        confirmButtonText: '<i class="fab fa-whatsapp"></i> Hubungi Admin',
        confirmButtonColor: '#25D366',
        showCancelButton: true,
        cancelButtonText: 'Tutup',
        cancelButtonColor: '#64748b',
        allowOutsideClick: false
    }).then(function(r) {
        if (r.isConfirmed) window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=Assalamualaikum%20admin%2C%20saya%20ingin%20aktivasi%20akun', '_blank');
    });
}

async function callRevanstore(path, method, data) {
    if (!fingerprint) fingerprint = await getFingerprint();
    if (isBlocked && path !== 'check_blocked') throw new Error('Akses ditolak');
    var payload = {
        path: path,
        method: method || 'GET',
        data: data || null,
        timestamp: Date.now()
    };
    var encryptedPayload = CryptoJS.AES.encrypt(JSON.stringify(payload), API_SECRET).toString();
    var headers = {
        'Content-Type': 'application/json',
        'X-Fingerprint': fingerprint
    };
    var res = await fetch(API_REVANSTORE, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ data: encryptedPayload })
    });
    if (res.status === 429) throw new Error('Terlalu banyak permintaan');
    var text = await res.text();
    if (!text || text === 'null') return null;
    var result = JSON.parse(text);
    if (result.encrypted && result.data) {
        var dec = CryptoJS.AES.decrypt(result.data, API_SECRET).toString(CryptoJS.enc.Utf8);
        if (dec) return JSON.parse(dec);
    }
    return result;
}

function showLoading(message) {
    var overlay = document.getElementById('loadingOverlay');
    var msg = document.getElementById('loadingMessage');
    if (overlay && msg) {
        msg.textContent = message || 'Memproses...';
        overlay.style.display = 'flex';
    }
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

// ==================== MODAL FUNCTIONS ====================
function openModal(id) {
    document.getElementById(id).classList.add('show');
    document.body.style.overflow = 'hidden';
    // Reset captcha dan status
    try {
        if (id === 'modalReset') {
            var resetCaptcha = document.querySelector('#modalReset .g-recaptcha');
            if (resetCaptcha && grecaptcha) {
                grecaptcha.reset(resetCaptcha);
                resetCaptchaDone = false;
                document.getElementById('btnResetModal').disabled = true;
            }
        }
        if (id === 'modalRegister') {
            var registerCaptcha = document.querySelector('#modalRegister .g-recaptcha');
            if (registerCaptcha && grecaptcha) {
                grecaptcha.reset(registerCaptcha);
                registerCaptchaDone = false;
                document.getElementById('btnRegisterModal').disabled = true;
            }
        }
    } catch(e) {}
}

function closeModal(id) {
    document.getElementById(id).classList.remove('show');
    document.body.style.overflow = '';
    // Reset form dan captcha
    if (id === 'modalReset') {
        document.getElementById('resetError').classList.remove('show');
        document.getElementById('resetSuccess').classList.remove('show');
        document.getElementById('resetUsername').value = '';
        document.getElementById('btnResetModal').disabled = true;
        resetCaptchaDone = false;
        try { 
            var rc = document.querySelector('#modalReset .g-recaptcha');
            if (rc && grecaptcha) grecaptcha.reset(rc);
        } catch(e) {}
    }
    if (id === 'modalRegister') {
        document.getElementById('registerError').classList.remove('show');
        document.getElementById('regUsername').value = '';
        document.getElementById('regPassword').value = '';
        document.getElementById('regConfirmPassword').value = '';
        document.getElementById('regPhone').value = '';
        document.getElementById('regEmail').value = '';
        document.getElementById('regVerificationCheck').checked = false;
        document.getElementById('btnRegisterModal').disabled = true;
        document.getElementById('regPaketPlaceholder').textContent = 'Klik untuk pilih paket...';
        document.getElementById('regPaketPlaceholder').className = 'placeholder';
        document.querySelectorAll('.paket-option').forEach(function(o) { o.classList.remove('selected'); });
        selectedPaket = '';
        selectedHarga = 0;
        registerCaptchaDone = false;
        try { 
            var rc2 = document.querySelector('#modalRegister .g-recaptcha');
            if (rc2 && grecaptcha) grecaptcha.reset(rc2);
        } catch(e) {}
    }
}

function onResetCaptcha() {
    resetCaptchaDone = true;
    document.getElementById('btnResetModal').disabled = false;
}

function onRegisterCaptcha() {
    registerCaptchaDone = true;
    toggleRegSubmit();
}

// ==================== RESET PASSWORD ====================
function validateResetUsername() {
    var input = document.getElementById('resetUsername');
    var value = input.value;
    var cleaned = value.replace(/[^a-zA-Z0-9_.]/g, '');
    if (value !== cleaned) {
        input.value = cleaned;
    }
}

function showResetError(msg) {
    document.getElementById('resetErrorText').textContent = msg;
    document.getElementById('resetError').classList.add('show');
    document.getElementById('resetSuccess').classList.remove('show');
}

function showResetSuccess(msg) {
    document.getElementById('resetSuccessText').textContent = msg;
    document.getElementById('resetSuccess').classList.add('show');
    document.getElementById('resetError').classList.remove('show');
}

function setResetButtonLoading(loading) {
    var btn = document.getElementById('btnResetModal');
    btn.disabled = loading;
    btn.innerHTML = loading ? '<i class="fas fa-spinner fa-spin"></i> MENGIRIM...' : '<i class="fas fa-paper-plane"></i> KIRIM LINK RESET';
}

async function submitResetPassword() {
    if (resetInProgress) return;
    resetInProgress = true;
    
    try {
        var username = sanitize(document.getElementById('resetUsername').value.trim());
        
        if (!username || username.length < 3) {
            Swal.fire({ icon: "warning", title: "Username Tidak Valid!", text: "Masukkan username minimal 3 karakter.", confirmButtonColor: "#00BFFF" });
            resetInProgress = false;
            return;
        }
        
        var usernameRegex = /^[a-zA-Z0-9_.]+$/;
        if (!usernameRegex.test(username)) {
            Swal.fire({ icon: "error", title: "Simbol Tidak Diizinkan!", confirmButtonColor: "#ef4444" });
            resetInProgress = false;
            return;
        }
        
        var captchaResponse = '';
        try { captchaResponse = grecaptcha.getResponse(document.querySelector('#modalReset .g-recaptcha')); } catch(e) {}
        if (!captchaResponse || captchaResponse.length === 0) {
            Swal.fire({ icon: "warning", title: "reCAPTCHA Diperlukan!", text: "Centang \"I'm not a robot\" dulu ya!", confirmButtonColor: "#00BFFF" });
            resetInProgress = false;
            return;
        }
        
        setResetButtonLoading(true);
        
        var payload = {
            action: 'request_reset',
            username: username,
            captchaToken: captchaResponse,
            timestamp: Date.now()
        };
        
        var encryptedPayload = CryptoJS.AES.encrypt(JSON.stringify(payload), API_SECRET).toString();
        
        var res = await fetch(API_RESET, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Fingerprint': fingerprint
            },
            body: JSON.stringify({ data: encryptedPayload })
        });
        
        var result = await res.json();
        
        if (result.data) {
            var dec = CryptoJS.AES.decrypt(result.data, API_SECRET).toString(CryptoJS.enc.Utf8);
            if (dec) {
                result = JSON.parse(dec);
            }
        }
        
        setResetButtonLoading(false);
        
        if (result && result.success) {
            try { grecaptcha.reset(document.querySelector('#modalReset .g-recaptcha')); } catch(e) {}
            resetCaptchaDone = false;
            document.getElementById('btnResetModal').disabled = true;
            
            var maskedEmail = result.maskedEmail || '';
            var msg = maskedEmail ? 'Link reset telah dikirim ke ' + maskedEmail + '. Link expired dalam 15 menit.' : 'Jika username terdaftar, link reset akan dikirim ke email Anda.';
            
            showResetSuccess(msg);
            document.getElementById('resetUsername').value = '';
            
            Swal.fire({
                icon: "success",
                title: "Link Terkirim!",
                text: msg,
                timer: 4000,
                showConfirmButton: false
            });
        } else {
            var errorMsg = 'Terjadi kesalahan. Coba lagi nanti.';
            if (result && result.error === 'rate_limit') {
                errorMsg = 'Terlalu banyak percobaan. Coba lagi nanti.';
            } else if (result && result.error === 'user_not_found') {
                errorMsg = 'Username tidak terdaftar! Periksa kembali username Anda.';
            } else if (result && result.error === 'email_not_found') {
                errorMsg = 'Akun ini tidak memiliki email terdaftar! Hubungi admin.';
            } else if (result && result.error === 'account_banned') {
                errorMsg = 'Akun Anda dibanned! Hubungi admin.';
            } else if (result && result.error === 'account_suspended') {
                errorMsg = 'Akun Anda ditangguhkan! Hubungi admin.';
            } else if (result && result.error === 'email_error') {
                errorMsg = 'Gagal mengirim email! Coba lagi nanti.';
            } else if (result && result.message) {
                errorMsg = result.message;
            }
            Swal.fire({ icon: "error", title: "Gagal!", text: errorMsg, confirmButtonColor: "#ef4444" });
            try { grecaptcha.reset(document.querySelector('#modalReset .g-recaptcha')); } catch(e) {}
            resetCaptchaDone = false;
            document.getElementById('btnResetModal').disabled = true;
        }
        
    } catch (error) {
        setResetButtonLoading(false);
        Swal.fire({ icon: "error", title: "Error!", text: "Gagal menghubungkan ke server!", confirmButtonColor: "#ef4444" });
        try { grecaptcha.reset(document.querySelector('#modalReset .g-recaptcha')); } catch(e) {}
        resetCaptchaDone = false;
        document.getElementById('btnResetModal').disabled = true;
    }
    
    resetInProgress = false;
}

// ==================== REGISTER ====================
function validateRegUsername() {
    var input = document.getElementById('regUsername');
    var value = input.value;
    var cleaned = value.replace(/\s/g, '').replace(/[^a-zA-Z0-9_.]/g, '');
    if (value !== cleaned) {
        input.value = cleaned;
    }
}

function validateRegPhone() {
    var input = document.getElementById('regPhone');
    var value = input.value;
    var cleaned = value.replace(/[^0-9+]/g, '');
    if (value !== cleaned) {
        input.value = cleaned;
    }
}

function validateRegEmail() {
    var input = document.getElementById('regEmail');
    var value = input.value;
    var cleaned = value.replace(/\s/g, '');
    if (value !== cleaned) input.value = cleaned;
}

function updateRegPasswordStrength() {
    var password = document.getElementById('regPassword').value;
    var bar = document.getElementById('regPasswordStrengthBar');
    bar.className = 'password-strength-bar';
    if (password.length === 0) { bar.style.width = '0%'; }
    else if (password.length < 6) { bar.classList.add('strength-weak'); }
    else if (password.length < 10) { bar.classList.add('strength-medium'); }
    else { bar.classList.add('strength-strong'); }
}

function toggleRegPaketList() {
    document.getElementById('regPaketSelect').classList.toggle('active');
    document.getElementById('regPaketList').classList.toggle('show');
}

function selectRegPaket(option) {
    selectedPaket = option.getAttribute('data-paket');
    selectedHarga = parseInt(option.getAttribute('data-harga'));
    document.querySelectorAll('#regPaketList .paket-option').forEach(function(o) { o.classList.remove('selected'); });
    option.classList.add('selected');
    var placeholder = document.getElementById('regPaketPlaceholder');
    placeholder.textContent = selectedPaket + ' - Rp ' + selectedHarga.toLocaleString();
    placeholder.className = 'selected-text';
    document.getElementById('regPaketSelect').classList.remove('active');
    document.getElementById('regPaketList').classList.remove('show');
    toggleRegSubmit();
}

function toggleRegSubmit() {
    var check = document.getElementById('regVerificationCheck');
    var btn = document.getElementById('btnRegisterModal');
    var hasPaket = selectedPaket !== '';
    btn.disabled = !(check.checked && hasPaket && registerCaptchaDone);
}

function showRegisterError(msg) {
    document.getElementById('registerErrorText').textContent = msg;
    document.getElementById('registerError').classList.add('show');
}

function hideRegisterError() {
    document.getElementById('registerError').classList.remove('show');
}

function isSequentialPassword(password) {
    for (var i = 0; i < SEQUENTIAL_PATTERNS.length; i++) {
        if (password.toLowerCase().includes(SEQUENTIAL_PATTERNS[i])) return true;
    }
    return false;
}

function isCommonPassword(password) {
    for (var i = 0; i < COMMON_PASSWORDS.length; i++) {
        if (password.toLowerCase() === COMMON_PASSWORDS[i]) return true;
    }
    return false;
}

function isKeyboardSmash(password) {
    for (var i = 0; i < KEYBOARD_PATTERNS.length; i++) {
        if (password.toLowerCase().includes(KEYBOARD_PATTERNS[i])) return true;
    }
    return false;
}

function hasRepeatingChars(password) {
    for (var i = 0; i < password.length - 2; i++) {
        if (password[i] === password[i+1] && password[i] === password[i+2]) return true;
    }
    return false;
}

function validatePasswordComplexity(password) {
    var hasUpperCase = /[A-Z]/.test(password);
    var hasLowerCase = /[a-z]/.test(password);
    var hasNumber = /\d/.test(password);
    return hasUpperCase && hasLowerCase && hasNumber;
}

function isThrowawayEmail(email) {
    var parts = email.split('@');
    if (parts.length !== 2) return false;
    return THROWAWAY_DOMAINS.includes(parts[1].toLowerCase());
}

function isValidIndonesianPhone(phone) {
    var cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.startsWith('0')) return cleaned.length >= 10 && cleaned.length <= 13;
    if (cleaned.startsWith('62')) return cleaned.length >= 11 && cleaned.length <= 14;
    return false;
}

function isValidUserAgent() {
    var ua = navigator.userAgent;
    if (ua.includes('Headless') || ua.includes('PhantomJS') || ua.includes('puppeteer') || ua.includes('Playwright')) return false;
    return true;
}

function isValidScreenSize() {
    if (screen.width === 0 || screen.height === 0) return false;
    if (screen.width < 320 || screen.height < 480) return false;
    return true;
}

function checkBrowserRateLimit() {
    var blockedUntil = localStorage.getItem('register_blocked_until');
    if (blockedUntil) {
        var timeLeft = parseInt(blockedUntil) - Date.now();
        if (timeLeft > 0) {
            Swal.fire({ icon: "error", title: "Terlalu Banyak Percobaan!", text: "Coba lagi dalam beberapa saat.", confirmButtonColor: "#ef4444" });
            return false;
        } else {
            localStorage.removeItem('register_blocked_until');
            localStorage.removeItem('register_attempts');
        }
    }
    return true;
}

function recordRegisterAttempt() {
    var attempts = parseInt(localStorage.getItem('register_attempts') || '0') + 1;
    localStorage.setItem('register_attempts', attempts);
    if (attempts >= 3) {
        localStorage.setItem('register_blocked_until', Date.now() + 3600000);
        localStorage.removeItem('register_attempts');
        Swal.fire({ icon: "error", title: "Diblokir 1 Jam!", text: "Terlalu banyak percobaan gagal.", confirmButtonColor: "#ef4444" });
    }
}

function resetRegisterAttempts() {
    localStorage.removeItem('register_attempts');
    localStorage.removeItem('register_blocked_until');
}

function setRegisterButtonLoading(loading) {
    var btn = document.getElementById('btnRegisterModal');
    btn.disabled = loading;
    btn.innerHTML = loading ? '<i class="fas fa-spinner fa-spin"></i> MEMPROSES...' : '<i class="fas fa-user-plus"></i> DAFTAR';
}

async function submitRegister() {
    if (registerInProgress) return;
    registerInProgress = true;
    hideRegisterError();

    try {
        if (!isValidUserAgent()) { Swal.fire({ icon: "error", title: "Browser Tidak Valid!", confirmButtonColor: "#ef4444" }); registerInProgress = false; return; }
        if (!isValidScreenSize()) { Swal.fire({ icon: "error", title: "Browser Tidak Valid!", confirmButtonColor: "#ef4444" }); registerInProgress = false; return; }

        var honeypot = document.getElementById('regWebsite').value;
        if (honeypot) { Swal.fire({ icon: "error", title: "Bot Detected!", confirmButtonColor: "#ef4444" }); registerInProgress = false; return; }

        if (!checkBrowserRateLimit()) { registerInProgress = false; return; }

        var username = sanitize(document.getElementById('regUsername').value.trim());
        var password = document.getElementById('regPassword').value.trim();
        var confirmPassword = document.getElementById('regConfirmPassword').value.trim();
        var phone = sanitize(document.getElementById('regPhone').value.trim());
        var email = sanitize(document.getElementById('regEmail').value.trim());

        if (!username || username.length < 3) { showRegisterError('Username minimal 3 karakter!'); registerInProgress = false; return; }
        var usernameRegex = /^[a-zA-Z0-9_.]+$/;
        if (!usernameRegex.test(username)) { showRegisterError('Username hanya boleh huruf, angka, underscore (_), dan titik (.)'); registerInProgress = false; return; }
        var lowerUsername = username.toLowerCase();
        for (var i = 0; i < FORBIDDEN_USERNAMES.length; i++) { if (lowerUsername.includes(FORBIDDEN_USERNAMES[i])) { showRegisterError('Username tidak diizinkan!'); registerInProgress = false; return; } }

        if (!password || password.length < 6) { showRegisterError('Password minimal 6 karakter!'); registerInProgress = false; return; }
        if (password.toLowerCase() === username.toLowerCase()) { showRegisterError('Password tidak boleh sama dengan username!'); registerInProgress = false; return; }
        if (!validatePasswordComplexity(password)) { showRegisterError('Password harus ada huruf BESAR, kecil, dan angka!'); registerInProgress = false; return; }
        if (isSequentialPassword(password)) { showRegisterError('Password terlalu mudah!'); registerInProgress = false; return; }
        if (isCommonPassword(password)) { showRegisterError('Password terlalu umum!'); registerInProgress = false; return; }
        if (isKeyboardSmash(password)) { showRegisterError('Password terlalu mudah!'); registerInProgress = false; return; }
        if (hasRepeatingChars(password)) { showRegisterError('Password terlalu mudah!'); registerInProgress = false; return; }
        if (password !== confirmPassword) { showRegisterError('Password tidak cocok!'); registerInProgress = false; return; }

        if (!phone || phone.length < 10) { showRegisterError('Nomor telepon tidak valid!'); registerInProgress = false; return; }
        if (!isValidIndonesianPhone(phone)) { showRegisterError('Gunakan nomor Indonesia (08xx / +62xx)!'); registerInProgress = false; return; }

        if (!email || !email.includes('@')) { showRegisterError('Email wajib mengandung @!'); registerInProgress = false; return; }
        var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) { showRegisterError('Email tidak valid!'); registerInProgress = false; return; }
        if (isThrowawayEmail(email)) { showRegisterError('Gunakan email asli!'); registerInProgress = false; return; }

        if (!selectedPaket) { showRegisterError('Pilih paket terlebih dahulu!'); registerInProgress = false; return; }
        if (!document.getElementById('regVerificationCheck').checked) { showRegisterError('Centang verifikasi aktivasi!'); registerInProgress = false; return; }

        var captchaResponse = '';
        try { captchaResponse = grecaptcha.getResponse(document.querySelector('#modalRegister .g-recaptcha')); } catch(e) {}
        if (!captchaResponse || captchaResponse.length === 0) {
            Swal.fire({ icon: "warning", title: "reCAPTCHA Diperlukan!", text: "Centang \"I'm not a robot\" dulu ya!", confirmButtonColor: "#00BFFF" });
            registerInProgress = false;
            return;
        }

        setRegisterButtonLoading(true);
        if (!fingerprint) fingerprint = await getFingerprint();

        var userIP = 'unknown';
        try { var ipRes = await fetch('https://api.ipify.org?format=json'); var ipData = await ipRes.json(); userIP = ipData.ip || 'unknown'; } catch (e) {}

        var result = await callRevanstore('register', 'POST', {
            username: username, password: password, phone: phone, email: email,
            paket: selectedPaket, harga: selectedHarga, ip: userIP, fingerprint: fingerprint,
            sessionFingerprint: sessionFingerprint, captchaToken: captchaResponse,
            status: 'pending', isActive: false, needsActivation: true, activationStatus: 'pending', role: 'User', createdAt: Date.now()
        });

        setRegisterButtonLoading(false);

        if (result && result.success) {
            resetRegisterAttempts();
            var waMessage = 'Assalamualaikum min, tolong aktivasi akun saya%0A%0AUsername: ' + encodeURIComponent(username) + '%0APaket: ' + encodeURIComponent(selectedPaket) + '%0AHarga: Rp ' + selectedHarga.toLocaleString() + '%0AEmail: ' + encodeURIComponent(email) + '%0ANo. HP: ' + encodeURIComponent(phone);
            Swal.fire({ icon: "success", title: "Pendaftaran Berhasil!", text: "Hubungi admin untuk aktivasi.", confirmButtonColor: "#25D366", confirmButtonText: '<i class="fab fa-whatsapp"></i> Hubungi Admin' }).then(function() {
                window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + waMessage, '_blank');
                closeModal('modalRegister');
            });
        } else {
            recordRegisterAttempt();
            var errMsg = 'Gagal mendaftar! Coba lagi.';
            if (result && result.error === 'ip_limit') { errMsg = 'IP sudah mendaftar hari ini!'; }
            else if (result && result.error === 'fp_limit') { errMsg = 'Perangkat sudah mendaftar hari ini!'; }
            else if (result && result.error === 'username_exists') { errMsg = 'Username sudah terdaftar!'; }
            else if (result && result.error === 'email_exists') { errMsg = 'Email sudah terdaftar!'; }
            Swal.fire({ icon: "error", title: "Gagal!", text: errMsg, confirmButtonColor: "#ef4444" });
            try { grecaptcha.reset(document.querySelector('#modalRegister .g-recaptcha')); } catch(e) {}
            registerCaptchaDone = false;
            document.getElementById('btnRegisterModal').disabled = true;
        }

    } catch (error) {
        setRegisterButtonLoading(false);
        Swal.fire({ icon: "error", title: "Error!", text: "Gagal menghubungkan ke server!", confirmButtonColor: "#ef4444" });
        try { grecaptcha.reset(document.querySelector('#modalRegister .g-recaptcha')); } catch(e) {}
        registerCaptchaDone = false;
        document.getElementById('btnRegisterModal').disabled = true;
    }

    registerInProgress = false;
}

// ==================== MAIN LOGIN ====================
async function login() {
    if (loginInProgress) return;
    loginInProgress = true;
    try {
        var maintenance = await periksaMaintenance();
        if (maintenance) { tampilkanHalamanMaintenance(maintenance); loginInProgress = false; return; }

        var blocked = await checkIfBlocked();
        if (blocked) { tampilkanHalamanBlokir(); loginInProgress = false; return; }
        var username = sanitize(document.getElementById('username').value.trim());
        var password = document.getElementById('password').value.trim();
        if (!username || !password) {
            Swal.fire({ icon: "warning", title: "Oops...", text: "Harap isi username dan password!", confirmButtonColor: "#0ea5e9" });
            loginInProgress = false;
            return;
        }
        var blockData = getBlockData(username);
        if (blockData.blockedUntil && Date.now() < blockData.blockedUntil) {
            Swal.fire({ icon: "error", title: "Akses Ditolak", text: "🔒 Terlalu banyak percobaan!", confirmButtonColor: "#ef4444" });
            loginInProgress = false;
            return;
        }
        var captchaResponse = grecaptcha.getResponse();
        if (!captchaResponse || captchaResponse.length === 0) {
            Swal.fire({ icon: "warning", title: "Oops...", text: "Centang \"I'm not a robot\" dulu ya!", confirmButtonColor: "#0ea5e9" });
            loginInProgress = false;
            return;
        }
        showLoading('Login...');
        var userIP = 'unknown';
        try {
            var ipRes = await fetch('https://api.ipify.org?format=json');
            var ipData = await ipRes.json();
            userIP = ipData.ip || 'unknown';
        } catch (e) {}
        if (!fingerprint) fingerprint = await getFingerprint();
        var result = await callRevanstore('login', 'POST', {
            username: username,
            password: password,
            ip: userIP,
            fingerprint: fingerprint,
            captchaToken: captchaResponse
        });
        if (result && result.blocked) {
            isBlocked = true;
            storageSet('perangkat_diblokir', 'true');
            hideLoading();
            tampilkanHalamanBlokir();
            loginInProgress = false;
            return;
        }
        if (result && result.banned) {
            hideLoading();
            tampilkanPopupBanned(result.bannedUntil || 0);
            loginInProgress = false;
            return;
        }
        if (result && result.banAkses) {
            hideLoading();
            tampilkanHalamanBanAkses(result.banAksesUntil || 0);
            loginInProgress = false;
            return;
        }
        if (result && result.forceLogout) {
            hideLoading();
            tampilkanPopupDitangguhkan();
            loginInProgress = false;
            return;
        }
        if (result && result.error === 'pending_activation') {
            hideLoading();
            tampilkanPopupBelumAktif();
            grecaptcha.reset();
            loginInProgress = false;
            return;
        }
        if (result && result.error === 'rejected') {
            hideLoading();
            Swal.fire({ icon: "error", title: "AKUN DITOLAK", text: "Akun Anda ditolak oleh admin.", confirmButtonColor: "#ef4444" });
            grecaptcha.reset();
            loginInProgress = false;
            return;
        }
        if (result && result.success) {
            storageRemove(getBlockKey(username));
            var user = result.data;
            var expiryCheck = checkAccountExpiry(user);
            if (expiryCheck.expired) {
                hideLoading();
                storageSet('sesi_pengguna', JSON.stringify({
                    username: username,
                    user_id: user.id,
                    role: user.role || 'Operator',
                    full_name: user.full_name || username,
                    expiry_date: user.expiry_date || '',
                    timestamp: Date.now()
                }));
                window.location.href = '/pages/dashboard';
                loginInProgress = false;
                return;
            }
            await callRevanstore('login_success', 'POST', {});
            storageSet('sesi_pengguna', JSON.stringify({
                username: username,
                user_id: user.id,
                role: user.role || 'Operator',
                full_name: user.full_name || username,
                expiry_date: user.expiry_date || '',
                timestamp: Date.now()
            }));
            hideLoading();
            Swal.fire({
                icon: "success",
                title: "Login Berhasil!",
                text: "Selamat datang, " + (user.full_name || username) + "!",
                timer: 1500,
                showConfirmButton: false
            }).then(function() {
                window.location.href = '/pages/dashboard';
            });
        } else {
            await callRevanstore('login_failed', 'POST', {});
            blockData.attempts += 1;
            var d = getBlockDuration(blockData.attempts);
            hideLoading();
            grecaptcha.reset();
            if (d > 0) {
                blockData.blockedUntil = Date.now() + d * 60 * 1000;
                saveBlockData(username, blockData);
                Swal.fire({ icon: "error", title: "Akses Ditolak", text: "🔒 Terlalu banyak percobaan!", confirmButtonColor: "#ef4444" });
            } else {
                saveBlockData(username, blockData);
                Swal.fire({ icon: "error", title: "Oops...", text: "User tidak ditemukan atau password salah!", confirmButtonColor: "#ef4444" });
            }
        }
    } catch (error) {
        hideLoading();
        try { grecaptcha.reset(); } catch (e) {}
        Swal.fire({ icon: "error", title: "Oops...", text: "Gagal menghubungkan ke server!", confirmButtonColor: "#ef4444" });
    }
    loginInProgress = false;
}

function autoCheckSession() {
    var saved = storageGet('sesi_pengguna');
    if (!saved) return;
    try {
        var session = JSON.parse(saved);
        var age = Date.now() - (session.timestamp || 0);
        if (age > 7 * 24 * 60 * 60 * 1000) {
            storageRemove('sesi_pengguna');
            return;
        }
        window.location.href = '/pages/dashboard';
    } catch (e) {
        storageRemove('sesi_pengguna');
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    autoCheckSession();

    if (!fingerprint) fingerprint = await getFingerprint();
    var blocked = await checkIfBlocked();
    if (blocked) {
        tampilkanHalamanBlokir();
        return;
    }

    // CLOSE MODAL ON OVERLAY CLICK
    document.querySelectorAll('.modal-overlay').forEach(function(modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                var id = this.id;
                if (id === 'modalReset') closeModal('modalReset');
                if (id === 'modalRegister') closeModal('modalRegister');
            }
        });
    });

    // CLOSE PAKET LIST ON OUTSIDE CLICK
    document.addEventListener('click', function(e) {
        var dropdown = document.querySelector('#modalRegister .paket-dropdown');
        if (dropdown && !dropdown.contains(e.target)) {
            document.getElementById('regPaketSelect').classList.remove('active');
            document.getElementById('regPaketList').classList.remove('show');
        }
    });

    updatePasswordCounter();
    document.getElementById('password').addEventListener('input', updatePasswordCounter);
    document.getElementById('username').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') document.getElementById('password').focus();
    });
    document.getElementById('password').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') login();
    });

    document.getElementById('resetUsername').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') submitResetPassword();
    });

    document.getElementById('regEmail').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') submitRegister();
    });
});