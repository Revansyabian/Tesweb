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
var loginInProgress = false;

// ==================== SCREENS (HANYA UNTUK IP/FP DIBLOCK) ====================
function showBlockedScreen() {
    document.body.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#fef2f2,#fee2e2,#fecaca);padding:20px;font-family:\'Segoe UI\',sans-serif;"><div style="background:#fff;border-radius:20px;padding:40px 30px;max-width:440px;width:100%;text-align:center;box-shadow:0 25px 60px rgba(0,0,0,0.1);border:1px solid #fecaca;"><div style="font-size:70px;color:#ef4444;margin-bottom:20px;"><i class="fas fa-shield-haltered"></i></div><h1 style="color:#dc2626;font-size:24px;margin-bottom:10px;">AKSES DITOLAK</h1><p style="color:#64748b;font-size:14px;margin-bottom:20px;">Maaf, akses Anda diblokir karena alasan keamanan.</p><button onclick="window.location.href=\'https://wa.me/' + WHATSAPP_NUMBER + '?text=Assalamualaikum%20admin%2C%20akses%20saya%20diblokir%20tolong%20dibantu\'" style="padding:12px 24px;background:#25D366;color:#fff;border:none;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer;font-family:inherit;"><i class="fab fa-whatsapp"></i> Hubungi Admin</button></div></div>';
}

// ==================== POPUP ALERTS (BANNED, BAN AKSES, FORCE LOGOUT) ====================
function showBannedPopup(until) {
    var untilText = until === 0 ? 'PERMANEN' : ('sampai ' + new Date(until).toLocaleString('id-ID'));
    Swal.fire({
        icon: 'error',
        title: '<i class="fas fa-ban" style="color:#ef4444;"></i> AKUN DIBANNED',
        html: '<p style="color:#64748b;">Maaf, akun Anda telah dibanned oleh admin.</p><p style="color:#991b1b;background:#fee2e2;padding:8px 12px;border-radius:8px;display:inline-block;"><i class="fas fa-clock"></i> Durasi: <b>' + untilText + '</b></p>',
        confirmButtonText: '<i class="fab fa-whatsapp"></i> Hubungi Admin',
        confirmButtonColor: '#25D366',
        showCancelButton: true,
        cancelButtonText: '<i class="fas fa-times"></i> Tutup',
        cancelButtonColor: '#64748b',
        allowOutsideClick: false
    }).then(function(result) {
        if (result.isConfirmed) {
            window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=Assalamualaikum%20admin%2C%20akun%20saya%20dibanned%20tolong%20dibantu', '_blank');
        }
    });
}

function showBanAksesPopup(until) {
    var untilText = until === 0 ? 'PERMANEN' : ('sampai ' + new Date(until).toLocaleString('id-ID'));
    Swal.fire({
        icon: 'warning',
        title: '<i class="fas fa-shield-haltered" style="color:#f59e0b;"></i> AKSES DIBLOKIR',
        html: '<p style="color:#64748b;">Maaf, akses Anda diblokir oleh admin.</p><p style="color:#991b1b;background:#fee2e2;padding:8px 12px;border-radius:8px;display:inline-block;"><i class="fas fa-clock"></i> Durasi: <b>' + untilText + '</b></p>',
        confirmButtonText: '<i class="fab fa-whatsapp"></i> Hubungi Admin',
        confirmButtonColor: '#25D366',
        showCancelButton: true,
        cancelButtonText: '<i class="fas fa-times"></i> Tutup',
        cancelButtonColor: '#64748b',
        allowOutsideClick: false
    }).then(function(result) {
        if (result.isConfirmed) {
            window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=Assalamualaikum%20admin%2C%20akses%20saya%20diblokir%20tolong%20dibantu', '_blank');
        }
    });
}

function showForceLogoutPopup(reason) {
    Swal.fire({
        icon: 'warning',
        title: '<i class="fas fa-eject" style="color:#f97316;"></i> AKUN DITANGGUHKAN',
        html: '<p style="color:#64748b;">' + (reason || 'Akun Anda ditangguhkan karena indikasi sharing akun.') + '</p><p style="color:#92400e;font-size:12px;"><i class="fas fa-info-circle"></i> Silakan hubungi admin untuk info lebih lanjut.</p>',
        confirmButtonText: '<i class="fab fa-whatsapp"></i> Hubungi Admin',
        confirmButtonColor: '#25D366',
        showCancelButton: true,
        cancelButtonText: '<i class="fas fa-times"></i> Tutup',
        cancelButtonColor: '#64748b',
        allowOutsideClick: false
    }).then(function(result) {
        if (result.isConfirmed) {
            window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=Assalamualaikum%20admin%2C%20akun%20saya%20ditangguhkan%20tolong%20dibantu', '_blank');
        }
    });
}

function showExpiredPopup() {
    Swal.fire({
        icon: 'warning',
        title: '<i class="fas fa-calendar-times"></i> AKUN EXPIRED',
        text: 'Masa aktif akun Anda telah habis. Silakan hubungi admin untuk perpanjang.',
        confirmButtonText: '<i class="fab fa-whatsapp"></i> Hubungi Admin',
        confirmButtonColor: '#25D366',
        allowOutsideClick: false
    }).then(function(result) {
        if (result.isConfirmed) {
            window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=Assalamualaikum%20admin%2C%20saya%20ingin%20perpanjang%20masa%20aktif', '_blank');
        }
        logout();
    });
}

// ==================== FINGERPRINT ====================
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
function sanitize(str) { if (!str) return ''; return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function formatCurrency(amount) { if (!amount && amount !== 0) return 'Rp 0'; return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(amount)); }
function parseAmount(input) {
    if (!input || input.trim() === '') return 0;
    var cleaned = input.toUpperCase().replace(/\s/g, '');
    if (cleaned === '2M') return MAX_TOPUP_AMOUNT;
    var multiplier = 1, cleanInput = cleaned;
    if (cleaned.includes('M') && !cleaned.includes('JT')) { multiplier = 1000000000; cleanInput = cleaned.replace('M', ''); }
    else if (cleaned.includes('JT')) { multiplier = 1000000; cleanInput = cleaned.replace('JT', ''); }
    else if (cleaned.includes('RB') || cleaned.includes('K')) { multiplier = 1000; cleanInput = cleaned.replace(/[KRB]/g, ''); }
    var number = parseFloat(cleanInput.replace(/\./g, '').replace(',', '.'));
    return isNaN(number) ? 0 : Math.min(Math.round(number * multiplier), MAX_TOPUP_AMOUNT);
}
function calculateRemainingDays(expiryDate) {
    if (!expiryDate) return -999;
    if (expiryDate.includes('9999')) return 999999;
    var parts = expiryDate.split('/');
    if (parts.length !== 3) return -999;
    var expiry = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
    var now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
}
function checkAccountExpiry(user) {
    if (!user || !user.expiry_date) return { expired: true };
    var daysLeft = calculateRemainingDays(user.expiry_date);
    return { expired: daysLeft <= 0 && daysLeft !== 999999, daysLeft: daysLeft };
}

// ==================== ALERT (INLINE) ====================
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
function showLoading(message) { var o = document.getElementById('loadingOverlay'), m = document.getElementById('loadingMessage'); if (o && m) { m.textContent = message || 'Memproses...'; o.style.display = 'flex'; } }
function hideLoading() { var o = document.getElementById('loadingOverlay'); if (o) o.style.display = 'none'; }

// ==================== API CALLS ====================
async function checkIfBlocked() {
    if (blockedChecked) return isBlocked;
    if (!fingerprint) fingerprint = await getFingerprint();
    try {
        var result = await callRevanstore('check_blocked', 'POST', { fingerprint: fingerprint });
        isBlocked = !!(result && result.blocked);
        blockedChecked = true;
    } catch(e) { isBlocked = false; blockedChecked = true; }
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
    var text = await res.text();
    if (!text || text === 'null') return null;
    return JSON.parse(text);
}

async function callRvnstore(endpoint, method, body, authToken) {
    var res = await fetch(API_RVNSTORE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: endpoint, method: method || 'POST', body: body || null, authToken: authToken || null }) });
    return await res.json();
}

// ==================== LOGIN (NO SPAM - POPUP NOTIF) ====================
async function login() {
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

        var userIP = 'unknown';
        try { var ipRes = await fetch('https://api.ipify.org?format=json'); var ipData = await ipRes.json(); userIP = ipData.ip || 'unknown'; } catch(e) {}
        if (!fingerprint) fingerprint = await getFingerprint();

        var result = await callRevanstore('login', 'POST', {
            username: username,
            password: password,
            ip: userIP,
            fingerprint: fingerprint
        });

        // CHECK BLOCKED
        if (result && result.blocked) { hideLoading(); showBlockedScreen(); return; }

        // CHECK BANNED → POPUP
        if (result && result.banned) {
            hideLoading();
            showBannedPopup(result.bannedUntil || 0);
            return;
        }

        // CHECK BAN AKSES → POPUP
        if (result && result.banAkses) {
            hideLoading();
            showBanAksesPopup(result.banAksesUntil || 0);
            return;
        }

        // CHECK FORCE LOGOUT → POPUP
        if (result && result.forceLogout) {
            hideLoading();
            showForceLogoutPopup('Akun Anda ditangguhkan karena indikasi sharing akun.');
            return;
        }

        // SUCCESS
        if (result && result.success && result.data) {
            var user = result.data;
            var expiryCheck = checkAccountExpiry(user);

            if (expiryCheck.expired) {
                hideLoading();
                showExpiredPopup();
                return;
            }

            currentUser = {
                id: user.id,
                username: user.username,
                password: password,
                role: user.role || 'Operator',
                full_name: user.full_name || user.username,
                expiry_date: user.expiry_date || ''
            };

            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            hideLoading();
            showHome();
            updateProfileInfo();

            Swal.fire({ icon: 'success', title: 'Login Berhasil!', text: 'Selamat datang, ' + currentUser.full_name + '!', timer: 2000, showConfirmButton: false });

            localStorage.setItem('bussid_session', JSON.stringify({ username: username, password: password, user_id: user.id, timestamp: Date.now() }));
        } else {
            hideLoading();
            Swal.fire({ icon: 'error', title: 'Oops...', text: 'User tidak ditemukan atau password salah!', confirmButtonColor: '#ef4444' });
        }
    } catch(e) { hideLoading(); Swal.fire({ icon: 'error', title: 'Oops...', text: 'Gagal menghubungkan ke server!', confirmButtonColor: '#ef4444' }); }
    finally { loginInProgress = false; }
}

// ==================== PROFILE ====================
function updateProfileInfo() {
    if (!currentUser) return;
    var ec = checkAccountExpiry(currentUser);
    var dt = ec.daysLeft === 999999 ? '♾️ Permanent' : ec.daysLeft < 0 ? '⏰ Habis ' + Math.abs(ec.daysLeft) + ' hari' : '📅 ' + ec.daysLeft + ' hari';
    document.getElementById('profileUsername').textContent = currentUser.username;
    document.getElementById('profileName').textContent = currentUser.full_name || currentUser.username;
    document.getElementById('profileRole').textContent = currentUser.role || 'Operator';
    document.getElementById('profileExpiry').innerHTML = '<span><i class="fas fa-calendar-alt"></i> ' + (currentUser.expiry_date || '-') + '</span> <span>' + dt + '</span>';
}
function logout() {
    currentUser = null; currentAccount = null; currentAuthToken = null;
    document.getElementById('mainApp').style.display = 'none';
    var ls = document.getElementById('loginScreen'); ls.style.display = 'flex'; ls.style.alignItems = 'center'; ls.style.justifyContent = 'center';
    document.getElementById('username').value = ''; document.getElementById('password').value = '';
    localStorage.removeItem('bussid_session');
    showAlert('Logout berhasil!', 'success');
}

// ==================== NAVIGATION ====================
function hideAllSections() {
    ['accountInfo','topupSection','kurasSection','changeNameSection','historySection','settingsSection','receiptSection'].forEach(function(s) { var el = document.getElementById(s); if (el) el.style.display = 'none'; });
    var sc = document.querySelector('.search-card'); if (sc) sc.style.display = 'none';
}
function showHome() { hideAllSections(); document.querySelector('.search-card').style.display = 'block'; }
function backToAccount() { if (currentAccount) { hideAllSections(); document.getElementById('accountInfo').style.display = 'block'; } else showHome(); }

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
        if (info) { currentAccount = { deviceId: cleanInput, name: info.name, balance: info.balance, facebook: info.facebook, facebookAvatarUrl: info.facebookAvatarUrl, playFabId: info.playFabId }; hideLoading(); return true; }
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
            var fb = { id: null, name: 'Tidak tertaut', email: null, isConnected: false }, fbAvatar = null;
            if (acc && acc.FacebookInfo) { fb = { id: acc.FacebookInfo.FacebookId, name: acc.FacebookInfo.FullName || '-', email: acc.FacebookInfo.Email || '-', isConnected: true }; if (fb.id) fbAvatar = 'https://graph.facebook.com/' + fb.id + '/picture?type=large'; }
            return { name, balance, facebook: fb, facebookAvatarUrl: fbAvatar, playFabId: pfid };
        }
    } catch(e) {}
    return null;
}
async function searchAccount() {
    var id = document.getElementById('deviceId').value.trim();
    if (!id) { showAlert('Masukkan Device ID!', 'error'); return; }
    var ok = await loginWithDeviceId(id);
    if (ok) { showAccountInfo(currentAccount); hideAllSections(); document.getElementById('accountInfo').style.display = 'block'; showAlert('Akun ditemukan!', 'success'); }
}
function showAccountInfo(acc) {
    document.getElementById('accountName').textContent = sanitize(acc.name);
    document.getElementById('accountBalance').textContent = formatCurrency(acc.balance);
    document.getElementById('playfabId').textContent = acc.playFabId || '-';
    var c = document.getElementById('profilePhoto'); if (c) { c.innerHTML = ''; if (acc.facebookAvatarUrl) { var img = document.createElement('img'); img.src = acc.facebookAvatarUrl; img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%'; img.onerror = function() { c.innerHTML = '<i class="fas fa-user"></i>'; }; c.appendChild(img); } else c.innerHTML = '<i class="fas fa-user"></i>'; }
    var d = document.getElementById('facebookDetails');
    if (d) { if (acc.facebook && acc.facebook.isConnected) d.innerHTML = '<div><span style="color:#1877F2;"><i class="fas fa-check-circle"></i> TERHUBUNG</span> - ' + sanitize(acc.facebook.name) + '</div>'; else d.innerHTML = '<div><span style="color:#ffaa00;"><i class="fas fa-exclamation-triangle"></i> TIDAK TERHUBUNG</span></div>'; }
}
function refreshAccountInfo() {
    if (!currentAccount) { showAlert('Cari akun dulu!', 'error'); return; }
    showLoading('Refresh...');
    setTimeout(async function() {
        var info = await getUserInfoFromPlayFab();
        if (info) { currentAccount.balance = info.balance; currentAccount.name = info.name; currentAccount.facebook = info.facebook; currentAccount.facebookAvatarUrl = info.facebookAvatarUrl; showAccountInfo(currentAccount); hideLoading(); showAlert('Updated!', 'success'); }
        else hideLoading();
    }, 1000);
}

// ==================== AMOUNT ====================
function setAmount(a) { document.getElementById('topupAmount').value = a; validateTopupAmount(); }
function validateTopupAmount() {
    var input = document.getElementById('topupAmount'), preview = document.getElementById('amountPreview'), pv = document.getElementById('amountPreviewValue');
    var amount = parseAmount(input.value);
    if (amount > 0 && input.value.trim() !== '') { preview.style.display = 'block'; pv.textContent = formatCurrency(amount); }
    else preview.style.display = 'none';
}

// ==================== TOP UP ====================
function showTopupFromAccount() { if (!currentAccount) return; document.getElementById('topupAccountName').textContent = currentAccount.name; document.getElementById('topupCurrentBalance').textContent = formatCurrency(currentAccount.balance); hideAllSections(); document.getElementById('topupSection').style.display = 'block'; }
async function processTopup() { if (!currentAccount) return; var amt = parseAmount(document.getElementById('topupAmount').value.trim()); if (amt <= 0) { showAlert('Jumlah tidak valid!', 'error'); return; } showConfirm('TOP UP', 'Top up ' + formatCurrency(amt) + '?', 'topup', { amount: amt }); }
async function executeTopup(amt) {
    showLoading('Memproses...'); var old = currentAccount.balance; var ok = await addCashToAccount(amt);
    if (ok) {
        var trx = { type: 'topup', deviceId: currentAccount.deviceId, accountName: currentAccount.name, amount: amt, oldBalance: old, newBalance: currentAccount.balance, operator: currentUser.username, timestamp: Date.now(), status: 'success' };
        await callRevanstore('transactions', 'POST', trx);
        hideLoading(); showReceipt(trx); showAlert('Berhasil!', 'success');
    } else { hideLoading(); showAlert('Gagal!', 'error'); }
}

// ==================== KURAS ====================
function showKurasFromAccount() { if (!currentAccount) return; document.getElementById('kurasAccountName').textContent = currentAccount.name; document.getElementById('kurasCurrentBalance').textContent = formatCurrency(currentAccount.balance); hideAllSections(); document.getElementById('kurasSection').style.display = 'block'; }
async function processKuras() { if (!currentAccount) return; var amt = parseAmount(document.getElementById('kurasAmount').value.trim()) || currentAccount.balance; if (amt <= 0 || amt > currentAccount.balance) { showAlert('Saldo tidak cukup!', 'error'); return; } showConfirm('KURAS', 'Kuras ' + formatCurrency(amt) + '?', 'kuras', { amount: amt }); }
async function executeKuras(amt) {
    showLoading('Memproses...'); var old = currentAccount.balance; var ok = await addCashToAccount(-amt);
    if (ok) {
        var trx = { type: 'kuras', deviceId: currentAccount.deviceId, accountName: currentAccount.name, amount: amt, oldBalance: old, newBalance: currentAccount.balance, operator: currentUser.username, timestamp: Date.now(), status: 'success' };
        await callRevanstore('transactions', 'POST', trx);
        hideLoading(); showReceipt(trx); showAlert('Berhasil!', 'success');
    } else { hideLoading(); showAlert('Gagal!', 'error'); }
}

// ==================== ADD CASH ====================
async function addCashToAccount(amt) {
    if (!currentAuthToken) return false;
    try {
        var res = await callRvnstore('/Client/ExecuteCloudScript', 'POST', { FunctionName: "AddRp", FunctionParameter: { addValue: amt }, RevisionSelection: "Live", GeneratePlayStreamEvent: true }, currentAuthToken);
        if (res.data) { await new Promise(function(r) { setTimeout(r, 2000); }); var info = await getUserInfoFromPlayFab(); if (info) { currentAccount.balance = info.balance; currentAccount.name = info.name; showAccountInfo(currentAccount); return true; } }
        return false;
    } catch(e) { return false; }
}

// ==================== GANTI NAMA ====================
function showChangeNameSection() { if (!currentAccount) return; document.getElementById('changeNameAccountLabel').textContent = currentAccount.name; hideAllSections(); document.getElementById('changeNameSection').style.display = 'block'; }
async function changeAccountNameSimple() {
    var name = sanitize(document.getElementById('newAccountName').value.trim());
    if (!name) { showAlert('Masukkan nama baru!', 'error'); return; }
    if (!currentAccount || !currentAuthToken) { showAlert('Cari akun dulu!', 'error'); return; }
    showConfirm('GANTI NAMA', 'Ganti ke "' + name + '"?', 'changename', name);
}
async function executeChangeName(newName) {
    showLoading('Mengubah...');
    try {
        var res = await callRvnstore('/Client/UpdateUserTitleDisplayName', 'POST', { DisplayName: newName }, currentAuthToken);
        if (res.data && res.data.DisplayName) {
            var old = currentAccount.name; currentAccount.name = newName; document.getElementById('accountName').textContent = newName;
            await callRevanstore('transactions', 'POST', { type: 'gantinama', accountName: newName, oldName: old, newName: newName, operator: currentUser.username, timestamp: Date.now(), status: 'success' });
            hideAllSections();
            document.getElementById('receiptContent').innerHTML = '<h3>GANTI NAMA</h3><p>' + sanitize(old) + ' → <b>' + sanitize(newName) + '</b></p><button class="btn btn-primary btn-block" onclick="backToAccount()">KEMBALI</button>';
            document.getElementById('receiptSection').style.display = 'block';
            hideLoading(); showAlert('Berhasil!', 'success');
        } else { hideLoading(); showAlert('Gagal!', 'error'); }
    } catch(e) { hideLoading(); showAlert('Gagal!', 'error'); }
}

// ==================== RECEIPT ====================
function showReceipt(trx) {
    hideAllSections();
    var typeText = trx.type === 'topup' ? 'TOP UP' : 'KURAS', sign = trx.type === 'topup' ? '+' : '-';
    document.getElementById('receiptContent').innerHTML = '<h3>BUSSID - ' + typeText + '</h3><p>Akun: ' + sanitize(trx.accountName) + '</p><p>Jumlah: <b style="color:' + (trx.type === 'topup' ? '#10b981' : '#f59e0b') + '">' + sign + formatCurrency(trx.amount) + '</b></p><p>Saldo Akhir: ' + formatCurrency(trx.newBalance) + '</p><p>Status: <span style="color:#10b981;">BERHASIL</span></p><div style="display:flex;gap:8px;margin-top:20px;"><button class="btn btn-primary" onclick="window._showTrxModal()" style="flex:1;">TRANSAKSI LAGI</button><button class="btn btn-secondary" onclick="showHome()" style="flex:1;">HOME</button></div>';
    document.getElementById('receiptSection').style.display = 'block';
}
window._showTrxModal = function() { var m = document.getElementById('trxLagiModal'); if (m) m.style.display = 'flex'; };
window._tutupTrxModal = function() { var m = document.getElementById('trxLagiModal'); if (m) m.style.display = 'none'; };
window._pilihTopup = function() { window._tutupTrxModal(); showTopupFromAccount(); };
window._pilihKuras = function() { window._tutupTrxModal(); showKurasFromAccount(); };

// ==================== HISTORY ====================
function showHistory() { hideAllSections(); document.getElementById('historySection').style.display = 'block'; loadHistory(); }
async function loadHistory() {
    showLoading('Mengambil data...');
    try {
        var data = await callRevanstore('transactions', 'GET');
        var list = document.getElementById('transactionsList');
        if (!data || typeof data !== 'object' || Object.keys(data).length === 0) { list.innerHTML = '<p style="text-align:center;padding:40px;">Belum ada transaksi</p>'; hideLoading(); return; }
        var arr = Object.keys(data).map(function(k) { return { ...data[k], id: k }; }).sort(function(a, b) { return b.timestamp - a.timestamp; });
        var html = '';
        arr.forEach(function(t) {
            var typeText = t.type === 'topup' ? 'TOP UP' : t.type === 'kuras' ? 'KURAS' : 'GANTI NAMA';
            var sign = t.type === 'topup' ? '+' : t.type === 'kuras' ? '-' : '';
            html += '<div class="transaction-item"><b>' + sanitize(t.accountName) + '</b> - ' + typeText + ' ' + sign + formatCurrency(t.amount) + ' | ' + new Date(t.timestamp).toLocaleString('id-ID') + '</div>';
        });
        list.innerHTML = html;
        hideLoading();
    } catch(e) { hideLoading(); showAlert('Gagal!', 'error'); }
}
function showDeleteHistoryConfirm() { Swal.fire({ title: 'HAPUS SEMUA', text: 'Yakin?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'HAPUS', cancelButtonText: 'BATAL' }).then(function(r) { if (r.isConfirmed) deleteAllHistory(); }); }
async function deleteAllHistory() {
    showLoading('Menghapus...');
    try { await callRevanstore('transactions/delete-all', 'POST', {}); hideLoading(); Swal.fire({ icon: 'success', title: 'Berhasil!', timer: 2000 }); if (document.getElementById('historySection').style.display === 'block') loadHistory(); }
    catch(e) { hideLoading(); Swal.fire({ icon: 'error', title: 'Gagal!' }); }
}

// ==================== SETTINGS ====================
function showSettings() { hideAllSections(); document.getElementById('settingsSection').style.display = 'block'; updateProfileInfo(); }

// ==================== CONFIRM ====================
function showConfirm(title, message, action, data) {
    document.getElementById('modalConfirmTitle').innerHTML = title;
    document.getElementById('modalConfirmMessage').innerHTML = message;
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
    if (q) q.innerHTML = '<button onclick="setAmount(\'2M\')">2M</button><button onclick="setAmount(\'1M\')">1M</button><button onclick="setAmount(\'500JT\')">500JT</button><button onclick="setAmount(\'100JT\')">100JT</button><button onclick="setAmount(\'50JT\')">50JT</button>';
}

// ==================== EVENTS ====================
function setupEventListeners() {
    var u = document.getElementById('username'); if (u) u.addEventListener('keypress', function(e) { if (e.key === 'Enter') document.getElementById('password').focus(); });
    var p = document.getElementById('password'); if (p) p.addEventListener('keypress', function(e) { if (e.key === 'Enter') login(); });
    var t = document.getElementById('topupAmount'); if (t) t.addEventListener('keypress', function(e) { if (e.key === 'Enter') processTopup(); });
    var d = document.getElementById('deviceId'); if (d) d.addEventListener('keypress', function(e) { if (e.key === 'Enter') searchAccount(); });
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', async function() {
    document.addEventListener('contextmenu', function(e) { e.preventDefault(); });
    document.addEventListener('keydown', function(e) { if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I') || (e.ctrlKey && e.key === 'U')) { e.preventDefault(); return false; } });
    setupEventListeners(); setupQuickAmounts();
    var ls = document.getElementById('loginScreen'); ls.style.display = 'flex'; ls.style.alignItems = 'center'; ls.style.justifyContent = 'center';
    if (!fingerprint) fingerprint = await getFingerprint();
    var blocked = await checkIfBlocked(); if (blocked) { showBlockedScreen(); return; }
    var saved = localStorage.getItem('bussid_session');
    if (saved) {
        try {
            var session = JSON.parse(saved);
            if (Date.now() - (session.timestamp || 0) > 7 * 24 * 60 * 60 * 1000) { localStorage.removeItem('bussid_session'); return; }
            document.getElementById('username').value = session.username;
            document.getElementById('password').value = session.password;
            var result = await callRevanstore('login', 'POST', { username: session.username, password: session.password });
            if (result && result.success && result.data) {
                var user = result.data;
                if (checkAccountExpiry(user).expired) { showExpiredPopup(); return; }
                currentUser = { id: user.id, username: user.username, password: session.password, role: user.role || 'Operator', full_name: user.full_name || user.username, expiry_date: user.expiry_date || '' };
                ls.style.display = 'none'; document.getElementById('mainApp').style.display = 'block';
                showHome(); updateProfileInfo(); showAlert('Selamat datang kembali!', 'success');
            } else localStorage.removeItem('bussid_session');
        } catch(e) { localStorage.removeItem('bussid_session'); }
    }
});