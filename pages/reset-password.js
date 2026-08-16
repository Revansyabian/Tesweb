var API_RESET = '/api/reset-pw';
var API_REVANSTORE = '/api/revanstoreV2';
var API_SECRET = '1417-1426-1527-1517';
var WHATSAPP_NUMBER = "6285199120995";
var fingerprint = '';
var resetInProgress = false;

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

function sanitize(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/`/g, '&#96;')
        .replace(/javascript:/gi, '')
        .replace(/on\w+=/gi, '')
        .replace(/<script/gi, '')
        .replace(/<\/script/gi, '');
}

function safeSetHTML(element, html) {
    if (!element) return;
    if (window.DOMPurify) {
        element.innerHTML = DOMPurify.sanitize(html, {
            ALLOWED_TAGS: ['div', 'span', 'p', 'h1', 'h2', 'h3', 'button', 'i', 'b', 'br'],
            ALLOWED_ATTR: ['class', 'style', 'onclick', 'id']
        });
    } else {
        element.textContent = html;
    }
}

function validateUsernameInput() {
    var input = document.getElementById('username');
    var value = input.value;
    var cleaned = value.replace(/[^a-zA-Z0-9_.]/g, '');
    if (value !== cleaned) {
        input.value = cleaned;
        Swal.fire({ icon: "warning", title: "Simbol Tidak Diizinkan!", text: "Username hanya boleh huruf, angka, underscore (_), dan titik (.)", timer: 2000, showConfirmButton: false });
    }
}

function showError(msg) {
    var el = document.getElementById('errorText');
    var container = document.getElementById('errorMessage');
    if (el) el.textContent = msg;
    if (container) {
        container.classList.add('show');
        document.getElementById('successMessage').classList.remove('show');
    }
}

function showSuccess(msg) {
    var el = document.getElementById('successText');
    var container = document.getElementById('successMessage');
    if (el) el.textContent = msg;
    if (container) {
        container.classList.add('show');
        document.getElementById('errorMessage').classList.remove('show');
    }
}

function setButtonLoading(loading) {
    var btn = document.getElementById('btnReset');
    btn.disabled = loading;
    btn.innerHTML = loading ? '<i class="fas fa-spinner fa-spin"></i> MENGIRIM...' : '<i class="fas fa-paper-plane"></i> KIRIM LINK RESET';
}

function showBanAccessPage(until) {
    var untilText = (until || 0) === 0 ? 'PERMANEN' : ('sampai ' + new Date(until).toLocaleString('id-ID'));
    var html = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#f0f9ff 0%,#bae6fd 50%,#7dd3fc 100%);padding:20px;font-family:\'Segoe UI\',sans-serif;">' +
        '<div style="background:#ffffff;border-radius:24px;padding:48px 36px;width:100%;max-width:420px;text-align:center;box-shadow:0 20px 60px rgba(0,191,255,0.15);border:1px solid rgba(0,191,255,0.1);">' +
        '<div style="font-size:72px;color:#f59e0b;margin-bottom:12px;">🚫</div>' +
        '<h2 style="font-size:24px;font-weight:700;color:#0c4a6e;margin-bottom:8px;">AKSES DITOLAK</h2>' +
        '<p style="font-size:14px;color:#64748b;margin-bottom:6px;">Akses ditolak, jika ingin dibuka silakan hubungi admin.</p>' +
        '<div style="background:#fef3c7;color:#92400e;padding:12px 16px;border-radius:12px;font-weight:600;font-size:14px;margin:16px 0 24px;">Durasi: ' + sanitize(untilText) + '</div>' +
        '<button onclick="window.open(\'https://wa.me/' + WHATSAPP_NUMBER + '?text=Assalamualaikum%20admin%2C%20akses%20saya%20diblokir\',\'_blank\')" style="display:inline-flex;align-items:center;gap:10px;padding:12px 32px;background:#25D366;color:#fff;border:none;border-radius:30px;font-weight:600;font-size:15px;cursor:pointer;transition:0.2s;font-family:\'Segoe UI\',sans-serif;">' +
        '<i class="fab fa-whatsapp"></i> Hubungi Admin</button></div></div>';
    safeSetHTML(document.body, html);
}

function showMaintenancePage(dataMaintenance) {
    var judul = (dataMaintenance && (dataMaintenance.title || dataMaintenance.judul)) 
        ? (dataMaintenance.title || dataMaintenance.judul) 
        : 'SEDANG PERBAIKAN SISTEM';
    var pesan = (dataMaintenance && (dataMaintenance.message || dataMaintenance.pesan)) 
        ? (dataMaintenance.message || dataMaintenance.pesan) 
        : 'Website sedang dalam perbaikan oleh admin. Silakan kembali beberapa saat lagi.';
    var sampai = (dataMaintenance && (dataMaintenance.until || dataMaintenance.sampai)) 
        ? (dataMaintenance.until || dataMaintenance.sampai) 
        : null;
    var teksEstimasi = sampai ? 'Estimasi selesai: ' + new Date(sampai).toLocaleString('id-ID') : 'Mohon maaf atas ketidaknyamanan ini.';

    var html = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#e0f2fe 0%,#bae6fd 50%,#7dd3fc 100%);padding:20px;font-family:\'Segoe UI\',sans-serif;">' +
        '<div style="background:#ffffff;border-radius:24px;padding:48px 36px;width:100%;max-width:440px;text-align:center;box-shadow:0 25px 60px rgba(0,0,0,0.1);">' +
        '<div style="width:90px;height:90px;background:#fef3c7;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">' +
        '<i class="fas fa-tools" style="font-size:40px;color:#f59e0b;"></i>' +
        '</div>' +
        '<h1 style="color:#0c4a6e;font-size:24px;font-weight:700;margin-bottom:8px;">' + sanitize(judul) + '</h1>' +
        '<p style="color:#64748b;font-size:14px;margin-bottom:6px;line-height:1.6;">' + sanitize(pesan) + '</p>' +
        '<div style="background:#fef3c7;color:#92400e;padding:12px 16px;border-radius:12px;font-weight:600;font-size:13px;margin:16px 0 24px;">' + sanitize(teksEstimasi) + '</div>' +
        '<button onclick="window.open(\'https://wa.me/' + WHATSAPP_NUMBER + '?text=Assalamualaikum%20admin%2C%20info%20perbaikan\',\'_blank\')" style="display:inline-flex;align-items:center;gap:10px;padding:12px 32px;background:#25D366;color:#fff;border:none;border-radius:30px;font-weight:600;font-size:15px;cursor:pointer;transition:0.2s;font-family:\'Segoe UI\',sans-serif;">' +
        '<i class="fab fa-whatsapp"></i> Hubungi Admin</button></div></div>';
    safeSetHTML(document.body, html);
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

async function checkIfBlocked() {
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
        if (result && result.blocked === true) {
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}

async function resetPassword() {
    if (resetInProgress) return;
    resetInProgress = true;
    
    try {
        if (!fingerprint) fingerprint = await getFingerprint();
        
        var maintenance = await periksaMaintenance();
        if (maintenance) {
            showMaintenancePage(maintenance);
            resetInProgress = false;
            return;
        }
        
        var blocked = await checkIfBlocked();
        if (blocked) {
            showBanAccessPage(0);
            resetInProgress = false;
            return;
        }
        
        var username = sanitize(document.getElementById('username').value.trim());
        
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
        if (typeof grecaptcha !== 'undefined') {
            captchaResponse = grecaptcha.getResponse();
        }
        
        if (!captchaResponse || captchaResponse.length === 0) {
            Swal.fire({ icon: "warning", title: "reCAPTCHA Diperlukan!", text: "Centang \"I'm not a robot\" dulu ya!", confirmButtonColor: "#00BFFF" });
            resetInProgress = false;
            return;
        }
        
        setButtonLoading(true);
        
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
            result = JSON.parse(dec);
        }
        
        setButtonLoading(false);
        
        if (result && result.success) {
            if (typeof grecaptcha !== 'undefined') grecaptcha.reset();
            
            var maskedEmail = result.maskedEmail || '';
            var msg = maskedEmail ? 'Link reset telah dikirim ke ' + maskedEmail + '. Link expired dalam 15 menit.' : 'Jika username terdaftar, link reset akan dikirim ke email Anda.';
            
            showSuccess(msg);
            
            Swal.fire({
                icon: "success",
                title: "Link Terkirim!",
                text: msg,
                timer: 4000,
                showConfirmButton: false
            });
            
            document.getElementById('username').value = '';
        } else {
            var errorMsg = 'Terjadi kesalahan. Coba lagi nanti.';
            
            if (result && result.error === 'rate_limit') {
                errorMsg = 'Terlalu banyak percobaan. Coba lagi nanti.';
            } else if (result && result.error === 'no_data') {
                errorMsg = 'Data tidak ditemukan!';
            } else if (result && result.error === 'access_denied') {
                errorMsg = 'Akses ditolak!';
            } else if (result && result.error === 'invalid_username') {
                errorMsg = 'Username minimal 3 karakter!';
            } else if (result && result.error === 'invalid_captcha') {
                errorMsg = 'reCAPTCHA tidak valid! Silakan coba lagi.';
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
            if (typeof grecaptcha !== 'undefined') grecaptcha.reset();
        }
        
    } catch (error) {
        setButtonLoading(false);
        Swal.fire({ icon: "error", title: "Error!", text: "Gagal menghubungkan ke server!", confirmButtonColor: "#ef4444" });
        if (typeof grecaptcha !== 'undefined') grecaptcha.reset();
    }
    
    resetInProgress = false;
}

document.addEventListener('DOMContentLoaded', async function() {
    if (!fingerprint) fingerprint = await getFingerprint();
    
    var maintenance = await periksaMaintenance();
    if (maintenance) {
        showMaintenancePage(maintenance);
        return;
    }
    
    var blocked = await checkIfBlocked();
    if (blocked) {
        showBanAccessPage(0);
        return;
    }
    
    document.getElementById('username').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') resetPassword();
    });
});