var API_REVANSTORE = '/api/revanstore';
var WHATSAPP_NUMBER = '6285199120995';
var STORAGE_KEY = 'bussid_session';
var STORAGE_SECRET = 'bussid_session_secret_key';
var MAX_PASSWORD_LENGTH = 20;
var fingerprint = '';
var loginInProgress = false;

function storageSet(key, value) {
    try {
        var data = { key: key, value: value };
        var encrypted = CryptoJS.AES.encrypt(JSON.stringify(data), STORAGE_SECRET).toString();
        localStorage.setItem(STORAGE_KEY, encrypted);
    } catch (e) {}
}

function storageGet() {
    try {
        var encrypted = localStorage.getItem(STORAGE_KEY);
        if (!encrypted) return null;
        var decrypted = CryptoJS.AES.decrypt(encrypted, STORAGE_SECRET).toString(CryptoJS.enc.Utf8);
        return JSON.parse(decrypted) || null;
    } catch (e) { return null; }
}

function sanitize(str) {
    if (!str) return '';
    return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
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

function showLoading(message) {
    document.getElementById('loadingMessage').textContent = message || 'Memproses...';
    document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

function updatePasswordCounter() {
    var input = document.getElementById('password');
    var counter = document.getElementById('passwordCharCount');
    if (input && counter) {
        counter.textContent = input.value.length + '/' + MAX_PASSWORD_LENGTH;
    }
}

function onCaptchaVerified(token) {
    document.getElementById('btnLogin').disabled = false;
}

function onCaptchaExpired() {
    document.getElementById('btnLogin').disabled = true;
    grecaptcha.reset();
}

function showBanPopup(type, until) {
    var untilText = (until || 0) === 0 ? 'PERMANEN' : ('sampai ' + new Date(until).toLocaleString('id-ID'));
    var title = '', message = '', icon = 'error';

    if (type === 'banned') {
        title = 'AKUN DIBANNED';
        message = 'Maaf, akun Anda telah dibanned oleh admin.<br><br>⏱️ Durasi: ' + untilText;
    } else if (type === 'banAkses') {
        title = 'AKSES DIBLOKIR';
        message = 'Maaf, akses Anda diblokir oleh admin.<br><br>⏱️ Durasi: ' + untilText;
    } else if (type === 'forceLogout') {
        title = 'AKUN DITANGGUHKAN';
        message = 'Akun Anda ditangguhkan karena indikasi sharing akun.<br><br>Silakan hubungi admin.';
        icon = 'warning';
    }

    Swal.fire({
        icon: icon,
        title: title,
        html: message,
        confirmButtonText: '<i class="fab fa-whatsapp"></i> Hubungi Admin',
        confirmButtonColor: '#25D366',
        showCancelButton: true,
        cancelButtonText: 'Tutup',
        cancelButtonColor: '#64748b',
        allowOutsideClick: false
    }).then(function(result) {
        if (result.isConfirmed) {
            window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=Assalamualaikum%20admin%2C%20akun%20saya%20terkena%20' + type, '_blank');
        }
    });
}

async function login() {
    if (loginInProgress) return;
    loginInProgress = true;

    var username = sanitize(document.getElementById('username').value.trim());
    var password = document.getElementById('password').value.trim();

    if (!username || !password) {
        Swal.fire({ icon: 'warning', title: 'Oops...', text: 'Harap isi username dan password!', confirmButtonColor: '#0ea5e9' });
        loginInProgress = false;
        return;
    }

    var captchaResponse = grecaptcha.getResponse();
    if (!captchaResponse || captchaResponse.length === 0) {
        Swal.fire({ icon: 'warning', title: 'Oops...', text: 'Centang "I\'m not a robot" dulu ya!', confirmButtonColor: '#0ea5e9' });
        loginInProgress = false;
        return;
    }

    showLoading('Login...');

    try {
        if (!fingerprint) fingerprint = await getFingerprint();

        var userIP = 'unknown';
        try {
            var ipRes = await fetch('https://api.ipify.org?format=json');
            var ipData = await ipRes.json();
            userIP = ipData.ip || 'unknown';
        } catch (e) {}

        var res = await fetch(API_REVANSTORE, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Fingerprint': fingerprint
            },
            body: JSON.stringify({
                path: 'login',
                method: 'POST',
                data: {
                    username: username,
                    password: password,
                    ip: userIP,
                    fingerprint: fingerprint,
                    captchaToken: captchaResponse
                }
            })
        });

        var result = await res.json();

        if (result.encrypted && result.data) {
            var decrypted = CryptoJS.AES.decrypt(result.data, STORAGE_SECRET).toString(CryptoJS.enc.Utf8);
            if (decrypted) result = JSON.parse(decrypted);
        }

        if (result && result.blocked) {
            hideLoading();
            grecaptcha.reset();
            document.getElementById('btnLogin').disabled = true;
            Swal.fire({ icon: 'error', title: 'AKSES DITOLAK', text: 'IP atau perangkat Anda diblokir.', confirmButtonColor: '#ef4444' });
            loginInProgress = false;
            return;
        }

        if (result && result.banned) {
            hideLoading();
            grecaptcha.reset();
            document.getElementById('btnLogin').disabled = true;
            showBanPopup('banned', result.bannedUntil);
            loginInProgress = false;
            return;
        }

        if (result && result.banAkses) {
            hideLoading();
            grecaptcha.reset();
            document.getElementById('btnLogin').disabled = true;
            showBanPopup('banAkses', result.banAksesUntil);
            loginInProgress = false;
            return;
        }

        if (result && result.forceLogout) {
            hideLoading();
            grecaptcha.reset();
            document.getElementById('btnLogin').disabled = true;
            showBanPopup('forceLogout', 0);
            loginInProgress = false;
            return;
        }

        if (result && result.success) {
            var user = result.data;
            storageSet('session', {
                username: username,
                password: password,
                user_id: user.id,
                role: user.role || 'Operator',
                full_name: user.full_name || username,
                expiry_date: user.expiry_date || '',
                timestamp: Date.now()
            });

            hideLoading();
            Swal.fire({
                icon: 'success',
                title: 'Login Berhasil!',
                text: 'Selamat datang, ' + (user.full_name || username) + '!',
                timer: 1500,
                showConfirmButton: false
            }).then(function() {
                window.location.href = 'dashboard.html';
            });
        } else {
            hideLoading();
            grecaptcha.reset();
            document.getElementById('btnLogin').disabled = true;
            Swal.fire({
                icon: 'error',
                title: 'Oops...',
                text: (result && result.message) ? result.message : 'Username atau password salah!',
                confirmButtonColor: '#ef4444'
            });
        }
    } catch (error) {
        hideLoading();
        grecaptcha.reset();
        document.getElementById('btnLogin').disabled = true;
        Swal.fire({ icon: 'error', title: 'Oops...', text: 'Gagal menghubungkan ke server!', confirmButtonColor: '#ef4444' });
    }
    loginInProgress = false;
}

document.addEventListener('DOMContentLoaded', async function() {
    if (!fingerprint) fingerprint = await getFingerprint();

    updatePasswordCounter();
    document.getElementById('password').addEventListener('input', updatePasswordCounter);

    document.getElementById('username').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') document.getElementById('password').focus();
    });
    document.getElementById('password').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') login();
    });
});