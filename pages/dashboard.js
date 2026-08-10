var API_REVANSTORE = '/api/revanstoreV2';
var API_RVNSTORE = '/api/rvnstore';
var WHATSAPP_NUMBER = '6285199120995';
var STORAGE_KEY = 'bussid_session';
var STORAGE_SECRET = 'bussid_session_secret_key';
var RECAPTCHA_V3_SITE_KEY = '6LcVBn4tAAAAAINTTIleUbUZr1ZykvyB6WA-oOfT';

var currentUser = null;
var currentAccount = null;
var currentAuthToken = null;
var fingerprint = '';
var alertTimeout = null;
var statusCheckInterval = null;

function storageGet() {
    try {
        var encrypted = localStorage.getItem(STORAGE_KEY);
        if (!encrypted) return null;
        var decrypted = CryptoJS.AES.decrypt(encrypted, STORAGE_SECRET).toString(CryptoJS.enc.Utf8);
        return JSON.parse(decrypted) || null;
    } catch (e) { return null; }
}

function storageRemove() {
    localStorage.removeItem(STORAGE_KEY);
}

function sanitize(str) {
    if (!str) return '';
    return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

function showAlert(message, type, duration) {
    type = type || 'info';
    duration = duration || 2500;
    var alertDiv = document.getElementById('alert');
    if (!alertDiv) return;
    var icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle', loading: 'fa-spinner fa-spin' };
    alertDiv.innerHTML = '<div class="alert-content"><div class="alert-icon"><i class="fas ' + (icons[type] || 'fa-info-circle') + '"></i></div><span>' + sanitize(message) + '</span></div>';
    alertDiv.className = 'alert ' + type + ' show';
    if (alertTimeout) clearTimeout(alertTimeout);
    if (type !== 'loading') { alertTimeout = setTimeout(function() { alertDiv.classList.remove('show'); }, duration); }
}

function showLoading(message) {
    document.getElementById('loadingMessage').textContent = message || 'Memproses...';
    document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

function formatCurrency(amount) {
    if (!amount && amount !== 0) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(amount));
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

async function getRecaptchaV3Token(action) {
    try {
        return await grecaptcha.execute(RECAPTCHA_V3_SITE_KEY, { action: action });
    } catch (e) {
        return null;
    }
}

async function checkAccountStatus() {
    if (!currentUser) return;
    try {
        var captchaToken = await getRecaptchaV3Token('check_status');
        var res = await fetch(API_REVANSTORE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Fingerprint': fingerprint },
            body: JSON.stringify({
                path: 'check_account_status',
                method: 'POST',
                data: { username: currentUser.username, user_id: currentUser.user_id, fingerprint: fingerprint, captchaToken: captchaToken }
            })
        });
        var result = await res.json();
        if (result.encrypted && result.data) {
            var decrypted = CryptoJS.AES.decrypt(result.data, STORAGE_SECRET).toString(CryptoJS.enc.Utf8);
            if (decrypted) result = JSON.parse(decrypted);
        }

        if (result && result.banned) {
            var until = result.bannedUntil || 0;
            var untilText = until === 0 ? 'PERMANEN' : ('sampai ' + new Date(until).toLocaleString('id-ID'));
            Swal.fire({
                icon: 'error', title: 'AKUN DIBANNED',
                html: 'Maaf, akun Anda telah dibanned oleh admin.<br><br>⏱️ Durasi: ' + untilText,
                confirmButtonText: 'OK', confirmButtonColor: '#ef4444', allowOutsideClick: false
            }).then(function() { autoLogout(); });
            return;
        }

        if (result && result.banAkses) {
            var untilA = result.banAksesUntil || 0;
            var untilTextA = untilA === 0 ? 'PERMANEN' : ('sampai ' + new Date(untilA).toLocaleString('id-ID'));
            Swal.fire({
                icon: 'error', title: 'AKSES DIBLOKIR',
                html: 'Maaf, akses Anda diblokir oleh admin.<br><br>⏱️ Durasi: ' + untilTextA,
                confirmButtonText: 'OK', confirmButtonColor: '#ef4444', allowOutsideClick: false
            }).then(function() { autoLogout(); });
            return;
        }

        if (result && result.forceLogout) {
            Swal.fire({
                icon: 'warning', title: 'AKUN DITANGGUHKAN',
                html: 'Akun Anda ditangguhkan karena indikasi sharing akun.<br><br>Silakan hubungi admin.',
                confirmButtonText: 'OK', confirmButtonColor: '#ef4444', allowOutsideClick: false
            }).then(function() { autoLogout(); });
            return;
        }
    } catch (e) {}
}

function autoLogout() {
    storageRemove();
    if (statusCheckInterval) clearInterval(statusCheckInterval);
    window.location.href = '../index.html';
}

function logout() {
    storageRemove();
    if (statusCheckInterval) clearInterval(statusCheckInterval);
    window.location.href = '../index.html';
}

function checkAuth() {
    var saved = storageGet();
    if (!saved || !saved.value || !saved.value.username) {
        window.location.href = '../index.html';
        return false;
    }
    var session = saved.value;
    var age = Date.now() - (session.timestamp || 0);
    if (age > 7 * 24 * 60 * 60 * 1000) {
        storageRemove();
        window.location.href = '../index.html';
        return false;
    }
    currentUser = session;
    return true;
}

function navigateBottom(page) {
    document.querySelectorAll('.bottom-nav a').forEach(function(a) { a.classList.remove('active'); });
    event.target.classList.add('active');
    if (page === 'home') showAlert('Beranda', 'info');
    else if (page === 'riwayat') showAlert('Riwayat dalam pengembangan', 'info');
    else if (page === 'pengaturan') showAlert('Pengaturan dalam pengembangan', 'info');
}

async function searchAccount() {
    var id = document.getElementById('deviceId').value.trim();
    if (!id) { showAlert('Masukkan Device ID!', 'error'); return; }
    showAlert('Fitur search account dalam pengembangan', 'info');
}

document.addEventListener('DOMContentLoaded', async function() {
    if (!checkAuth()) return;

    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('bottomNav').style.display = 'flex';

    if (!fingerprint) fingerprint = await getFingerprint();

    grecaptcha.ready(async function() {
        await checkAccountStatus();
        statusCheckInterval = setInterval(checkAccountStatus, 30000);
    });

    document.getElementById('deviceId').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') searchAccount();
    });
});