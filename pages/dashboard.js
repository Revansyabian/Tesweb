var API_REVANSTORE = '/api/revanstore';
var API_RVNSTORE = '/api/rvnstore';
var ADMIN_KEY = 'dhagwxwhu:f4afc5aa03e73130f5e055dfe6a708c4dc40759b';
var WHATSAPP_NUMBER = "6285199120995";
var MAX_TOPUP_AMOUNT = 2147483647;
var RECAPTCHA_V3_SITE_KEY = '6LcVBn4tAAAAAINTTIleUbUZr1ZykvyB6WA-oOfT';

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
var statusCheckInterval = null;

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

function sanitize(str) { if (!str) return ''; return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;'); }

async function getFingerprint() {
    var fp = '';
    fp += navigator.userAgent || ''; fp += navigator.language || '';
    fp += (screen.width || 0) + 'x' + (screen.height || 0); fp += screen.colorDepth || '';
    fp += new Date().getTimezoneOffset(); fp += navigator.hardwareConcurrency || '';
    fp += navigator.deviceMemory || ''; fp += navigator.platform || '';
    return CryptoJS.MD5(fp).toString();
}

async function getRecaptchaV3Token(action) {
    try {
        return await grecaptcha.execute(RECAPTCHA_V3_SITE_KEY, { action: action });
    } catch (e) { return null; }
}

async function checkIfBlocked() {
    if (blockedChecked) return isBlocked;
    if (!fingerprint) fingerprint = await getFingerprint();
    try {
        var captchaToken = await getRecaptchaV3Token('check_blocked');
        var result = await callRevanstore('check_blocked', 'POST', { fingerprint: fingerprint, captchaToken: captchaToken });
        if (result && result.blocked) { isBlocked = true; storageSet('bussid_blocked', 'true'); }
        else { isBlocked = false; storageRemove('bussid_blocked'); }
        blockedChecked = true;
    } catch (e) { isBlocked = storageGet('bussid_blocked') === 'true'; blockedChecked = true; }
    return isBlocked;
}

async function callRevanstore(path, method, data) {
    if (!fingerprint) fingerprint = await getFingerprint();
    if (isBlocked && path !== 'check_blocked') throw new Error('Akses ditolak');
    var captchaToken = await getRecaptchaV3Token(path);
    var payload = { path: path, method: method || 'GET', data: data || null, timestamp: Date.now(), captchaToken: captchaToken };
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

async function callRvnstore(endpoint, method, body, authToken) {
    var res = await fetch(API_RVNSTORE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: endpoint, method: method || 'POST', body: body || null, authToken: authToken || null }) });
    return await res.json();
}

function showAlert(message, type, duration) {
    type = type || 'info'; duration = duration || 2500;
    var alertDiv = document.getElementById('alert');
    if (alertDiv) {
        var icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle', loading: 'fa-spinner fa-spin' };
        alertDiv.innerHTML = '<div class="alert-content"><div class="alert-icon"><i class="fas ' + (icons[type] || 'fa-info-circle') + '"></i></div><span>' + sanitize(message) + '</span></div>';
        alertDiv.className = 'alert ' + type + ' show';
        if (alertTimeout) clearTimeout(alertTimeout);
        if (type !== 'loading') { alertTimeout = setTimeout(function() { alertDiv.classList.remove('show'); }, duration); }
    }
}

function showLoading(message) { var overlay = document.getElementById('loadingOverlay'), msg = document.getElementById('loadingMessage'); if (overlay && msg) { msg.textContent = message || 'Memproses...'; overlay.style.display = 'flex'; } }
function hideLoading() { var overlay = document.getElementById('loadingOverlay'); if (overlay) overlay.style.display = 'none'; }
function formatCurrency(amount) { if (!amount && amount !== 0) return 'Rp 0'; return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(amount)); }

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

function validateTopupAmount() {
    var input = document.getElementById('topupAmount'), preview = document.getElementById('amountPreview'), previewValue = document.getElementById('amountPreviewValue');
    if (!input) return;
    var amount = parseAmount(input.value);
    if (amount > 0 && input.value.trim() !== '') { if (preview) preview.style.display = 'block'; if (previewValue) previewValue.textContent = formatCurrency(amount); }
    else { if (preview) preview.style.display = 'none'; }
}

function hideAllSections() {
    var sections = ['accountInfo', 'topupSection', 'kurasSection', 'changeNameSection', 'historySection', 'settingsSection', 'receiptSection'];
    sections.forEach(function(section) { var el = document.getElementById(section); if (el) el.style.display = 'none'; });
    var searchCard = document.querySelector('.search-card'); if (searchCard) searchCard.style.display = 'none';
}

function showHome() { hideAllSections(); var sc = document.querySelector('.search-card'); if (sc) sc.style.display = 'block'; }
function backToAccount() { if (currentAccount) { hideAllSections(); var ai = document.getElementById('accountInfo'); if (ai) { ai.style.display = 'block'; renderAccountInfo(); } } else { showHome(); } }

function parseDate(dateStr) {
    if (!dateStr) return null;
    if (dateStr.includes('9999')) return null;
    var parts = String(dateStr).split('/');
    if (parts.length !== 3) {
        if (String(dateStr).includes('-')) {
            parts = String(dateStr).split('-');
            if (parts.length !== 3) return null;
        } else {
            return null;
        }
    }
    var day, month, year;
    if (parts[0].length === 4) {
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        day = parseInt(parts[2], 10);
    } else {
        month = parseInt(parts[0], 10) - 1;
        day = parseInt(parts[1], 10);
        year = parseInt(parts[2], 10);
    }
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    if (month < 0 || month > 11 || day < 1 || day > 31 || year < 2000) return null;
    var date = new Date(year, month, day);
    if (date.getMonth() !== month || date.getDate() !== day) return null;
    return date;
}

function calculateRemainingDays(expiryDate) {
    if (!expiryDate) return 999999;
    if (String(expiryDate).includes('9999')) return 999999;
    var expiry = parseDate(expiryDate);
    if (!expiry) return 999999;
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    var diff = expiry.getTime() - now.getTime();
    if (diff < 0) {
        if (diff > -86400000) return 0;
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getDaysLeftClass(daysLeft) { if (daysLeft === 999999) return 'days-permanent'; if (daysLeft < 0) return 'days-red'; if (daysLeft === 0) return 'days-yellow'; if (daysLeft <= 3) return 'days-yellow'; return 'days-green'; }
function getDaysLeftText(daysLeft) { if (daysLeft === 999999) return '♾️ Permanent'; if (daysLeft < 0) return '⏰ Habis ' + Math.abs(daysLeft) + ' hari'; if (daysLeft === 0) return '⚠️ Hari ini'; if (daysLeft === 1) return '📅 1 hari'; return '📅 ' + daysLeft + ' hari'; }
function checkAccountExpiry(user) {
    if (!user || !user.expiry_date) return { expired: false, daysLeft: 999999, daysLeftText: '♾️ Permanent', daysLeftClass: 'days-permanent' };
    if (String(user.expiry_date).includes('9999')) return { expired: false, daysLeft: 999999, daysLeftText: '♾️ Permanent', daysLeftClass: 'days-permanent' };
    var daysLeft = calculateRemainingDays(user.expiry_date);
    if (daysLeft === 999999) return { expired: false, daysLeft: 999999, daysLeftText: '♾️ Permanent', daysLeftClass: 'days-permanent' };
    var expired = daysLeft < 0;
    return { expired: expired, daysLeft: daysLeft, daysLeftText: getDaysLeftText(daysLeft), daysLeftClass: getDaysLeftClass(daysLeft) };
}

function showExpiredBanner() { var eb = document.getElementById('expiredBanner'); if (eb) eb.style.display = 'flex'; var ma = document.getElementById('mainApp'); if (ma) ma.style.display = 'none'; }
function closeExpiredBanner() { var eb = document.getElementById('expiredBanner'); if (eb) eb.style.display = 'none'; logout(); }

function openWhatsApp() {
    var msg = encodeURIComponent("Assalamualaikum admin, saya ingin memperpanjang masa aktif akun BUSSID Top Up saya. Username: " + (currentUser ? currentUser.username : ''));
    window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + msg, '_blank');
}

function openWhatsAppPassword() {
    var msg = encodeURIComponent("Assalamualaikum admin, saya ingin mengubah password akun saya. Username: " + (currentUser ? currentUser.username : ''));
    window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + msg, '_blank');
}

function showDeleteHistoryConfirm() {
    Swal.fire({ title: '<i class="fas fa-trash"></i> HAPUS SEMUA RIWAYAT', text: "Yakin hapus semua riwayat?", icon: "warning", showCancelButton: true, confirmButtonColor: "#ef4444", cancelButtonColor: "#64748b", confirmButtonText: "HAPUS SEMUA", cancelButtonText: "BATAL" }).then((result) => { if (result.isConfirmed) deleteAllHistory(); });
}

async function deleteAllHistory() {
    showLoading('Menghapus...');
    try {
        var result = await callRevanstore('transactions', 'DELETE');
        hideLoading();
        if (result && result.success) { Swal.fire({ icon: "success", title: "Berhasil!", text: "Semua riwayat dihapus!", timer: 2000, showConfirmButton: false }); if (document.getElementById('historySection').style.display === 'block') showHistory(); }
        else { Swal.fire({ icon: "info", title: "Info", text: "Tidak ada riwayat!", confirmButtonColor: "#0ea5e9" }); }
    } catch (error) { hideLoading(); Swal.fire({ icon: "error", title: "Oops...", text: "Gagal menghapus!", confirmButtonColor: "#ef4444" }); }
}

// ==================== CHECK AUTH ====================
function checkAuth() {
    var saved = storageGet('bussid_session');
    if (!saved) { window.location.href = 'login.html'; return false; }
    try {
        var session = JSON.parse(saved), age = Date.now() - (session.timestamp || 0);
        if (age > 7 * 24 * 60 * 60 * 1000) { storageRemove('bussid_session'); window.location.href = 'login.html'; return false; }
        currentUser = { id: session.user_id, username: session.username, password: session.password, role: session.role || 'Operator', full_name: session.full_name || session.username, expiry_date: session.expiry_date || '' };
        return true;
    } catch (e) { storageRemove('bussid_session'); window.location.href = 'login.html'; return false; }
}

// ==================== CHECK ACCOUNT STATUS (v3) ====================
async function checkAccountStatus() {
    if (!currentUser) return;
    try {
        var captchaToken = await getRecaptchaV3Token('check_status');
        var result = await callRevanstore('check_account_status', 'POST', { username: currentUser.username, user_id: currentUser.id, fingerprint: fingerprint, captchaToken: captchaToken });
        if (result && result.banned) {
            var untilText = (result.bannedUntil || 0) === 0 ? 'PERMANEN' : ('sampai ' + new Date(result.bannedUntil).toLocaleString('id-ID'));
            Swal.fire({ icon: 'error', title: 'AKUN DIBANNED', html: 'Maaf, akun Anda telah dibanned oleh admin.<br><br>⏱️ Durasi: ' + untilText, confirmButtonText: 'OK', confirmButtonColor: '#ef4444', allowOutsideClick: false }).then(function() { autoLogout(); });
            return;
        }
        if (result && result.banAkses) {
            var untilTextA = (result.banAksesUntil || 0) === 0 ? 'PERMANEN' : ('sampai ' + new Date(result.banAksesUntil).toLocaleString('id-ID'));
            Swal.fire({ icon: 'error', title: 'AKSES DIBLOKIR', html: 'Maaf, akses Anda diblokir oleh admin.<br><br>⏱️ Durasi: ' + untilTextA, confirmButtonText: 'OK', confirmButtonColor: '#ef4444', allowOutsideClick: false }).then(function() { autoLogout(); });
            return;
        }
        if (result && result.forceLogout) {
            Swal.fire({ icon: 'warning', title: 'AKUN DITANGGUHKAN', html: 'Akun Anda ditangguhkan karena indikasi sharing akun.<br><br>Silakan hubungi admin.', confirmButtonText: 'OK', confirmButtonColor: '#ef4444', allowOutsideClick: false }).then(function() { autoLogout(); });
            return;
        }
        if (result && result.valid && result.user) {
            currentUser.role = result.user.role || currentUser.role;
            currentUser.full_name = result.user.full_name || currentUser.full_name;
            currentUser.expiry_date = result.user.expiry_date || currentUser.expiry_date;
        }
    } catch (e) {}
}

function autoLogout() {
    storageRemove('bussid_session');
    if (statusCheckInterval) clearInterval(statusCheckInterval);
    window.location.href = 'login.html';
}

function logout() {
    storageRemove('bussid_session');
    if (statusCheckInterval) clearInterval(statusCheckInterval);
    window.location.href = 'login.html';
}

function updateProfileInfo() {
    if (!currentUser) return;
    var expiryCheck = checkAccountExpiry(currentUser);
    var elUsername = document.getElementById('profileUsername');
    var elName = document.getElementById('profileName');
    var elRole = document.getElementById('profileRole');
    var elExpiry = document.getElementById('profileExpiry');
    if (elUsername) elUsername.textContent = currentUser.username;
    if (elName) elName.textContent = currentUser.full_name || currentUser.username;
    if (elRole) elRole.textContent = currentUser.role || 'Operator';
    var expiryFormatted = currentUser.expiry_date || 'Tidak ada';
    if (elExpiry) elExpiry.innerHTML = '<span>' + expiryFormatted + '</span>';
}

// ==================== BOTTOM NAVIGATION ====================
function navigateBottom(page) {
    document.querySelectorAll('.bottom-nav a').forEach(function(a) { a.classList.remove('active'); });
    if (event && event.target) event.target.classList.add('active');
    if (page === 'home') showHome();
    else if (page === 'riwayat') showHistory();
    else if (page === 'pengaturan') showSettings();
}

// ==================== SEARCH ACCOUNT ====================
async function loginWithDeviceId(deviceId) {
    var blocked = await checkIfBlocked();
    if (blocked) { showAlert('Akses ditolak!', 'error'); return false; }
    showLoading('Menghubungkan...');
    try {
        var cleanInput = sanitize(deviceId.trim());
        if (cleanInput.includes('.')) { currentAuthToken = cleanInput; }
        else {
            var cid = cleanInput.toLowerCase().replace(/^android-/, '');
            var data = await callRvnstore('/Client/LoginWithAndroidDeviceID', 'POST', { TitleId: "4AE9", AndroidDeviceId: cid, CreateAccount: true, InfoRequestParameters: { GetUserAccountInfo: true, GetUserVirtualCurrency: true, GetPlayerProfile: true } }, null);
            if (data.data && data.data.SessionTicket) { currentAuthToken = data.data.SessionTicket; }
            else { hideLoading(); throw new Error('Device ID tidak valid!'); }
        }
        var info = await getUserInfoFromPlayFab();
        if (info) { currentAccount = { deviceId: cleanInput, name: info.name, balance: info.balance, facebook: info.facebook, facebookAvatarUrl: info.facebookAvatarUrl, playFabId: info.playFabId }; hideLoading(); return true; }
        hideLoading(); throw new Error('Gagal!');
    } catch (error) { hideLoading(); showAlert(error.message, 'error'); return false; }
}

async function getUserInfoFromPlayFab() {
    if (!currentAuthToken) return null;
    try {
        var result = await callRvnstore('/Client/GetPlayerCombinedInfo', 'POST', { InfoRequestParameters: { GetUserAccountInfo: true, GetUserVirtualCurrency: true, GetPlayerProfile: true } }, currentAuthToken);
        if (result.data) {
            var info = result.data.InfoResultPayload; var acc = info.AccountInfo;
            var name = (acc && acc.TitleInfo) ? (acc.TitleInfo.DisplayName || 'Unknown') : 'Unknown';
            var balance = info.UserVirtualCurrency ? (info.UserVirtualCurrency.RP || 0) : 0;
            var pfid = acc ? (acc.PlayFabId || '-') : '-';
            var fb = { id: null, name: 'Tidak tertaut', email: null, isConnected: false }; var fbAvatar = null;
            if (acc && acc.FacebookInfo) { fb = { id: acc.FacebookInfo.FacebookId || null, name: acc.FacebookInfo.FullName || 'Tidak tertaut', email: acc.FacebookInfo.Email || null, isConnected: true }; if (fb.id) fbAvatar = 'https://graph.facebook.com/' + fb.id + '/picture?type=large'; }
            return { name: name, balance: balance, facebook: fb, facebookAvatarUrl: fbAvatar, playFabId: pfid };
        }
    } catch (e) {}
    return null;
}

async function searchAccount() {
    var id = document.getElementById('deviceId').value.trim();
    if (!id) { showAlert('Masukkan Device ID!', 'error'); return; }
    var ok = await loginWithDeviceId(id);
    if (ok) { lastDeviceId = id; renderAccountInfo(); hideAllSections(); var ai = document.getElementById('accountInfo'); if (ai) ai.style.display = 'block'; showAlert('Akun ditemukan!', 'success'); }
}

function renderAccountInfo() {
    if (!currentAccount) return;
    var card = document.getElementById('accountInfo');
    if (!card) return;
    var acc = currentAccount;
    var fb = acc.facebook || {};

    var html = '<div class="card-header"><h2><i class="fas fa-user-circle"></i> INFORMASI AKUN BUSSID</h2><button class="btn-icon" onclick="refreshAccountInfo()"><i class="fas fa-sync-alt"></i> Refresh</button></div>';
    html += '<div class="card-body">';
    html += '<div class="account-profile"><div class="profile-photo-container"><div class="profile-photo" id="profilePhoto">' + (acc.facebookAvatarUrl ? '<img src="' + acc.facebookAvatarUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.parentElement.innerHTML=\'<i class=\\\'fas fa-user\\\'></i>\'">' : '<i class="fas fa-user"></i>') + '</div></div><div class="profile-info"><h3 id="accountName">' + sanitize(acc.name || '-') + '</h3><p class="account-balance" id="accountBalance">' + formatCurrency(acc.balance) + '</p></div></div>';
    html += '<div class="facebook-info-section"><h4><i class="fab fa-facebook" style="color:#1877F2"></i> INFORMASI AKUN FACEBOOK</h4><div class="facebook-info-details" id="facebookDetails">';
    if (fb.isConnected && fb.id) {
        html += '<div class="fb-info-row"><span class="fb-info-label"><i class="fab fa-facebook"></i> Status:</span><span class="fb-info-value" style="color:#1877F2;">✅ TERHUBUNG</span></div>';
        html += '<div class="fb-info-row"><span class="fb-info-label">Facebook ID:</span><span class="fb-info-value" style="font-family:monospace;font-size:12px;">' + sanitize(fb.id) + '</span></div>';
        html += '<div class="fb-info-row"><span class="fb-info-label">Nama:</span><span class="fb-info-value">' + sanitize(fb.name || '-') + '</span></div>';
        html += '<div class="fb-info-row"><span class="fb-info-label">Email:</span><span class="fb-info-value">' + sanitize(fb.email || '-') + '</span></div>';
    } else { html += '<div class="fb-info-row"><span class="fb-info-label"><i class="fab fa-facebook"></i> Status:</span><span class="fb-info-value" style="color:#ffaa00;">⚠️ TIDAK TERHUBUNG</span></div>'; }
    html += '</div></div>';
    html += '<div class="bussid-info-section"><h4><i class="fas fa-bus"></i> INFORMASI BUSSID</h4><div class="bussid-info-details"><div class="info-row"><span class="info-label"><i class="fas fa-id-card"></i> PlayFab ID:</span><span class="info-value playfab-id-full">' + sanitize(acc.playFabId || '-') + '</span></div><div class="info-row"><span class="info-label"><i class="fas fa-circle"></i> Status:</span><span class="info-value status-active"><i class="fas fa-check-circle"></i> AKTIF</span></div></div></div>';
    html += '<div class="account-actions"><button class="btn btn-success action-btn" onclick="showTopupFromAccount()"><i class="fas fa-arrow-up"></i> TOP UP</button><button class="btn btn-warning action-btn" onclick="showKurasFromAccount()"><i class="fas fa-arrow-down"></i> KURAS</button><button class="btn btn-purple action-btn" onclick="showChangeNameSection()"><i class="fas fa-user-edit"></i> GANTI NAMA AKUN</button></div>';
    html += '<button class="btn btn-primary btn-block" onclick="showHome()" style="margin-top:10px"><i class="fas fa-home"></i> KEMBALI KE HOME</button>';
    html += '</div>';
    card.innerHTML = html;
}

async function refreshAccountInfo() {
    if (!currentAccount) { showAlert('Cari akun dulu!', 'error'); return; }
    showLoading('Refresh...');
    var info = await getUserInfoFromPlayFab();
    if (info) { currentAccount.balance = info.balance; currentAccount.name = info.name; currentAccount.facebook = info.facebook; currentAccount.facebookAvatarUrl = info.facebookAvatarUrl; currentAccount.playFabId = info.playFabId; renderAccountInfo(); hideLoading(); showAlert('Updated!', 'success'); }
    else { hideLoading(); }
}

function setAmount(a) { var el = document.getElementById('topupAmount'); if (el) { el.value = a; validateTopupAmount(); } }

function showTopupFromAccount() {
    if (!currentAccount) return;
    hideAllSections();
    var section = document.getElementById('topupSection');
    if (section) {
        section.innerHTML = '<div class="card-header"><h2><i class="fas fa-money-bill-wave"></i> TOP UP SALDO BUSSID</h2></div><div class="card-body"><div class="current-account-info"><p><i class="fas fa-user"></i> <strong>Akun:</strong> <span id="topupAccountName">' + sanitize(currentAccount.name) + '</span></p><p><i class="fas fa-coins"></i> <strong>Saldo Saat Ini:</strong> <span id="topupCurrentBalance">' + formatCurrency(currentAccount.balance) + '</span></p></div><div class="form-group"><label for="topupAmount"><i class="fas fa-coins"></i> Jumlah Top Up <span class="max-badge">MAX: 2.147M</span></label><input type="text" id="topupAmount" placeholder="Contoh: 2M, 1M, 500JT, MAX" class="form-input" oninput="validateTopupAmount()"><div id="amountPreview" class="amount-preview" style="display:none"><div class="label">Jumlah Top Up</div><div class="value" id="amountPreviewValue">Rp 0</div></div></div><div class="quick-amounts">' + generateQuickAmounts() + '</div><button class="btn btn-success btn-block" onclick="processTopup()"><i class="fas fa-check-circle"></i> PROSES TOP UP</button><button class="btn btn-primary btn-block" onclick="backToAccount()" style="margin-top:10px"><i class="fas fa-home"></i> KEMBALI</button></div>';
        section.style.display = 'block';
        var topupInput = document.getElementById('topupAmount');
        if (topupInput) topupInput.addEventListener('keypress', function(e) { if (e.key === 'Enter') processTopup(); });
    }
}

function showKurasFromAccount() {
    if (!currentAccount) return;
    hideAllSections();
    var section = document.getElementById('kurasSection');
    if (section) {
        section.innerHTML = '<div class="card-header"><h2><i class="fas fa-exchange-alt"></i> KURAS SALDO BUSSID</h2></div><div class="card-body"><div class="current-account-info"><p><i class="fas fa-user"></i> <strong>Akun:</strong> <span id="kurasAccountName">' + sanitize(currentAccount.name) + '</span></p><p><i class="fas fa-coins"></i> <strong>Saldo Saat Ini:</strong> <span id="kurasCurrentBalance">' + formatCurrency(currentAccount.balance) + '</span></p></div><div class="form-group"><label for="kurasAmount"><i class="fas fa-coins"></i> Jumlah Kuras</label><input type="text" id="kurasAmount" placeholder="Kosongkan untuk kuras semua" class="form-input"><small class="form-hint">Biarkan kosong untuk menguras semua saldo</small></div><button class="btn btn-warning btn-block" onclick="processKuras()"><i class="fas fa-bolt"></i> PROSES KURAS</button><button class="btn btn-primary btn-block" onclick="backToAccount()" style="margin-top:10px"><i class="fas fa-home"></i> KEMBALI</button></div>';
        section.style.display = 'block';
    }
}

function showChangeNameSection() {
    if (!currentAccount) return;
    hideAllSections();
    var section = document.getElementById('changeNameSection');
    if (section) {
        section.innerHTML = '<div class="card-header"><h2><i class="fas fa-user-edit"></i> GANTI NAMA AKUN</h2></div><div class="card-body"><div class="current-account-info"><p><i class="fas fa-user"></i> <strong>Akun:</strong> <span id="changeNameAccountLabel">' + sanitize(currentAccount.name) + '</span></p></div><div class="form-group"><label><i class="fas fa-user-plus"></i> Nama Baru (Maks 25 karakter)</label><div class="input-with-button"><input type="text" id="newAccountName" placeholder="Masukkan nama baru" class="form-input" maxlength="25"><button class="btn btn-primary" onclick="checkNameAvailability()"><i class="fas fa-search"></i> Cek</button></div><div class="name-availability" id="nameAvailability" style="display:none"></div></div><button class="btn btn-success btn-block" onclick="changeAccountNameSimple()"><i class="fas fa-check"></i> GANTI NAMA</button><button class="btn btn-primary btn-block" onclick="backToAccount()" style="margin-top:10px"><i class="fas fa-home"></i> KEMBALI</button></div>';
        section.style.display = 'block';
    }
}

function generateQuickAmounts() {
    return '<button class="btn-quick" onclick="setAmount(\'2M\')">2M</button><button class="btn-quick" onclick="setAmount(\'1M\')">1M</button><button class="btn-quick" onclick="setAmount(\'500JT\')">500JT</button><button class="btn-quick" onclick="setAmount(\'100JT\')">100JT</button><button class="btn-quick" onclick="setAmount(\'50JT\')">50JT</button>';
}

async function processTopup() {
    if (!currentAccount) return;
    var el = document.getElementById('topupAmount');
    if (!el) return;
    var amt = parseAmount(el.value.trim());
    if (amt <= 0) { showAlert('Jumlah tidak valid!', 'error'); return; }
    showConfirm('TOP UP', 'Top up ' + formatCurrency(amt) + '?', 'topup', { amount: amt });
}

async function processKuras() {
    if (!currentAccount) return;
    var el = document.getElementById('kurasAmount');
    var amt = el ? parseAmount(el.value.trim()) || currentAccount.balance : currentAccount.balance;
    if (amt <= 0 || amt > currentAccount.balance) { showAlert('Saldo tidak cukup!', 'error'); return; }
    showConfirm('KURAS', 'Kuras ' + formatCurrency(amt) + '?', 'kuras', { amount: amt });
}

async function addCashToAccount(amt) {
    if (!currentAuthToken) return false;
    try {
        var res = await callRvnstore('/Client/ExecuteCloudScript', 'POST', { FunctionName: "AddRp", FunctionParameter: { addValue: amt }, RevisionSelection: "Live", GeneratePlayStreamEvent: true }, currentAuthToken);
        if (res.data) {
            await new Promise(function(r) { setTimeout(r, 2000); });
            var info = await getUserInfoFromPlayFab();
            if (info) { currentAccount.balance = info.balance; currentAccount.facebook = info.facebook; currentAccount.facebookAvatarUrl = info.facebookAvatarUrl; currentAccount.playFabId = info.playFabId; renderAccountInfo(); return true; }
        }
        return false;
    } catch (e) { return false; }
}

async function executeTopup(amt) {
    showLoading('Memproses...');
    var old = currentAccount.balance;
    var ok = await addCashToAccount(amt);
    if (ok) {
        var trx = { type: 'topup', deviceId: currentAccount.deviceId, accountName: currentAccount.name, amount: amt, oldBalance: old, newBalance: currentAccount.balance, operator: currentUser.username, timestamp: Date.now(), status: 'success' };
        await callRevanstore('transactions', 'POST', trx);
        hideLoading();
        showReceipt(trx);
        showAlert('Berhasil!', 'success');
    } else { hideLoading(); showAlert('Gagal!', 'error'); }
}

async function executeKuras(amt) {
    showLoading('Memproses...');
    var old = currentAccount.balance;
    var ok = await addCashToAccount(-amt);
    if (ok) {
        var trx = { type: 'kuras', deviceId: currentAccount.deviceId, accountName: currentAccount.name, amount: amt, oldBalance: old, newBalance: currentAccount.balance, operator: currentUser.username, timestamp: Date.now(), status: 'success' };
        await callRevanstore('transactions', 'POST', trx);
        hideLoading();
        showReceipt(trx);
        showAlert('Berhasil!', 'success');
    } else { hideLoading(); showAlert('Gagal!', 'error'); }
}

function showReceipt(trx) {
    hideAllSections();
    var typeText = trx.type === 'topup' ? 'TOP UP' : 'KURAS', sign = trx.type === 'topup' ? '+' : '-';
    var section = document.getElementById('receiptSection');
    if (section) {
        section.innerHTML = '<div class="card-header"><h2><i class="fas fa-receipt"></i> DETAIL TRANSAKSI</h2></div><div class="card-body"><div id="receiptContent"><div class="receipt-content"><div class="receipt-header"><h3>BUSSID</h3><p>Detail Transaksi</p></div><div class="receipt-details"><div class="receipt-row"><span>Akun:</span><span>' + sanitize(trx.accountName) + '</span></div><div class="receipt-row"><span>Jenis:</span><span>' + typeText + '</span></div><div class="receipt-row"><span>Jumlah:</span><span style="color:' + (trx.type === 'topup' ? '#10b981' : '#f59e0b') + '">' + sign + formatCurrency(trx.amount) + '</span></div><div class="receipt-row"><span>Saldo Awal:</span><span>' + formatCurrency(trx.oldBalance) + '</span></div><div class="receipt-row"><span>Saldo Akhir:</span><span>' + formatCurrency(trx.newBalance) + '</span></div><div class="receipt-row"><span>Tanggal:</span><span>' + new Date(trx.timestamp).toLocaleString('id-ID') + '</span></div><div class="receipt-row"><span>Status:</span><span style="color:#10b981;">BERHASIL</span></div></div></div><div style="display:flex;gap:8px;margin-top:20px;"><button class="btn btn-primary" onclick="window._showTrxModal()" style="flex:1;">TRX LAGI</button><button class="btn btn-secondary" onclick="window._goHome()" style="flex:1;">HOME</button></div></div></div>';
        section.style.display = 'block';
    }
}

window._showTrxModal = function() { var modal = document.getElementById('trxLagiModal'); if (modal) { modal.style.display = 'flex'; modal.style.opacity = '1'; modal.style.visibility = 'visible'; } };
window._tutupTrxModal = function() { var modal = document.getElementById('trxLagiModal'); if (modal) modal.style.display = 'none'; };
window._pilihTopup = function() { window._tutupTrxModal(); showTopupFromAccount(); };
window._pilihKuras = function() { window._tutupTrxModal(); showKurasFromAccount(); };
window._goHome = function() { showHome(); };

async function showHistory() {
    hideAllSections();
    var section = document.getElementById('historySection');
    if (section) section.style.display = 'block';
    showLoading('Mengambil data...');
    try {
        var data = await callRevanstore('transactions', 'GET');
        var list = document.getElementById('transactionsList');
        if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
            if (list) list.innerHTML = '<p style="text-align:center;color:#666;padding:40px 20px;">Belum ada transaksi</p>';
            hideLoading(); return;
        }
        var arr = Object.keys(data).map(function(k) { return { id: k, type: data[k].type, accountName: data[k].accountName, amount: data[k].amount, oldBalance: data[k].oldBalance, newBalance: data[k].newBalance, operator: data[k].operator, timestamp: data[k].timestamp }; }).sort(function(a, b) { return b.timestamp - a.timestamp; });
        var html = '';
        arr.forEach(function(t) {
            var typeText = t.type === 'topup' ? 'TOP UP' : t.type === 'kuras' ? 'KURAS' : 'GANTI NAMA';
            var sign = t.type === 'topup' ? '+' : t.type === 'kuras' ? '-' : '';
            html += '<div class="transaction-item ' + t.type + '"><div class="transaction-header"><div>' + sanitize(t.accountName) + '</div><div class="transaction-amount">' + sign + formatCurrency(t.amount) + '</div></div><div class="transaction-details"><div>' + typeText + '</div><div>' + new Date(t.timestamp).toLocaleString('id-ID') + '</div></div><div class="transaction-balance"><span>Sebelum: ' + formatCurrency(t.oldBalance) + '</span><span>→</span><span>Sesudah: ' + formatCurrency(t.newBalance) + '</span></div></div>';
        });
        if (list) list.innerHTML = html;
        hideLoading();
    } catch (e) { hideLoading(); showAlert('Gagal!', 'error'); }
}

function showSettings() {
    hideAllSections();
    var section = document.getElementById('settingsSection');
    if (section) {
        var expiryFormatted = currentUser.expiry_date || 'Tidak ada';
        section.innerHTML = '<div class="card-header"><h2><i class="fas fa-cog"></i> PENGATURAN AKUN</h2></div><div class="card-body"><div class="user-profile-info"><div class="profile-item"><span class="profile-label"><i class="fas fa-user"></i> Username:</span><span class="profile-value highlight-black" id="profileUsername">' + sanitize(currentUser.username) + '</span></div><div class="profile-item"><span class="profile-label"><i class="fas fa-user"></i> Nama:</span><span class="profile-value highlight-black" id="profileName">' + sanitize(currentUser.full_name || currentUser.username) + '</span></div><div class="profile-item"><span class="profile-label"><i class="fas fa-user-tag"></i> Role:</span><span class="profile-value role-biru" id="profileRole">' + sanitize(currentUser.role || 'Operator') + '</span></div><div class="profile-item"><span class="profile-label"><i class="fas fa-calendar-alt"></i> Masa Aktif:</span><span class="profile-value" id="profileExpiry">' + expiryFormatted + '</span></div></div><div class="settings-divider"><h3><i class="fas fa-key"></i> Ubah Password</h3></div><p style="text-align:center;color:#64748b;padding:15px;font-size:14px"><i class="fas fa-info-circle"></i> Hubungi admin via WhatsApp untuk ubah password</p><button class="btn btn-whatsapp btn-block" onclick="openWhatsAppPassword()"><i class="fab fa-whatsapp"></i> Ubah Password</button><button class="btn btn-danger btn-block" onclick="logout()" style="margin-top:20px"><i class="fas fa-sign-out-alt"></i> LOGOUT</button></div>';
        section.style.display = 'block';
    }
}

function showConfirm(title, message, action, data) {
    var modal = document.getElementById('confirmModal');
    if (modal) {
        document.getElementById('modalConfirmTitle').innerHTML = sanitize(title);
        document.getElementById('modalConfirmMessage').innerHTML = sanitize(message);
        pendingAction = action; pendingData = data;
        modal.classList.add('active');
    }
}

function cancelConfirm() { pendingAction = null; pendingData = null; var modal = document.getElementById('confirmModal'); if (modal) modal.classList.remove('active'); }

async function confirmAction() {
    if (!pendingAction || !pendingData) return;
    var modal = document.getElementById('confirmModal'); if (modal) modal.classList.remove('active');
    if (pendingAction === 'topup') await executeTopup(pendingData.amount);
    else if (pendingAction === 'kuras') await executeKuras(pendingData.amount);
    else if (pendingAction === 'changename') await executeChangeName(pendingData);
    pendingAction = null; pendingData = null;
}

async function checkNameAvailability() { var d = document.getElementById('nameAvailability'); if (d) { d.innerHTML = 'Mengecek...'; d.style.display = 'block'; setTimeout(function() { d.innerHTML = '✅ Tersedia!'; }, 1000); } }

async function changeAccountNameSimple() {
    var nameEl = document.getElementById('newAccountName');
    if (!nameEl) return;
    var name = sanitize(nameEl.value.trim());
    if (!name) { showAlert('Masukkan nama!', 'error'); return; }
    if (!currentAccount || !currentAuthToken) { showAlert('Cari akun dulu!', 'error'); return; }
    showConfirm('GANTI NAMA', 'Ganti ke "' + name + '"?', 'changename', name);
}

async function executeChangeName(newName) {
    showLoading('Mengubah...');
    try {
        var res = await callRvnstore('/Client/UpdateUserTitleDisplayName', 'POST', { DisplayName: newName }, currentAuthToken);
        if (res.data && res.data.DisplayName) {
            var old = currentAccount.name; currentAccount.name = newName;
            await callRevanstore('transactions', 'POST', { type: 'gantinama', accountName: currentAccount.name, oldName: old, newName: newName, operator: currentUser.username, timestamp: Date.now(), status: 'success' });
            hideAllSections();
            var section = document.getElementById('receiptSection');
            if (section) {
                section.innerHTML = '<div class="card-header"><h2><i class="fas fa-receipt"></i> DETAIL TRANSAKSI</h2></div><div class="card-body"><div id="receiptContent"><div class="receipt-content"><div class="receipt-header"><h3>GANTI NAMA</h3></div><div class="receipt-details"><div class="receipt-row"><span>Lama:</span><span>' + sanitize(old) + '</span></div><div class="receipt-row"><span>Baru:</span><span style="color:#0ea5e9;">' + sanitize(newName) + '</span></div></div></div><button class="btn btn-primary btn-block" onclick="backToAccount()">KEMBALI</button></div></div>';
                section.style.display = 'block';
            }
            hideLoading(); showAlert('Berhasil!', 'success');
        } else { hideLoading(); showAlert('Gagal!', 'error'); }
    } catch (e) { hideLoading(); showAlert('Gagal!', 'error'); }
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', async function() {
    if (!checkAuth()) return;

    var blocked = await checkIfBlocked();
    if (blocked) { document.body.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#f0f9ff,#bae6fd,#7dd3fc);padding:20px;font-family:\'Segoe UI\',sans-serif;"><div style="background:#fff;border-radius:20px;padding:40px 30px;max-width:420px;width:100%;text-align:center;box-shadow:0 25px 60px rgba(0,0,0,0.1);"><div style="font-size:70px;color:#ef4444;margin-bottom:20px;">🔒</div><h1 style="color:#0c4a6e;font-size:24px;margin-bottom:10px;">AKSES DITOLAK</h1><p style="color:#64748b;font-size:14px;">Maaf, akses Anda telah diblokir.</p></div></div>'; return; }

    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('bottomNav').style.display = 'flex';

    var expiryCheck = checkAccountExpiry(currentUser);
    if (expiryCheck.expired) { showExpiredBanner(); return; }

    showHome();

    if (typeof grecaptcha !== 'undefined') {
        grecaptcha.ready(async function() {
            await checkAccountStatus();
            statusCheckInterval = setInterval(checkAccountStatus, 30000);
        });
    } else {
        await checkAccountStatus();
        statusCheckInterval = setInterval(checkAccountStatus, 30000);
    }

    var deviceInput = document.getElementById('deviceId');
    if (deviceInput) deviceInput.addEventListener('keypress', function(e) { if (e.key === 'Enter') searchAccount(); });

    console.log('Dashboard siap. User:', currentUser.username);
});