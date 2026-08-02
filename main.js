// ==================== CONFIG ====================
var API_REVANSTORE = '/api/revanstore';
var API_RVNSTORE = '/api/rvnstore';
var ADMIN_KEY = 'dhagwxwhu:f4afc5aa03e73130f5e055dfe6a708c4dc40759b';
var WHATSAPP_NUMBER = "6285199120995";
var MAX_TOPUP_AMOUNT = 2147483647;

var currentUser = null;
var currentAccount = null;
var currentAuthToken = null;
var pendingAction = null;
var pendingData = null;
var fingerprint = '';
var alertTimeout = null;
var isBlocked = false;
var blockedChecked = false;
var loginInProgress = false; // ANTI SPAM LOGIN

// ==================== SCREENS ====================
function showBlockedScreen() {
    document.body.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#fef2f2,#fee2e2,#fecaca);padding:20px;font-family:\'Segoe UI\',sans-serif;"><div style="background:#fff;border-radius:20px;padding:40px 30px;max-width:440px;width:100%;text-align:center;box-shadow:0 25px 60px rgba(0,0,0,0.1);border:1px solid #fecaca;"><div style="font-size:70px;color:#ef4444;margin-bottom:20px;"><i class="fas fa-shield-haltered"></i></div><h1 style="color:#dc2626;font-size:24px;margin-bottom:10px;">AKSES DITOLAK</h1><p style="color:#64748b;font-size:14px;margin-bottom:20px;">Maaf, akses Anda diblokir karena alasan keamanan.</p><button onclick="window.location.href=\'https://wa.me/' + WHATSAPP_NUMBER + '?text=Assalamualaikum%20admin%2C%20akses%20saya%20diblokir%20tolong%20dibantu\'" style="padding:12px 24px;background:#25D366;color:#fff;border:none;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:8px;margin:0 auto;"><i class="fab fa-whatsapp"></i> Hubungi Admin</button></div></div>';
}

function showBannedScreen(reason, until) {
    var untilText = until === 0 ? 'PERMANEN' : ('sampai ' + new Date(until).toLocaleString('id-ID'));
    document.body.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#fef2f2,#fee2e2,#fecaca);padding:20px;font-family:\'Segoe UI\',sans-serif;"><div style="background:#fff;border-radius:20px;padding:40px 30px;max-width:440px;width:100%;text-align:center;box-shadow:0 25px 60px rgba(0,0,0,0.1);border:1px solid #fecaca;"><div style="font-size:70px;color:#ef4444;margin-bottom:20px;"><i class="fas fa-ban"></i></div><h1 style="color:#dc2626;font-size:24px;margin-bottom:10px;">AKUN DIBANNED</h1><p style="color:#64748b;font-size:14px;margin-bottom:8px;">' + reason + '</p><p style="color:#991b1b;font-size:13px;background:#fee2e2;padding:8px 12px;border-radius:8px;display:inline-block;"><i class="fas fa-clock"></i> Durasi: <b>' + untilText + '</b></p><br><br><button onclick="window.location.href=\'https://wa.me/' + WHATSAPP_NUMBER + '?text=Assalamualaikum%20admin%2C%20akun%20saya%20dibanned%20tolong%20dibantu\'" style="padding:12px 24px;background:#25D366;color:#fff;border:none;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:8px;margin:0 auto;"><i class="fab fa-whatsapp"></i> Hubungi Admin</button></div></div>';
}

function showForceLogoutScreen(reason) {
    document.body.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#fef3c7,#fde68a,#fcd34d);padding:20px;font-family:\'Segoe UI\',sans-serif;"><div style="background:#fff;border-radius:20px;padding:40px 30px;max-width:440px;width:100%;text-align:center;box-shadow:0 25px 60px rgba(0,0,0,0.1);border:1px solid #fde68a;"><div style="font-size:70px;color:#f59e0b;margin-bottom:20px;"><i class="fas fa-eject"></i></div><h1 style="color:#92400e;font-size:24px;margin-bottom:10px;">AKUN DITANGGUHKAN</h1><p style="color:#64748b;font-size:14px;margin-bottom:8px;">' + reason + '</p><p style="color:#92400e;font-size:12px;margin-bottom:20px;"><i class="fas fa-info-circle"></i> Akun kamu tidak bisa login karena terdeteksi sharing akun atau aktivitas mencurigakan.</p><button onclick="window.location.href=\'https://wa.me/' + WHATSAPP_NUMBER + '?text=Assalamualaikum%20admin%2C%20akun%20saya%20ditangguhkan%20tolong%20dibantu\'" style="padding:12px 24px;background:#25D366;color:#fff;border:none;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:8px;margin:0 auto;"><i class="fab fa-whatsapp"></i> Hubungi Admin</button></div></div>';
}

function showBanAksesScreen(reason, until) {
    var untilText = until === 0 ? 'PERMANEN' : ('sampai ' + new Date(until).toLocaleString('id-ID'));
    document.body.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#fef2f2,#fee2e2,#fecaca);padding:20px;font-family:\'Segoe UI\',sans-serif;"><div style="background:#fff;border-radius:20px;padding:40px 30px;max-width:440px;width:100%;text-align:center;box-shadow:0 25px 60px rgba(0,0,0,0.1);border:1px solid #fecaca;"><div style="font-size:70px;color:#ef4444;margin-bottom:20px;"><i class="fas fa-shield-haltered"></i></div><h1 style="color:#dc2626;font-size:24px;margin-bottom:10px;">AKSES DIBLOKIR</h1><p style="color:#64748b;font-size:14px;margin-bottom:8px;">' + reason + '</p><p style="color:#991b1b;font-size:13px;background:#fee2e2;padding:8px 12px;border-radius:8px;display:inline-block;"><i class="fas fa-clock"></i> Durasi: <b>' + untilText + '</b></p><br><br><button onclick="window.location.href=\'https://wa.me/' + WHATSAPP_NUMBER + '?text=Assalamualaikum%20admin%2C%20akses%20saya%20diblokir%20tolong%20dibantu\'" style="padding:12px 24px;background:#25D366;color:#fff;border:none;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:8px;margin:0 auto;"><i class="fab fa-whatsapp"></i> Hubungi Admin</button></div></div>';
}

// ==================== FINGERPRINT (SINGLE CALL) ====================
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

// ==================== HELPERS ====================
function sanitize(str) {
    if (!str) return '';
    return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}
function formatCurrency(amount) {
    if (!amount && amount !== 0) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(amount));
}
function parseAmount(input) {
    if (!input || input.trim() === '') return 0;
    var cleaned = input.toUpperCase().replace(/\s/g, '');
    if (cleaned === '2M' || cleaned === '2 M') return MAX_TOPUP_AMOUNT;
    var multiplier = 1, cleanInput = cleaned;
    if (cleaned.includes('M') && !cleaned.includes('JT') && !cleaned.includes('MAX')) { multiplier = 1000000000; cleanInput = cleaned.replace('M', ''); }
    else if (cleaned.includes('JT')) { multiplier = 1000000; cleanInput = cleaned.replace('JT', ''); }
    else if (cleaned.includes('RB') || cleaned.includes('K')) { multiplier = 1000; cleanInput = cleaned.replace(/[KRB]/g, ''); }
    else if (cleaned.includes('MAX')) return MAX_TOPUP_AMOUNT;
    var number = parseFloat(cleanInput.replace(/\./g, '').replace(',', '.'));
    var result = isNaN(number) ? 0 : Math.round(number * multiplier);
    return Math.min(result, MAX_TOPUP_AMOUNT);
}
function parseDate(dateStr) {
    if (!dateStr) return null;
    var parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    var month = parseInt(parts[0], 10) - 1, day = parseInt(parts[1], 10), year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    if (month < 0 || month > 11 || day < 1 || day > 31 || year < 2000) return null;
    var date = new Date(year, month, day);
    if (date.getMonth() !== month || date.getDate() !== day) return null;
    return date;
}
function calculateRemainingDays(expiryDate) {
    if (!expiryDate) return -999;
    if (expiryDate.includes('9999')) return 999999;
    var expiry = parseDate(expiryDate);
    if (!expiry) return -999;
    var now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
}
function getDaysLeftText(daysLeft) {
    if (daysLeft === 999999) return '♾️ Permanent';
    if (daysLeft === -999) return '⏰ Tidak ada';
    if (daysLeft < 0) return '⏰ Habis ' + Math.abs(daysLeft) + ' hari';
    if (daysLeft === 0) return '⚠️ Hari ini';
    if (daysLeft === 1) return '📅 1 hari';
    return '📅 ' + daysLeft + ' hari';
}
function checkAccountExpiry(user) {
    if (!user || !user.expiry_date) return { expired: true, daysLeft: -999, daysLeftText: '⏰ Tidak ada' };
    var daysLeft = calculateRemainingDays(user.expiry_date);
    return { expired: daysLeft <= 0 && daysLeft !== 999999, daysLeft: daysLeft, daysLeftText: getDaysLeftText(daysLeft) };
}

// ==================== ALERT ====================
function showAlert(message, type, duration) {
    type = type || 'info'; duration = duration || 2500;
    var alertDiv = document.getElementById('alert');
    if (alertDiv) {
        var icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle', loading: 'fa-spinner fa-spin' };
        alertDiv.innerHTML = '<div class="alert-content"><div class="alert-icon"><i class="fas ' + (icons[type] || 'fa-info-circle') + '"></i></div><span>' + sanitize(message) + '</span></div>';
        alertDiv.className = 'alert ' + type + ' show';
        if (alertTimeout) clearTimeout(alertTimeout);
        if (type !== 'loading') alertTimeout = setTimeout(function() { alertDiv.classList.remove('show'); }, duration);
    }
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

// ==================== API CALLS ====================
async function checkIfBlocked() {
    if (blockedChecked) return isBlocked;
    if (!fingerprint) fingerprint = await getFingerprint();
    try {
        var result = await callRevanstore('check_blocked', 'POST', { fingerprint: fingerprint });
        isBlocked = !!(result && result.blocked);
        blockedChecked = true;
    } catch(e) {
        isBlocked = false;
        blockedChecked = true;
    }
    return isBlocked;
}

async function callRevanstore(path, method, data) {
    if (!fingerprint) fingerprint = await getFingerprint();
    if (isBlocked && path !== 'check_blocked') throw new Error('Akses ditolak');

    var payload = { path: path, method: method || 'GET', data: data || null, timestamp: Date.now() };
    var encryptedPayload = CryptoJS.AES.encrypt(JSON.stringify(payload), ADMIN_KEY).toString();

    var headers = { 'Content-Type': 'application/json', 'X-Fingerprint': fingerprint };
    if (currentUser && currentUser.username) {
        headers['X-Operator'] = CryptoJS.AES.encrypt(currentUser.username, ADMIN_KEY).toString();
    }

    var res = await fetch(API_REVANSTORE, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ data: encryptedPayload })
    });

    if (res.status === 429) throw new Error('Terlalu banyak request');
    var text = await res.text();
    if (!text || text === 'null') return null;
    return JSON.parse(text);
}

async function callRvnstore(endpoint, method, body, authToken) {
    var res = await fetch(API_RVNSTORE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: endpoint, method: method || 'POST', body: body || null, authToken: authToken || null })
    });
    return await res.json();
}

// ==================== LOGIN (NO SPAM - SINGLE CALL) ====================
async function login() {
    // ANTI SPAM
    if (loginInProgress) return;
    loginInProgress = true;

    try {
        var blocked = await checkIfBlocked();
        if (blocked) { showBlockedScreen(); return; }

        var username = sanitize(document.getElementById('username').value.trim());
        var password = document.getElementById('password').value.trim();

        if (!username || !password) {
            Swal.fire({ icon: 'warning', title: 'Oops...', text: 'Harap isi username dan password!', confirmButtonColor: '#3b82f6' });
            return;
        }

        showLoading('Login...');

        // Dapatkan IP user
        var userIP = 'unknown';
        try {
            var ipRes = await fetch('https://api.ipify.org?format=json');
            var ipData = await ipRes.json();
            userIP = ipData.ip || 'unknown';
        } catch(e) {}

        if (!fingerprint) fingerprint = await getFingerprint();

        // SINGLE LOGIN REQUEST
        var result = await callRevanstore('login', 'POST', {
            username: username,
            password: password,
            ip: userIP,
            fingerprint: fingerprint
        });

        // Check blocked
        if (result && result.blocked) {
            hideLoading();
            showBlockedScreen();
            return;
        }

        // Check banned
        if (result && result.banned) {
            hideLoading();
            showBannedScreen('Maaf, akun Anda telah dibanned oleh admin.', result.bannedUntil || 0);
            return;
        }

        // Check ban akses
        if (result && result.banAkses) {
            hideLoading();
            showBanAksesScreen('Maaf, akses Anda diblokir oleh admin.', result.banAksesUntil || 0);
            return;
        }

        // Check force logout
        if (result && result.forceLogout) {
            hideLoading();
            showForceLogoutScreen('Akun Anda tidak bisa login karena adanya indikasi sharing akun.');
            return;
        }

        // SUCCESS
        if (result && result.success && result.data) {
            var user = result.data;
            var expiryCheck = checkAccountExpiry(user);

            if (expiryCheck.expired) {
                hideLoading();
                showExpiredBanner();
                return;
            }

            // UPDATE IP & FP (SINGLE CALL)
            await callRevanstore('users/' + user.id, 'PATCH', {
                ip: userIP,
                fingerprint: fingerprint,
                lastLogin: { ip: userIP, fingerprint: fingerprint, timestamp: Date.now() }
            }).catch(function() {});

            // DETEKSI SHARING - jika IP & FP berbeda dari sebelumnya
            if (user.ip && user.fingerprint) {
                var ipChanged = user.ip !== userIP;
                var fpChanged = user.fingerprint !== fingerprint;

                if (ipChanged && fpChanged) {
                    // SHARING TERDETEKSI - AUTO FORCE LOGOUT
                    await callRevanstore('users/' + user.id, 'PATCH', { forceLogout: true }).catch(function() {});
                    
                    await callRevanstore('activity_logs', 'POST', {
                        username: username,
                        action: 'sharing_detected',
                        details: 'IP & FP berbeda! Auto force logout.',
                        timestamp: Date.now()
                    }).catch(function() {});

                    hideLoading();
                    showForceLogoutScreen('Terdeteksi sharing akun! IP & Fingerprint berbeda dari biasanya.');
                    return;
                }
            }

            currentUser = {
                id: user.id,
                username: user.username,
                password: password,
                role: user.role || 'Operator',
                full_name: user.full_name || user.username,
                expiry_date: user.expiry_date || ''
            };

            // LOGIN SUCCESS (SINGLE CALL)
            await callRevanstore('login_success', 'POST', {}).catch(function() {});

            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            hideLoading();
            showHome();
            updateProfileInfo();

            Swal.fire({
                icon: 'success',
                title: 'Login Berhasil!',
                text: 'Selamat datang, ' + currentUser.full_name + '!',
                timer: 2000,
                showConfirmButton: false
            });

            // Simpan session
            localStorage.setItem('bussid_session', JSON.stringify({
                username: username,
                password: password,
                user_id: user.id,
                timestamp: Date.now()
            }));
        } else {
            // LOGIN FAILED (SINGLE CALL)
            await callRevanstore('login_failed', 'POST', {}).catch(function() {});
            hideLoading();
            Swal.fire({
                icon: 'error',
                title: 'Oops...',
                text: 'User tidak ditemukan atau password salah!',
                confirmButtonColor: '#ef4444'
            });
        }
    } catch (error) {
        hideLoading();
        Swal.fire({
            icon: 'error',
            title: 'Oops...',
            text: 'Gagal menghubungkan ke server!',
            confirmButtonColor: '#ef4444'
        });
    } finally {
        loginInProgress = false;
    }
}

// ==================== PROFILE & LOGOUT ====================
function updateProfileInfo() {
    if (!currentUser) return;
    var expiryCheck = checkAccountExpiry(currentUser);
    document.getElementById('profileUsername').textContent = currentUser.username;
    document.getElementById('profileName').textContent = currentUser.full_name || currentUser.username;
    document.getElementById('profileRole').textContent = currentUser.role || 'Operator';
    document.getElementById('profileExpiry').innerHTML = '<span><i class="fas fa-calendar-alt"></i> ' + (currentUser.expiry_date || 'Tidak ada') + '</span> <span>' + expiryCheck.daysLeftText + '</span>';
}

function logout() {
    currentUser = null;
    currentAccount = null;
    currentAuthToken = null;
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('expiredBanner').style.display = 'none';
    var ls = document.getElementById('loginScreen');
    ls.style.display = 'flex';
    ls.style.alignItems = 'center';
    ls.style.justifyContent = 'center';
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    localStorage.removeItem('bussid_session');
    showAlert('Logout berhasil!', 'success');
    window.scrollTo(0, 0);
}

// ==================== EXPIRED ====================
function showExpiredBanner() {
    document.getElementById('expiredBanner').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
}
function closeExpiredBanner() {
    document.getElementById('expiredBanner').style.display = 'none';
    logout();
}
function openWhatsApp() {
    var msg = encodeURIComponent("Assalamualaikum admin, saya ingin memperpanjang masa aktif akun. Username: " + (currentUser ? currentUser.username : ''));
    window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + msg, '_blank');
}

// ==================== NAVIGATION ====================
function hideAllSections() {
    var sections = ['accountInfo', 'topupSection', 'kurasSection', 'changeNameSection', 'historySection', 'settingsSection', 'receiptSection'];
    sections.forEach(function(s) { var el = document.getElementById(s); if (el) el.style.display = 'none'; });
    var searchCard = document.querySelector('.search-card');
    if (searchCard) searchCard.style.display = 'none';
}
function showHome() {
    hideAllSections();
    document.querySelector('.search-card').style.display = 'block';
}
function backToAccount() {
    if (currentAccount) { hideAllSections(); document.getElementById('accountInfo').style.display = 'block'; }
    else showHome();
}

// ==================== DEVICE ID ====================
async function loginWithDeviceId(deviceId) {
    showLoading('Menghubungkan...');
    try {
        var cleanInput = sanitize(deviceId.trim());
        if (cleanInput.includes('.')) { currentAuthToken = cleanInput; }
        else {
            var cid = cleanInput.toLowerCase().replace(/^android-/, '');
            var data = await callRvnstore('/Client/LoginWithAndroidDeviceID', 'POST', {
                TitleId: "4AE9", AndroidDeviceId: cid, CreateAccount: true,
                InfoRequestParameters: { GetUserAccountInfo: true, GetUserVirtualCurrency: true, GetPlayerProfile: true }
            }, null);
            if (data.data && data.data.SessionTicket) currentAuthToken = data.data.SessionTicket;
            else { hideLoading(); throw new Error('Device ID tidak valid!'); }
        }
        var info = await getUserInfoFromPlayFab();
        if (info) {
            currentAccount = { deviceId: cleanInput, name: info.name, balance: info.balance, facebook: info.facebook, facebookAvatarUrl: info.facebookAvatarUrl, playFabId: info.playFabId };
            hideLoading(); return true;
        }
        hideLoading(); throw new Error('Gagal!');
    } catch(e) { hideLoading(); showAlert(e.message, 'error'); return false; }
}

async function getUserInfoFromPlayFab() {
    if (!currentAuthToken) return null;
    try {
        var result = await callRvnstore('/Client/GetPlayerCombinedInfo', 'POST', {
            InfoRequestParameters: { GetUserAccountInfo: true, GetUserVirtualCurrency: true, GetPlayerProfile: true }
        }, currentAuthToken);
        if (result.data) {
            var info = result.data.InfoResultPayload, acc = info.AccountInfo;
            var name = (acc && acc.TitleInfo) ? (acc.TitleInfo.DisplayName || 'Unknown') : 'Unknown';
            var balance = info.UserVirtualCurrency ? (info.UserVirtualCurrency.RP || 0) : 0;
            var pfid = acc ? (acc.PlayFabId || '-') : '-';
            var fb = { id: null, name: 'Tidak tertaut', email: null, isConnected: false };
            var fbAvatar = null;
            if (acc && acc.FacebookInfo) {
                fb = { id: acc.FacebookInfo.FacebookId || null, name: acc.FacebookInfo.FullName || 'Tidak tertaut', email: acc.FacebookInfo.Email || null, isConnected: true };
                if (fb.id) fbAvatar = 'https://graph.facebook.com/' + fb.id + '/picture?type=large';
            }
            return { name: name, balance: balance, facebook: fb, facebookAvatarUrl: fbAvatar, playFabId: pfid };
        }
    } catch(e) {}
    return null;
}

async function searchAccount() {
    var id = document.getElementById('deviceId').value.trim();
    if (!id) { showAlert('Masukkan Device ID!', 'error'); return; }
    var ok = await loginWithDeviceId(id);
    if (ok) {
        showAccountInfo(currentAccount);
        hideAllSections();
        document.getElementById('accountInfo').style.display = 'block';
        showAlert('Akun ditemukan!', 'success');
    }
}

function showAccountInfo(acc) {
    document.getElementById('accountName').textContent = sanitize(acc.name || '-');
    document.getElementById('accountBalance').textContent = formatCurrency(acc.balance);
    document.getElementById('playfabId').textContent = acc.playFabId || '-';
    tampilkanFotoProfile(acc);
    tampilkanInfoFacebook(acc.facebook);
}

function tampilkanFotoProfile(acc) {
    var c = document.getElementById('profilePhoto');
    if (!c) return;
    c.innerHTML = '';
    var url = acc && acc.facebookAvatarUrl ? acc.facebookAvatarUrl : null;
    if (url && url !== 'null' && url !== '') {
        var img = document.createElement('img');
        img.src = url;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%';
        img.onload = function() { c.appendChild(img); };
        img.onerror = function() { c.innerHTML = '<i class="fas fa-user"></i>'; };
    } else { c.innerHTML = '<i class="fas fa-user"></i>'; }
}

function tampilkanInfoFacebook(fb) {
    var d = document.getElementById('facebookDetails');
    if (!d) return;
    if (fb && fb.isConnected && fb.id) {
        d.innerHTML = '<div class="fb-info-row"><span><i class="fab fa-facebook"></i> Status:</span><span style="color:#1877F2;"><i class="fas fa-check-circle"></i> TERHUBUNG</span></div>' +
            '<div class="fb-info-row"><span>Facebook ID:</span><span style="font-family:monospace;font-size:12px;">' + sanitize(fb.id) + '</span></div>' +
            '<div class="fb-info-row"><span>Nama:</span><span>' + sanitize(fb.name || '-') + '</span></div>' +
            '<div class="fb-info-row"><span>Email:</span><span>' + sanitize(fb.email || '-') + '</span></div>';
    } else {
        d.innerHTML = '<div class="fb-info-row"><span><i class="fab fa-facebook"></i> Status:</span><span style="color:#ffaa00;"><i class="fas fa-exclamation-triangle"></i> TIDAK TERHUBUNG</span></div>';
    }
}

function refreshAccountInfo() {
    if (!currentAccount) { showAlert('Cari akun dulu!', 'error'); return; }
    showLoading('Refresh...');
    setTimeout(async function() {
        var info = await getUserInfoFromPlayFab();
        if (info) {
            currentAccount.balance = info.balance; currentAccount.name = info.name;
            currentAccount.facebook = info.facebook; currentAccount.facebookAvatarUrl = info.facebookAvatarUrl;
            currentAccount.playFabId = info.playFabId;
            showAccountInfo(currentAccount);
            hideLoading(); showAlert('Updated!', 'success');
        } else hideLoading();
    }, 1000);
}

// ==================== AMOUNT ====================
function setAmount(a) { document.getElementById('topupAmount').value = a; validateTopupAmount(); }
function validateTopupAmount() {
    var input = document.getElementById('topupAmount'), preview = document.getElementById('amountPreview'), previewValue = document.getElementById('amountPreviewValue');
    var amount = parseAmount(input.value);
    if (amount > 0 && input.value.trim() !== '') { preview.style.display = 'block'; previewValue.textContent = formatCurrency(amount); }
    else preview.style.display = 'none';
}

// ==================== TOP UP ====================
function showTopupFromAccount() {
    if (!currentAccount) return;
    document.getElementById('topupAccountName').textContent = currentAccount.name;
    document.getElementById('topupCurrentBalance').textContent = formatCurrency(currentAccount.balance);
    hideAllSections(); document.getElementById('topupSection').style.display = 'block';
}
async function processTopup() {
    if (!currentAccount) return;
    var amt = parseAmount(document.getElementById('topupAmount').value.trim());
    if (amt <= 0) { showAlert('Jumlah tidak valid!', 'error'); return; }
    showConfirm('TOP UP', 'Top up ' + formatCurrency(amt) + ' ke ' + currentAccount.name + '?', 'topup', { amount: amt });
}
async function executeTopup(amt) {
    showLoading('Memproses...');
    var old = currentAccount.balance;
    var ok = await addCashToAccount(amt);
    if (ok) {
        var trx = { type: 'topup', deviceId: currentAccount.deviceId, accountName: currentAccount.name, amount: amt, oldBalance: old, newBalance: currentAccount.balance, operator: currentUser.username, timestamp: Date.now(), status: 'success' };
        await callRevanstore('transactions', 'POST', trx);
        await callRevanstore('activity_logs', 'POST', { username: currentUser.username, action: 'topup', details: 'Top up ' + formatCurrency(amt) + ' ke ' + currentAccount.name, timestamp: Date.now() }).catch(function() {});
        hideLoading(); showReceipt(trx); showAlert('Berhasil!', 'success');
    } else { hideLoading(); showAlert('Gagal!', 'error'); }
}

// ==================== KURAS ====================
function showKurasFromAccount() {
    if (!currentAccount) return;
    document.getElementById('kurasAccountName').textContent = currentAccount.name;
    document.getElementById('kurasCurrentBalance').textContent = formatCurrency(currentAccount.balance);
    hideAllSections(); document.getElementById('kurasSection').style.display = 'block';
}
async function processKuras() {
    if (!currentAccount) return;
    var amt = parseAmount(document.getElementById('kurasAmount').value.trim()) || currentAccount.balance;
    if (amt <= 0 || amt > currentAccount.balance) { showAlert('Saldo tidak cukup!', 'error'); return; }
    showConfirm('KURAS', 'Kuras ' + formatCurrency(amt) + ' dari ' + currentAccount.name + '?', 'kuras', { amount: amt });
}
async function executeKuras(amt) {
    showLoading('Memproses...');
    var old = currentAccount.balance;
    var ok = await addCashToAccount(-amt);
    if (ok) {
        var trx = { type: 'kuras', deviceId: currentAccount.deviceId, accountName: currentAccount.name, amount: amt, oldBalance: old, newBalance: currentAccount.balance, operator: currentUser.username, timestamp: Date.now(), status: 'success' };
        await callRevanstore('transactions', 'POST', trx);
        await callRevanstore('activity_logs', 'POST', { username: currentUser.username, action: 'kuras', details: 'Kuras ' + formatCurrency(amt) + ' dari ' + currentAccount.name, timestamp: Date.now() }).catch(function() {});
        hideLoading(); showReceipt(trx); showAlert('Berhasil!', 'success');
    } else { hideLoading(); showAlert('Gagal!', 'error'); }
}

// ==================== ADD CASH ====================
async function addCashToAccount(amt) {
    if (!currentAuthToken) return false;
    try {
        var res = await callRvnstore('/Client/ExecuteCloudScript', 'POST', { FunctionName: "AddRp", FunctionParameter: { addValue: amt }, RevisionSelection: "Live", GeneratePlayStreamEvent: true }, currentAuthToken);
        if (res.data) {
            await new Promise(function(r) { setTimeout(r, 2000); });
            var info = await getUserInfoFromPlayFab();
            if (info) { currentAccount.balance = info.balance; currentAccount.name = info.name; currentAccount.facebook = info.facebook; currentAccount.facebookAvatarUrl = info.facebookAvatarUrl; currentAccount.playFabId = info.playFabId; showAccountInfo(currentAccount); return true; }
        }
        return false;
    } catch(e) { return false; }
}

// ==================== GANTI NAMA ====================
function showChangeNameSection() {
    if (!currentAccount) return;
    document.getElementById('changeNameAccountLabel').textContent = currentAccount.name;
    hideAllSections(); document.getElementById('changeNameSection').style.display = 'block';
}
async function changeAccountNameSimple() {
    var name = sanitize(document.getElementById('newAccountName').value.trim());
    if (!name) { showAlert('Masukkan nama baru!', 'error'); return; }
    if (!currentAccount || !currentAuthToken) { showAlert('Cari akun dulu!', 'error'); return; }
    showConfirm('GANTI NAMA', 'Ganti nama menjadi "' + name + '"?', 'changename', name);
}
async function executeChangeName(newName) {
    showLoading('Mengubah...');
    try {
        var res = await callRvnstore('/Client/UpdateUserTitleDisplayName', 'POST', { DisplayName: newName }, currentAuthToken);
        if (res.data && res.data.DisplayName) {
            var old = currentAccount.name; currentAccount.name = newName;
            document.getElementById('accountName').textContent = newName;
            await callRevanstore('transactions', 'POST', { type: 'gantinama', accountName: currentAccount.name, oldName: old, newName: newName, operator: currentUser.username, timestamp: Date.now(), status: 'success' });
            await callRevanstore('activity_logs', 'POST', { username: currentUser.username, action: 'gantinama', details: 'Ganti nama dari "' + old + '" ke "' + newName + '"', timestamp: Date.now() }).catch(function() {});
            hideAllSections();
            document.getElementById('receiptContent').innerHTML = '<div class="receipt-content"><div class="receipt-header"><h3><i class="fas fa-user-edit"></i> GANTI NAMA</h3></div><div class="receipt-details"><div class="receipt-row"><span>Lama:</span><span>' + sanitize(old) + '</span></div><div class="receipt-row"><span>Baru:</span><span style="color:#3b82f6;">' + sanitize(newName) + '</span></div></div></div><button class="btn btn-primary btn-block" onclick="window._goBackAccount()">KEMBALI</button>';
            document.getElementById('receiptSection').style.display = 'block';
            hideLoading(); showAlert('Berhasil!', 'success');
        } else { hideLoading(); showAlert('Gagal!', 'error'); }
    } catch(e) { hideLoading(); showAlert('Gagal!', 'error'); }
}
window._goBackAccount = function() { backToAccount(); };

// ==================== RECEIPT ====================
function showReceipt(trx) {
    hideAllSections();
    var typeText = trx.type === 'topup' ? 'TOP UP' : 'KURAS', sign = trx.type === 'topup' ? '+' : '-';
    document.getElementById('receiptContent').innerHTML = '<div class="receipt-content"><div class="receipt-header"><h3><i class="fas fa-bus"></i> BUSSID</h3></div><div class="receipt-details">' +
        '<div class="receipt-row"><span>Akun:</span><span>' + sanitize(trx.accountName) + '</span></div>' +
        '<div class="receipt-row"><span>Jenis:</span><span>' + typeText + '</span></div>' +
        '<div class="receipt-row"><span>Jumlah:</span><span style="color:' + (trx.type === 'topup' ? '#10b981' : '#f59e0b') + '">' + sign + formatCurrency(trx.amount) + '</span></div>' +
        '<div class="receipt-row"><span>Saldo Awal:</span><span>' + formatCurrency(trx.oldBalance) + '</span></div>' +
        '<div class="receipt-row"><span>Saldo Akhir:</span><span>' + formatCurrency(trx.newBalance) + '</span></div>' +
        '<div class="receipt-row"><span>Tanggal:</span><span>' + new Date(trx.timestamp).toLocaleString('id-ID') + '</span></div>' +
        '<div class="receipt-row"><span>Status:</span><span style="color:#10b981;">BERHASIL</span></div>' +
        '</div></div><div style="display:flex;gap:8px;margin-top:20px;"><button class="btn btn-primary" onclick="window._showTrxModal()" style="flex:1;">TRANSAKSI LAGI</button><button class="btn btn-secondary" onclick="window._goHome()" style="flex:1;">HOME</button></div>';
    document.getElementById('receiptSection').style.display = 'block';
}
window._showTrxModal = function() { var m = document.getElementById('trxLagiModal'); if (m) m.style.display = 'flex'; };
window._tutupTrxModal = function() { var m = document.getElementById('trxLagiModal'); if (m) m.style.display = 'none'; };
window._pilihTopup = function() { window._tutupTrxModal(); showTopupFromAccount(); };
window._pilihKuras = function() { window._tutupTrxModal(); showKurasFromAccount(); };
window._goHome = function() { showHome(); };

// ==================== HISTORY ====================
function showHistory() { hideAllSections(); document.getElementById('historySection').style.display = 'block'; loadHistory(); }
async function loadHistory() {
    showLoading('Mengambil data...');
    try {
        var data = await callRevanstore('transactions', 'GET');
        var list = document.getElementById('transactionsList');
        if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
            list.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:40px;"><i class="fas fa-inbox"></i><br>Belum ada transaksi</p>';
            hideLoading(); return;
        }
        var arr = Object.keys(data).map(function(k) { return { id: k, type: data[k].type, accountName: data[k].accountName, amount: data[k].amount, oldBalance: data[k].oldBalance, newBalance: data[k].newBalance, operator: data[k].operator, timestamp: data[k].timestamp }; }).sort(function(a, b) { return b.timestamp - a.timestamp; });
        var html = '';
        arr.forEach(function(t) {
            var typeText = t.type === 'topup' ? '<i class="fas fa-arrow-up"></i> TOP UP' : t.type === 'kuras' ? '<i class="fas fa-arrow-down"></i> KURAS' : '<i class="fas fa-edit"></i> GANTI NAMA';
            var sign = t.type === 'topup' ? '+' : t.type === 'kuras' ? '-' : '';
            html += '<div class="transaction-item ' + t.type + '"><div class="transaction-header"><div>' + sanitize(t.accountName) + '</div><div class="transaction-amount">' + sign + formatCurrency(t.amount) + '</div></div><div class="transaction-details"><div>' + typeText + '</div><div><i class="fas fa-calendar-alt"></i> ' + new Date(t.timestamp).toLocaleString('id-ID') + '</div></div><div class="transaction-balance"><span>Sebelum: ' + formatCurrency(t.oldBalance) + '</span><span>→</span><span>Sesudah: ' + formatCurrency(t.newBalance) + '</span></div></div>';
        });
        list.innerHTML = html;
        hideLoading();
    } catch(e) { hideLoading(); showAlert('Gagal!', 'error'); }
}
function showDeleteHistoryConfirm() {
    Swal.fire({ title: 'HAPUS SEMUA RIWAYAT', text: 'Yakin hapus semua?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', cancelButtonColor: '#64748b', confirmButtonText: 'HAPUS', cancelButtonText: 'BATAL' }).then(function(r) { if (r.isConfirmed) deleteAllHistory(); });
}
async function deleteAllHistory() {
    showLoading('Menghapus...');
    try {
        var result = await callRevanstore('transactions/delete-all', 'POST', {});
        hideLoading();
        Swal.fire({ icon: 'success', title: 'Berhasil!', text: (result.count || 0) + ' riwayat dihapus!', timer: 2000, showConfirmButton: false });
        if (document.getElementById('historySection').style.display === 'block') loadHistory();
    } catch(e) { hideLoading(); Swal.fire({ icon: 'error', title: 'Gagal!', confirmButtonColor: '#ef4444' }); }
}

// ==================== SETTINGS ====================
function showSettings() { hideAllSections(); document.getElementById('settingsSection').style.display = 'block'; updateProfileInfo(); }

// ==================== CONFIRM MODAL ====================
function showConfirm(title, message, action, data) {
    document.getElementById('modalConfirmTitle').innerHTML = sanitize(title);
    document.getElementById('modalConfirmMessage').innerHTML = sanitize(message);
    pendingAction = action; pendingData = data;
    document.getElementById('confirmModal').classList.add('active');
}
function cancelConfirm() { pendingAction = null; pendingData = null; document.getElementById('confirmModal').classList.remove('active'); }
async function confirmAction() {
    if (!pendingAction || !pendingData) return;
    document.getElementById('confirmModal').classList.remove('active');
    if (pendingAction === 'topup') await executeTopup(pendingData.amount);
    else if (pendingAction === 'kuras') await executeKuras(pendingData.amount);
    else if (pendingAction === 'changename') await executeChangeName(pendingData);
    pendingAction = null; pendingData = null;
}

// ==================== QUICK AMOUNTS ====================
function setupQuickAmounts() {
    var q = document.querySelector('.quick-amounts');
    if (q) q.innerHTML = '<button class="btn-quick" onclick="setAmount(\'2M\')">2M</button><button class="btn-quick" onclick="setAmount(\'1M\')">1M</button><button class="btn-quick" onclick="setAmount(\'500JT\')">500JT</button><button class="btn-quick" onclick="setAmount(\'100JT\')">100JT</button><button class="btn-quick" onclick="setAmount(\'50JT\')">50JT</button>';
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    var u = document.getElementById('username');
    if (u) u.addEventListener('keypress', function(e) { if (e.key === 'Enter') document.getElementById('password').focus(); });
    var p = document.getElementById('password');
    if (p) p.addEventListener('keypress', function(e) { if (e.key === 'Enter') login(); });
    var t = document.getElementById('topupAmount');
    if (t) t.addEventListener('keypress', function(e) { if (e.key === 'Enter') processTopup(); });
    var k = document.getElementById('kurasAmount');
    if (k) k.addEventListener('keypress', function(e) { if (e.key === 'Enter') processKuras(); });
    var d = document.getElementById('deviceId');
    if (d) d.addEventListener('keypress', function(e) { if (e.key === 'Enter') searchAccount(); });
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', async function() {
    document.addEventListener('contextmenu', function(e) { e.preventDefault(); });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I') || (e.ctrlKey && e.key === 'U')) { e.preventDefault(); return false; }
    });
    
    setupEventListeners();
    setupQuickAmounts();
    
    var ls = document.getElementById('loginScreen');
    ls.style.display = 'flex'; ls.style.alignItems = 'center'; ls.style.justifyContent = 'center';
    
    if (!fingerprint) fingerprint = await getFingerprint();
    
    var blocked = await checkIfBlocked();
    if (blocked) { showBlockedScreen(); return; }
    
    // Auto login dari session
    var saved = localStorage.getItem('bussid_session');
    if (saved) {
        try {
            var session = JSON.parse(saved);
            var age = Date.now() - (session.timestamp || 0);
            if (age > 7 * 24 * 60 * 60 * 1000) { localStorage.removeItem('bussid_session'); return; }
            
            document.getElementById('username').value = session.username;
            document.getElementById('password').value = session.password;
            
            var result = await callRevanstore('login', 'POST', { username: session.username, password: session.password });
            if (result && result.success && result.data) {
                var user = result.data;
                var expiryCheck = checkAccountExpiry(user);
                if (expiryCheck.expired) { showExpiredBanner(); return; }
                
                currentUser = { id: user.id, username: user.username, password: session.password, role: user.role || 'Operator', full_name: user.full_name || user.username, expiry_date: user.expiry_date || '' };
                ls.style.display = 'none';
                document.getElementById('mainApp').style.display = 'block';
                showHome(); updateProfileInfo();
                showAlert('Selamat datang kembali!', 'success');
            } else { localStorage.removeItem('bussid_session'); }
        } catch(e) { localStorage.removeItem('bussid_session'); }
    }
});