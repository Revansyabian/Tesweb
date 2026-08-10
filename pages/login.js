var API_REVANSTORE = '/api/revanstoreV2';
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
    } catch (e) {
        console.error('Gagal menyimpan session:', e);
    }
}

function storageGet() {
    try {
        var encrypted = localStorage.getItem(STORAGE_KEY);
        if (!encrypted) return null;
        var decrypted = CryptoJS.AES.decrypt(encrypted, STORAGE_SECRET).toString(CryptoJS.enc.Utf8);
        var parsed = JSON.parse(decrypted);
        if (!parsed || !parsed.value || !parsed.value.username) return null;
        return parsed;
    } catch (e) {
        console.error('Gagal membaca session:', e);
        return null;
    }
}

function sanitize(str) {
    if (!str) return '';
    return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

async function getFingerprint() {
    try {
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
    } catch (e) {
        console.error('Gagal generate fingerprint:', e);
        return CryptoJS.MD5(navigator.userAgent + Date.now()).toString();
    }
}

function showLoading(message) {
    try {
        var msgEl = document.getElementById('loadingMessage');
        var overlay = document.getElementById('loadingOverlay');
        if (msgEl) msgEl.textContent = message || 'Memproses...';
        if (overlay) overlay.style.display = 'flex';
    } catch (e) {
        console.error('Gagal menampilkan loading:', e);
    }
}

function hideLoading() {
    try {
        var overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.style.display = 'none';
    } catch (e) {
        console.error('Gagal menyembunyikan loading:', e);
    }
}

function updatePasswordCounter() {
    try {
        var input = document.getElementById('password');
        var counter = document.getElementById('passwordCharCount');
        if (input && counter) {
            counter.textContent = input.value.length + '/' + MAX_PASSWORD_LENGTH;
        }
    } catch (e) {
        console.error('Gagal update password counter:', e);
    }
}

function onCaptchaVerified(token) {
    try {
        var btn = document.getElementById('btnLogin');
        if (btn) btn.disabled = false;
    } catch (e) {
        console.error('Gagal enable tombol login:', e);
    }
}

function onCaptchaExpired() {
    try {
        var btn = document.getElementById('btnLogin');
        if (btn) btn.disabled = true;
        if (typeof grecaptcha !== 'undefined') grecaptcha.reset();
    } catch (e) {
        console.error('Gagal reset captcha:', e);
    }
}

function showBanPopup(type, until) {
    try {
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

        if (typeof Swal === 'undefined') {
            alert(title + '\n\n' + message.replace(/<br>/g, '\n').replace(/<[^>]*>/g, ''));
            return;
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
    } catch (e) {
        console.error('Gagal menampilkan popup ban:', e);
        alert('Akun Anda terkena ' + type + '. Hubungi admin via WhatsApp: ' + WHATSAPP_NUMBER);
    }
}

async function login() {
    if (loginInProgress) return;
    loginInProgress = true;

    try {
        var usernameInput = document.getElementById('username');
        var passwordInput = document.getElementById('password');

        if (!usernameInput || !passwordInput) {
            console.error('Elemen form tidak ditemukan');
            alert('Terjadi kesalahan. Silakan refresh halaman.');
            loginInProgress = false;
            return;
        }

        var username = sanitize(usernameInput.value.trim());
        var password = passwordInput.value.trim();

        if (!username || !password) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'warning', title: 'Oops...', text: 'Harap isi username dan password!', confirmButtonColor: '#0ea5e9' });
            } else {
                alert('Harap isi username dan password!');
            }
            loginInProgress = false;
            return;
        }

        if (typeof grecaptcha === 'undefined') {
            console.error('reCAPTCHA tidak terdefinisi');
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'error', title: 'Error', text: 'reCAPTCHA gagal dimuat. Refresh halaman.', confirmButtonColor: '#ef4444' });
            } else {
                alert('reCAPTCHA gagal dimuat. Refresh halaman.');
            }
            loginInProgress = false;
            return;
        }

        var captchaResponse = grecaptcha.getResponse();
        if (!captchaResponse || captchaResponse.length === 0) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'warning', title: 'Oops...', text: 'Centang "I\'m not a robot" dulu ya!', confirmButtonColor: '#0ea5e9' });
            } else {
                alert('Centang "I\'m not a robot" dulu ya!');
            }
            loginInProgress = false;
            return;
        }

        showLoading('Login...');

        if (!fingerprint) fingerprint = await getFingerprint();

        var userIP = 'unknown';
        try {
            var ipRes = await fetch('https://api.ipify.org?format=json');
            if (ipRes.ok) {
                var ipData = await ipRes.json();
                userIP = ipData.ip || 'unknown';
            }
        } catch (e) {
            console.warn('Gagal mendapatkan IP:', e);
        }

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

        if (!res.ok) {
            throw new Error('Server error: ' + res.status);
        }

        var rawResult = await res.json();

        if (!rawResult) {
            throw new Error('Response kosong dari server');
        }

        var result = rawResult;

        if (result.encrypted && result.data) {
            try {
                var decrypted = CryptoJS.AES.decrypt(result.data, STORAGE_SECRET).toString(CryptoJS.enc.Utf8);
                if (decrypted) {
                    var parsed = JSON.parse(decrypted);
                    if (parsed) result = parsed;
                }
            } catch (e) {
                console.error('Gagal decrypt response:', e);
            }
        }

        if (result && result.blocked) {
            hideLoading();
            grecaptcha.reset();
            document.getElementById('btnLogin').disabled = true;
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'error', title: 'AKSES DITOLAK', text: 'IP atau perangkat Anda diblokir.', confirmButtonColor: '#ef4444' });
            } else {
                alert('AKSES DITOLAK: IP atau perangkat Anda diblokir.');
            }
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
            if (!user || !user.id) {
                throw new Error('Data user tidak lengkap');
            }

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
            if (typeof Swal !== 'undefined') {
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
                alert('Login Berhasil! Selamat datang, ' + (user.full_name || username) + '!');
                window.location.href = 'dashboard.html';
            }
        } else {
            hideLoading();
            grecaptcha.reset();
            document.getElementById('btnLogin').disabled = true;
            var errorMsg = (result && result.message) ? result.message : 'Username atau password salah!';
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'error', title: 'Oops...', text: errorMsg, confirmButtonColor: '#ef4444' });
            } else {
                alert('Oops... ' + errorMsg);
            }
        }
    } catch (error) {
        console.error('Login error:', error);
        hideLoading();
        try {
            if (typeof grecaptcha !== 'undefined') {
                grecaptcha.reset();
            }
            var btn = document.getElementById('btnLogin');
            if (btn) btn.disabled = true;
        } catch (e) {}

        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'error',
                title: 'Oops...',
                text: 'Gagal menghubungkan ke server! Silakan coba lagi.',
                confirmButtonColor: '#ef4444'
            });
        } else {
            alert('Gagal menghubungkan ke server! Silakan coba lagi.');
        }
    }
    loginInProgress = false;
}

document.addEventListener('DOMContentLoaded', async function() {
    try {
        if (!fingerprint) fingerprint = await getFingerprint();

        updatePasswordCounter();

        var passwordInput = document.getElementById('password');
        if (passwordInput) {
            passwordInput.addEventListener('input', updatePasswordCounter);
        }

        var usernameInput = document.getElementById('username');
        if (usernameInput) {
            usernameInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    var pw = document.getElementById('password');
                    if (pw) pw.focus();
                }
            });
        }

        if (passwordInput) {
            passwordInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') login();
            });
        }

        console.log('Login page siap.');
    } catch (e) {
        console.error('Gagal inisialisasi login page:', e);
    }
});