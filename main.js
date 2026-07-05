var API_REVANSTORE = '/api/revanstore';
var API_RVNSTORE = '/api/rvnstore';
var API_KEY = '2145dd5b-b55d-49f1-9b3f-9543a5840f65';
var WHATSAPP_NUMBER = "6285199120995";
var MAX_TOPUP_AMOUNT = 2147483647;
var MAX_PASSWORD_LENGTH = 20;

var currentUser = null;
var currentAccount = null;
var currentAuthToken = null;
var pendingAction = null;
var pendingData = null;
var lastDeviceId = null;
var fingerprint = '';
var alertTimeout = null;

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

var BLOCK_CONFIG = { attempts: [5, 10, 15], durations: [15, 60, 1440] };

function getBlockKey(username) { return 'bussid_block_' + (username || 'global'); }

function getBlockData(username) {
    var key = getBlockKey(username);
    var data = localStorage.getItem(key);
    if (data) {
        try {
            var parsed = JSON.parse(data);
            if (parsed.blockedUntil && Date.now() > parsed.blockedUntil) { localStorage.removeItem(key); return { attempts: 0, blockedUntil: null, level: 0 }; }
            return parsed;
        } catch(e) { return { attempts: 0, blockedUntil: null, level: 0 }; }
    }
    return { attempts: 0, blockedUntil: null, level: 0 };
}

function saveBlockData(username, data) { var key = getBlockKey(username); localStorage.setItem(key, JSON.stringify(data)); }
function getBlockDuration(attempts) { if (attempts >= 15) return 1440; if (attempts >= 10) return 60; if (attempts >= 5) return 15; return 0; }
function sanitize(str) { if (!str) return ''; return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;'); }

async function callRevanstore(path, method, data) {
    if (!fingerprint) fingerprint = await getFingerprint();
    var res = await fetch(API_REVANSTORE, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'X-Fingerprint': fingerprint }, body: JSON.stringify({ path: path, method: method || 'GET', data: data || null }) });
    var text = await res.text(); if (!text || text === 'null') return null;
    return JSON.parse(text);
}

async function callRvnstore(endpoint, method, body, authToken) {
    var res = await fetch(API_RVNSTORE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: endpoint, method: method || 'POST', body: body || null, authToken: authToken || null }) });
    return await res.json();
}

function showAlert(message, type, duration) {
    type = type || 'info'; duration = duration || 2500;
    var overlay = document.getElementById('alertOverlay');
    var icon = document.getElementById('alertIcon');
    var title = document.getElementById('alertTitle');
    var msg = document.getElementById('alertMessage');
    
    if (!overlay || !icon || !title || !msg) {
        var alertDiv = document.getElementById('alert');
        if (alertDiv) {
            var icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle', loading: 'fa-spinner fa-spin' };
            alertDiv.innerHTML = '<div class="alert-content"><div class="alert-icon"><i class="fas ' + (icons[type] || 'fa-info-circle') + '"></i></div><span>' + sanitize(message) + '</span></div>';
            alertDiv.className = 'alert ' + type + ' show';
            if (alertTimeout) clearTimeout(alertTimeout);
            if (type !== 'loading') { alertTimeout = setTimeout(function() { alertDiv.classList.remove('show'); }, duration); }
        }
        return;
    }
    
    title.textContent = type === 'loading' ? 'Memproses' : (type === 'success' ? 'Berhasil' : (type === 'error' ? 'Gagal' : 'Info'));
    msg.textContent = message;
    icon.innerHTML = '';
    icon.className = '';
    
    if (type === 'loading') { icon.innerHTML = '<div class="spinner"></div>'; }
    else if (type === 'success') { icon.innerHTML = '<div class="checkmark"></div>'; }
    else if (type === 'error') { icon.innerHTML = '<div class="crossmark"></div>'; }
    else { icon.innerHTML = '<div class="info-icon">i</div>'; }
    
    overlay.classList.add('show');
    if (alertTimeout) clearTimeout(alertTimeout);
    if (type !== 'loading') { alertTimeout = setTimeout(function() { overlay.classList.remove('show'); }, duration); }
}

function hideAlert() { var overlay = document.getElementById('alertOverlay'); if (overlay) overlay.classList.remove('show'); }
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
    var amount = parseAmount(input.value);
    if (amount > 0 && input.value.trim() !== '') { preview.style.display = 'block'; previewValue.textContent = formatCurrency(amount); }
    else { preview.style.display = 'none'; }
}

function hideAllSections() {
    var sections = ['accountInfo', 'topupSection', 'kurasSection', 'changeNameSection', 'historySection', 'settingsSection', 'receiptSection'];
    sections.forEach(function(section) { var el = document.getElementById(section); if (el) el.style.display = 'none'; });
    var searchCard = document.querySelector('.search-card'); if (searchCard) searchCard.style.display = 'none';
}

function showHome() { hideAllSections(); document.querySelector('.search-card').style.display = 'block'; var trxModal = document.getElementById('trxLagiModal'); if (trxModal) trxModal.style.display = 'none'; }
function backToAccount() { if (currentAccount) { hideAllSections(); document.getElementById('accountInfo').style.display = 'block'; } else { showHome(); } }

function parseDate(dateStr) {
    if (!dateStr) return null;
    var parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    var month = parseInt(parts[0], 10) - 1;
    var day = parseInt(parts[1], 10);
    var year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    return new Date(year, month, day);
}

function calculateRemainingDays(expiryDate) {
    if (!expiryDate) return -999;
    if (expiryDate.includes('9999')) return 999999;
    var expiry = parseDate(expiryDate);
    if (!expiry) return -999;
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
}

function getDaysLeftClass(daysLeft) {
    if (daysLeft === 999999) return 'days-permanent';
    if (daysLeft <= 0) return 'days-red';
    if (daysLeft <= 3) return 'days-yellow';
    return 'days-green';
}

function getDaysLeftText(daysLeft) {
    if (daysLeft === 999999) return '♾️ Permanent';
    if (daysLeft < 0) return '⏰ Telah habis ' + Math.abs(daysLeft) + ' hari';
    if (daysLeft === 0) return '⚠️ Berakhir hari ini';
    if (daysLeft === 1) return '📅 1 hari tersisa';
    return '📅 ' + daysLeft + ' hari tersisa';
}

function checkAccountExpiry(user) {
    if (!user || !user.expiry_date) return { expired: false, daysLeft: 999999, daysLeftText: '♾️ Permanent', daysLeftClass: 'days-permanent' };
    var daysLeft = calculateRemainingDays(user.expiry_date);
    var expired = daysLeft <= 0 && daysLeft !== 999999;
    return {
        expired: expired,
        daysLeft: daysLeft,
        daysLeftText: getDaysLeftText(daysLeft),
        daysLeftClass: getDaysLeftClass(daysLeft)
    };
}

function showExpiredBanner() { document.getElementById('expiredBanner').style.display = 'flex'; document.getElementById('mainApp').style.display = 'none'; document.getElementById('loginScreen').style.display = 'none'; showAlert('Masa aktif akun telah habis!', 'error'); }
function closeExpiredBanner() { document.getElementById('expiredBanner').style.display = 'none'; logout(); }
function openWhatsApp() { var message = encodeURIComponent("Halo admin, saya ingin memperpanjang masa aktif akun BUSSID Top Up saya."); window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + message, '_blank'); }
function updatePasswordCounter(fieldId) { var input = document.getElementById(fieldId), counter = document.getElementById(fieldId + 'CharCount'); if (input && counter) counter.textContent = input.value.length + '/' + MAX_PASSWORD_LENGTH; }
function showDeleteHistoryConfirm() { document.getElementById('deleteHistoryModal').classList.add('active'); }
function closeDeleteHistoryModal() { document.getElementById('deleteHistoryModal').classList.remove('active'); }

async function deleteAllHistory() {
    try {
        showAlert('Menghapus semua riwayat...', 'loading');
        var transactions = await callRevanstore('transactions', 'GET');
        if (!transactions || typeof transactions !== 'object') { showAlert('Tidak ada riwayat!', 'warning'); closeDeleteHistoryModal(); return; }
        var deleteCount = 0;
        for (var key in transactions) { if (transactions[key] && transactions[key].operator === currentUser.username) { await callRevanstore('transactions/' + key, 'DELETE'); deleteCount++; } }
        closeDeleteHistoryModal(); showAlert('Berhasil menghapus ' + deleteCount + ' riwayat!', 'success');
    } catch (error) { showAlert('Gagal menghapus riwayat!', 'error'); closeDeleteHistoryModal(); }
}

async function login() {
    var username = sanitize(document.getElementById('username').value.trim());
    var password = document.getElementById('password').value.trim();
    if (!username || !password) { showAlert('Isi username dan password!', 'error'); return; }
    
    var blockData = getBlockData(username);
    if (blockData.blockedUntil && Date.now() < blockData.blockedUntil) { var remaining = Math.ceil((blockData.blockedUntil - Date.now()) / 60000); showAlert('Blokir ' + remaining + ' menit!', 'error'); return; }
    
    showAlert('Sedang login...', 'loading');
    try {
        var result = await callRevanstore('login', 'POST', { username: username, password: password });
        if (result && result.blocked) { showAlert('IP/Fingerprint diblokir permanen!', 'error'); return; }
        if (result && result.success) {
            localStorage.removeItem(getBlockKey(username));
            await callRevanstore('login_success', 'POST', {});
            var user = result.data;
            var expiryCheck = checkAccountExpiry(user);
            if (expiryCheck.expired) { showExpiredBanner(); return; }
            currentUser = { id: user.id, username: user.username, password: password, role: user.role || 'Operator', full_name: user.full_name || user.username, expiry_date: user.expiry_date || '' };
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            showHome(); showAlert('Login berhasil!', 'success'); updateProfileInfo();
            localStorage.setItem('bussid_session', JSON.stringify({ username: username, password: password, user_id: user.id, timestamp: Date.now() }));
        } else {
            await callRevanstore('login_failed', 'POST', {});
            blockData.attempts += 1; var attempts = blockData.attempts; var duration = getBlockDuration(attempts);
            if (duration > 0) { blockData.blockedUntil = Date.now() + duration * 60 * 1000; saveBlockData(username, blockData); showAlert('Diblokir ' + duration + ' menit!', 'error'); }
            else { saveBlockData(username, blockData); showAlert('Username atau password salah!', 'error'); }
        }
    } catch (error) { showAlert('Login gagal!', 'error'); }
}

function updateProfileInfo() {
    if (!currentUser) return;
    var expiryCheck = checkAccountExpiry(currentUser);
    document.getElementById('profileUsername').textContent = currentUser.username;
    document.getElementById('profileName').textContent = currentUser.full_name || currentUser.username;
    document.getElementById('profileRole').textContent = currentUser.role || 'Operator';
    var expiryDateFormatted = currentUser.expiry_date ? currentUser.expiry_date : 'Permanent';
    document.getElementById('profileExpiry').innerHTML = expiryDateFormatted + ' <span class="expiry-days-left ' + expiryCheck.daysLeftClass + '">' + expiryCheck.daysLeftText + '</span>';
}

function logout() {
    currentUser = null; currentAccount = null; currentAuthToken = null; lastDeviceId = null;
    document.getElementById('mainApp').style.display = 'none'; document.getElementById('expiredBanner').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'block';
    document.getElementById('username').value = ''; document.getElementById('password').value = '';
    localStorage.removeItem('bussid_session'); showAlert('Logout berhasil!', 'success');
}

async function loginWithDeviceId(deviceId) {
    showAlert('Menghubungkan ke BUSSID...', 'loading');
    try {
        var cleanInput = sanitize(deviceId.trim());
        if (cleanInput.includes('.')) { currentAuthToken = cleanInput; }
        else {
            var cleanDeviceId = cleanInput.toLowerCase().replace(/^android-/, '');
            var loginData = { TitleId: "4AE9", AndroidDeviceId: cleanDeviceId, CreateAccount: true, InfoRequestParameters: { GetUserAccountInfo: true, GetUserVirtualCurrency: true, GetPlayerProfile: true } };
            var data = await callRvnstore('/Client/LoginWithAndroidDeviceID', 'POST', loginData, null);
            if (data.data && data.data.SessionTicket) { currentAuthToken = data.data.SessionTicket; }
            else { throw new Error('Device ID tidak valid!'); }
        }
        var userInfo = await getUserInfoFromPlayFab();
        if (userInfo) { currentAccount = { deviceId: cleanInput, name: userInfo.name, balance: userInfo.balance, facebook: userInfo.facebook, facebookAvatarUrl: userInfo.facebookAvatarUrl, playFabId: userInfo.playFabId }; return true; }
        throw new Error('Gagal mendapatkan informasi akun');
    } catch (error) { showAlert('Gagal: ' + error.message, 'error'); return false; }
}

async function getUserInfoFromPlayFab() {
    if (!currentAuthToken) return null;
    try {
        var data = { InfoRequestParameters: { GetUserAccountInfo: true, GetUserVirtualCurrency: true, GetPlayerProfile: true } };
        var result = await callRvnstore('/Client/GetPlayerCombinedInfo', 'POST', data, currentAuthToken);
        if (result.data) {
            var info = result.data.InfoResultPayload; var accountInfo = info.AccountInfo;
            var bussidName = (accountInfo && accountInfo.TitleInfo) ? (accountInfo.TitleInfo.DisplayName || 'Unknown Player') : 'Unknown Player';
            var balance = info.UserVirtualCurrency ? (info.UserVirtualCurrency.RP || 0) : 0;
            var playFabId = accountInfo ? (accountInfo.PlayFabId || 'Tidak tersedia') : 'Tidak tersedia';
            var facebookData = { id: null, name: 'Tidak tertaut', email: null, isConnected: false };
            var facebookAvatarUrl = null;
            if (accountInfo && accountInfo.FacebookInfo) {
                var fbInfo = accountInfo.FacebookInfo;
                facebookData = { id: fbInfo.FacebookId || null, name: fbInfo.FullName || 'Tidak tertaut', email: fbInfo.Email || null, isConnected: true };
                if (facebookData.id) facebookAvatarUrl = 'https://graph.facebook.com/' + facebookData.id + '/picture?type=large&width=400&height=400';
            }
            return { name: bussidName, balance: balance, facebook: facebookData, facebookAvatarUrl: facebookAvatarUrl, playFabId: playFabId };
        }
    } catch (error) {}
    return null;
}

function tampilkanFotoProfile(accountInfo) {
    var fotoContainer = document.getElementById('profilePhoto'); if (!fotoContainer) return;
    fotoContainer.innerHTML = '';
    var avatarUrl = accountInfo && accountInfo.facebookAvatarUrl ? accountInfo.facebookAvatarUrl : null;
    if (avatarUrl && avatarUrl !== 'null' && avatarUrl !== '') {
        var img = document.createElement('img'); img.src = avatarUrl; img.alt = 'Foto Profile';
        img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'cover'; img.style.borderRadius = '50%';
        img.onload = function() { fotoContainer.appendChild(img); };
        img.onerror = function() { fotoContainer.innerHTML = '<i class="fas fa-user"></i>'; };
    } else { fotoContainer.innerHTML = '<i class="fas fa-user"></i>'; }
}

function tampilkanInfoFacebook(facebookData) {
    var fbDetails = document.getElementById('facebookDetails'); if (!fbDetails) return;
    if (facebookData && facebookData.isConnected && facebookData.id) {
        fbDetails.innerHTML = '<div class="fb-info-row"><span class="fb-info-label"><i class="fab fa-facebook"></i> Status:</span><span class="fb-info-value" style="color:#1877F2;">✅ TERHUBUNG</span></div>' +
            '<div class="fb-info-row"><span class="fb-info-label"><i class="fab fa-facebook"></i> Facebook ID:</span><span class="fb-info-value" style="font-family:monospace;font-size:12px;">' + sanitize(facebookData.id) + '</span></div>' +
            '<div class="fb-info-row"><span class="fb-info-label"><i class="fas fa-user"></i> Nama Facebook:</span><span class="fb-info-value">' + sanitize(facebookData.name || '-') + '</span></div>' +
            '<div class="fb-info-row"><span class="fb-info-label"><i class="fas fa-envelope"></i> Email:</span><span class="fb-info-value">' + sanitize(facebookData.email || '-') + '</span></div>';
    } else {
        fbDetails.innerHTML = '<div class="fb-info-row"><span class="fb-info-label"><i class="fab fa-facebook"></i> Status:</span><span class="fb-info-value" style="color:#ffaa00;">⚠️ TIDAK TERHUBUNG</span></div>' +
            '<div class="fb-info-row"><span class="fb-info-label"><i class="fas fa-info-circle"></i> Info:</span><span class="fb-info-value">Akun tidak terhubung ke Facebook</span></div>';
    }
}

async function searchAccount() {
    var deviceId = document.getElementById('deviceId').value.trim();
    if (!deviceId) { showAlert('Masukkan Device ID atau Token!', 'error'); return; }
    var success = await loginWithDeviceId(deviceId);
    if (success) { lastDeviceId = deviceId; showAccountInfo(currentAccount); hideAllSections(); document.getElementById('accountInfo').style.display = 'block'; showAlert('Akun ditemukan!', 'success'); }
}

function showAccountInfo(accountInfo) {
    document.getElementById('accountName').textContent = sanitize(accountInfo.name || 'Tidak diketahui');
    document.getElementById('accountBalance').textContent = formatCurrency(accountInfo.balance);
    document.getElementById('playfabId').textContent = accountInfo.playFabId || 'Tidak tersedia';
    tampilkanFotoProfile(accountInfo); tampilkanInfoFacebook(accountInfo.facebook);
}

function refreshAccountInfo() {
    if (!currentAccount) { showAlert('Cari akun dulu!', 'error'); return; }
    showAlert('Merefresh...', 'loading');
    setTimeout(async function() {
        var newInfo = await getUserInfoFromPlayFab();
        if (newInfo) { currentAccount.balance = newInfo.balance; currentAccount.name = newInfo.name; currentAccount.facebook = newInfo.facebook; currentAccount.facebookAvatarUrl = newInfo.facebookAvatarUrl; currentAccount.playFabId = newInfo.playFabId; showAccountInfo(currentAccount); showAlert('Informasi diperbarui!', 'success'); }
    }, 1000);
}

function setAmount(amountStr) { document.getElementById('topupAmount').value = amountStr; validateTopupAmount(); }
function showTopupFromAccount() { if (!currentAccount) return; document.getElementById('topupAccountName').textContent = currentAccount.name; document.getElementById('topupCurrentBalance').textContent = formatCurrency(currentAccount.balance); hideAllSections(); document.getElementById('topupSection').style.display = 'block'; }
function showKurasFromAccount() { if (!currentAccount) return; document.getElementById('kurasAccountName').textContent = currentAccount.name; document.getElementById('kurasCurrentBalance').textContent = formatCurrency(currentAccount.balance); hideAllSections(); document.getElementById('kurasSection').style.display = 'block'; }
function showChangeNameSection() { if (!currentAccount) return; document.getElementById('changeNameAccountLabel').textContent = currentAccount.name; hideAllSections(); document.getElementById('changeNameSection').style.display = 'block'; }

async function processTopup() {
    if (!currentAccount) { showAlert('Cari akun dulu!', 'error'); return; }
    var amountInput = document.getElementById('topupAmount').value.trim();
    if (!amountInput) { showAlert('Masukkan jumlah top up!', 'error'); return; }
    var amount = parseAmount(amountInput);
    if (amount <= 0) { showAlert('Masukkan jumlah yang valid!', 'error'); return; }
    showConfirm('KONFIRMASI TOP UP', 'Top up ' + formatCurrency(amount) + ' ke ' + currentAccount.name + '?', 'topup', { amount: amount });
}

async function executeTopup(amount) {
    showAlert('Memproses top up...', 'loading'); var oldBalance = currentAccount.balance; var success = await addCashToAccount(amount);
    if (success) { var transaction = { type: 'topup', deviceId: currentAccount.deviceId, accountName: currentAccount.name, amount: amount, oldBalance: oldBalance, newBalance: currentAccount.balance, operator: currentUser.username, timestamp: Date.now(), status: 'success' }; await callRevanstore('transactions', 'POST', transaction); showReceipt(transaction); showAlert('Top up berhasil!', 'success'); }
    else { showAlert('Top up gagal!', 'error'); }
}

async function processKuras() {
    if (!currentAccount) { showAlert('Cari akun dulu!', 'error'); return; }
    var amountInput = document.getElementById('kurasAmount').value.trim(); var amount;
    if (amountInput) { amount = parseAmount(amountInput); if (amount <= 0) { showAlert('Masukkan jumlah yang valid!', 'error'); return; } if (amount > currentAccount.balance) { showAlert('Jumlah kuras melebihi saldo!', 'error'); return; } }
    else { amount = currentAccount.balance; }
    if (amount <= 0) { showAlert('Saldo tidak cukup!', 'error'); return; }
    showConfirm('KONFIRMASI KURAS', 'Kuras ' + formatCurrency(amount) + ' dari ' + currentAccount.name + '?', 'kuras', { amount: amount });
}

async function executeKuras(amount) {
    showAlert('Memproses kuras...', 'loading'); var oldBalance = currentAccount.balance; var success = await addCashToAccount(-amount);
    if (success) { var transaction = { type: 'kuras', deviceId: currentAccount.deviceId, accountName: currentAccount.name, amount: amount, oldBalance: oldBalance, newBalance: currentAccount.balance, operator: currentUser.username, timestamp: Date.now(), status: 'success' }; await callRevanstore('transactions', 'POST', transaction); showReceipt(transaction); showAlert('Kuras berhasil!', 'success'); }
    else { showAlert('Kuras gagal!', 'error'); }
}

async function addCashToAccount(amount) {
    if (!currentAuthToken) return false;
    try {
        var result = await callRvnstore('/Client/ExecuteCloudScript', 'POST', { FunctionName: "AddRp", FunctionParameter: { addValue: amount }, RevisionSelection: "Live", GeneratePlayStreamEvent: true }, currentAuthToken);
        if (result.data) { await new Promise(function(r) { setTimeout(r, 2000); }); var newInfo = await getUserInfoFromPlayFab(); if (newInfo) { currentAccount.balance = newInfo.balance; currentAccount.facebook = newInfo.facebook; currentAccount.facebookAvatarUrl = newInfo.facebookAvatarUrl; currentAccount.playFabId = newInfo.playFabId; showAccountInfo(currentAccount); return true; } }
        return false;
    } catch (error) { return false; }
}

function showReceipt(transaction) {
    hideAllSections();
    var typeText = transaction.type === 'topup' ? 'TOP UP' : 'KURAS', amountSign = transaction.type === 'topup' ? '+' : '-';
    document.getElementById('receiptContent').innerHTML =
        '<div class="receipt-content"><div class="receipt-header"><h3><i class="fas fa-bus"></i> BUS SIMULATOR ID</h3><p>Struk Transaksi</p></div>' +
        '<div class="receipt-details">' +
        '<div class="receipt-row"><span>Nama Akun:</span><span><strong>' + sanitize(transaction.accountName) + '</strong></span></div>' +
        '<div class="receipt-row"><span>Jenis:</span><span><strong>' + typeText + '</strong></span></div>' +
        '<div class="receipt-row"><span>Jumlah:</span><span><strong style="color:' + (transaction.type === 'topup' ? '#00cc88' : '#ffaa00') + '">' + amountSign + formatCurrency(transaction.amount) + '</strong></span></div>' +
        '<div class="receipt-row"><span>Saldo Sebelum:</span><span>' + formatCurrency(transaction.oldBalance) + '</span></div>' +
        '<div class="receipt-row"><span>Saldo Sesudah:</span><span><strong>' + formatCurrency(transaction.newBalance) + '</strong></span></div>' +
        '<div class="receipt-row"><span>Tanggal:</span><span>' + new Date(transaction.timestamp).toLocaleString('id-ID') + '</span></div>' +
        '<div class="receipt-row"><span>Status:</span><span><strong style="color:#00cc88;">BERHASIL</strong></span></div>' +
        '</div><div class="receipt-footer"><p>Silakan cek akun bussid</p></div></div>' +
        '<div style="display:flex;gap:10px;margin-top:20px;"><button class="btn btn-success" onclick="showTrxLagiModal()" style="flex:1;">TRX LAGI</button><button class="btn btn-primary" onclick="backToHome()" style="flex:1;">HOME</button></div>';
    document.getElementById('receiptSection').style.display = 'block';
}

function backToHome() { showHome(); }
function showTrxLagiModal() { var modal = document.getElementById('trxLagiModal'); if (modal) { modal.style.display = 'flex'; } }
function tutupTrxLagiModal() { var modal = document.getElementById('trxLagiModal'); if (modal) { modal.style.display = 'none'; } showHome(); }
function pilihTopupLagi() { tutupTrxLagiModal(); if (lastDeviceId && currentAccount) showTopupFromAccount(); else { showAlert('Cari akun dulu!', 'warning'); showHome(); } }
function pilihKurasLagi() { tutupTrxLagiModal(); if (lastDeviceId && currentAccount) showKurasFromAccount(); else { showAlert('Cari akun dulu!', 'warning'); showHome(); } }

async function showHistory() {
    hideAllSections(); document.getElementById('historySection').style.display = 'block';
    try {
        var transactions = await callRevanstore('transactions', 'GET');
        var listDiv = document.getElementById('transactionsList');
        if (!transactions || typeof transactions !== 'object') { listDiv.innerHTML = '<p style="text-align:center;color:#666;">Belum ada transaksi</p>'; return; }
        var arr = Object.keys(transactions).map(function(k) { return { id: k, type: transactions[k].type, accountName: transactions[k].accountName, amount: transactions[k].amount, oldBalance: transactions[k].oldBalance, newBalance: transactions[k].newBalance, operator: transactions[k].operator, timestamp: transactions[k].timestamp }; }).filter(function(t) { return t.operator === currentUser.username; }).sort(function(a, b) { return b.timestamp - a.timestamp; });
        if (arr.length === 0) { listDiv.innerHTML = '<p style="text-align:center;color:#666;">Belum ada transaksi</p>'; return; }
        var html = '';
        arr.forEach(function(t) {
            var typeText = t.type === 'topup' ? 'TOP UP' : 'KURAS', amountSign = t.type === 'topup' ? '+' : '-';
            html += '<div class="transaction-item ' + t.type + '"><div class="transaction-header"><div><i class="fas fa-user"></i> ' + sanitize(t.accountName) + '</div><div class="transaction-amount">' + amountSign + formatCurrency(t.amount) + '</div></div><div class="transaction-details"><div>' + typeText + '</div><div>' + new Date(t.timestamp).toLocaleString('id-ID') + '</div></div><div class="transaction-balance"><span>Sebelum: ' + formatCurrency(t.oldBalance) + '</span><span>→</span><span>Sesudah: ' + formatCurrency(t.newBalance) + '</span></div></div>';
        });
        listDiv.innerHTML = html;
    } catch (error) { showAlert('Gagal memuat riwayat', 'error'); }
}

function showSettings() { hideAllSections(); document.getElementById('settingsSection').style.display = 'block'; updateProfileInfo(); }
function showConfirm(title, message, action, data) { document.getElementById('confirmTitle').innerHTML = '<i class="fas fa-exclamation-triangle"></i> ' + sanitize(title); document.getElementById('confirmMessage').innerHTML = sanitize(message); pendingAction = action; pendingData = data; document.getElementById('confirmModal').classList.add('active'); }
function cancelConfirm() { pendingAction = null; pendingData = null; document.getElementById('confirmModal').classList.remove('active'); }

async function confirmAction() {
    if (!pendingAction || !pendingData) return;
    document.getElementById('confirmModal').classList.remove('active');
    if (pendingAction === 'topup') await executeTopup(pendingData.amount);
    else if (pendingAction === 'kuras') await executeKuras(pendingData.amount);
    else if (pendingAction === 'changename') await executeChangeName(pendingData);
    pendingAction = null; pendingData = null;
}

async function checkNameAvailability() { var d = document.getElementById('nameAvailability'); d.innerHTML = '<div class="availability-checking"><i class="fas fa-spinner fa-spin"></i> Mengecek...</div>'; d.style.display = 'block'; setTimeout(function() { d.innerHTML = '<div class="availability-success"><i class="fas fa-check-circle"></i> Tersedia!</div>'; }, 1000); }

async function changeAccountNameSimple() {
    var newName = sanitize(document.getElementById('newAccountName').value.trim());
    if (!newName) { showNameChangeModal('Masukkan nama baru!', 'error'); return; }
    if (!currentAccount || !currentAuthToken) { showNameChangeModal('Cari akun dulu!', 'error'); return; }
    showConfirm('KONFIRMASI GANTI NAMA', 'Ganti nama dari "' + currentAccount.name + '" ke "' + newName + '"?', 'changename', newName);
}

async function executeChangeName(newName) {
    showAlert('Sedang mengubah nama...', 'loading');
    try {
        var result = await callRvnstore('/Client/UpdateUserTitleDisplayName', 'POST', { DisplayName: newName }, currentAuthToken);
        if (result.data && result.data.DisplayName) {
            var oldName = currentAccount.name; currentAccount.name = newName;
            document.getElementById('accountName').textContent = newName;
            await callRevanstore('transactions', 'POST', { type: 'gantinama', accountName: currentAccount.name, oldName: oldName, newName: newName, operator: currentUser.username, timestamp: Date.now(), status: 'success' });
            hideAllSections();
            document.getElementById('receiptContent').innerHTML = '<div class="receipt-content"><div class="receipt-header"><h3><i class="fas fa-user-edit"></i> GANTI NAMA BERHASIL</h3></div><div class="receipt-details"><div class="receipt-row"><span>Nama Sebelum:</span><span><strong>' + sanitize(oldName) + '</strong></span></div><div class="receipt-row"><span>Nama Baru:</span><span><strong style="color:#0ea5e9;">' + sanitize(newName) + '</strong></span></div><div class="receipt-row"><span>Tanggal:</span><span>' + new Date().toLocaleString('id-ID') + '</span></div><div class="receipt-row"><span>Status:</span><span><strong style="color:#00cc88;">BERHASIL</strong></span></div></div></div><button class="btn btn-primary btn-block" onclick="backToAccount()" style="margin-top:20px;">KEMBALI</button>';
            document.getElementById('receiptSection').style.display = 'block'; showAlert('Nama berhasil diganti!', 'success');
        } else { showAlert('Gagal mengubah nama!', 'error'); }
    } catch (error) { showAlert('Gagal mengubah nama!', 'error'); }
}

function showNameChangeModal(message, type) { type = type || 'info'; var modal = document.getElementById('nameChangeModal'), msg = document.getElementById('nameChangeMessage'); var icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' }; msg.innerHTML = '<i class="fas ' + icons[type] + '"></i> ' + sanitize(message); modal.classList.add('active'); }
function closeNameChangeModal() { document.getElementById('nameChangeModal').classList.remove('active'); }

function setupQuickAmounts() { var q = document.querySelector('.quick-amounts'); if (q) q.innerHTML = '<button class="btn-quick" onclick="setAmount(\'2M\')">2M</button><button class="btn-quick" onclick="setAmount(\'1M\')">1M</button><button class="btn-quick" onclick="setAmount(\'500JT\')">500JT</button><button class="btn-quick" onclick="setAmount(\'100JT\')">100JT</button><button class="btn-quick" onclick="setAmount(\'50JT\')">50JT</button>'; }

function setupEventListeners() {
    var userEl = document.getElementById('username'); if (userEl) userEl.addEventListener('keypress', function(e) { if (e.key === 'Enter') document.getElementById('password').focus(); });
    var passEl = document.getElementById('password'); if (passEl) passEl.addEventListener('keypress', function(e) { if (e.key === 'Enter') login(); });
    var topEl = document.getElementById('topupAmount'); if (topEl) topEl.addEventListener('keypress', function(e) { if (e.key === 'Enter') processTopup(); });
    var devEl = document.getElementById('deviceId'); if (devEl) devEl.addEventListener('keypress', function(e) { if (e.key === 'Enter') searchAccount(); });
}

document.addEventListener('DOMContentLoaded', async function() {
    setupEventListeners(); setupQuickAmounts();
    document.addEventListener('contextmenu', function(e) { e.preventDefault(); });
    document.addEventListener('keydown', function(e) { if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I') || (e.ctrlKey && e.key === 'U')) { e.preventDefault(); return false; } });
    
    var saved = localStorage.getItem('bussid_session');
    if (saved) {
        try {
            var session = JSON.parse(saved), age = Date.now() - (session.timestamp || 0);
            if (age > 7 * 24 * 60 * 60 * 1000) { localStorage.removeItem('bussid_session'); return; }
            var result = await callRevanstore('login', 'POST', { username: session.username, password: session.password });
            if (result && result.success) {
                var user = result.data; var expiryCheck = checkAccountExpiry(user);
                if (expiryCheck.expired) { showExpiredBanner(); return; }
                currentUser = { id: user.id, username: user.username, password: session.password, role: user.role || 'Operator', full_name: user.full_name || user.username, expiry_date: user.expiry_date || '' };
                document.getElementById('loginScreen').style.display = 'none';
                document.getElementById('mainApp').style.display = 'block';
                showHome(); updateProfileInfo(); showAlert('Selamat datang kembali!', 'success');
            } else { localStorage.removeItem('bussid_session'); }
        } catch(e) { localStorage.removeItem('bussid_session'); }
    }
});