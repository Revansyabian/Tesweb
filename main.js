var API_REVANSTORE = '/api/revanstore';
var API_RVNSTORE = '/api/rvnstore';
var WHATSAPP_NUMBER = "6285199120995";
var MAX_TOPUP_AMOUNT = 2147483647;
var AUTO_DELETE_DAYS = 3;
var MAX_PASSWORD_LENGTH = 20;

var currentUser = null;
var currentAccount = null;
var currentAuthToken = null;
var pendingAction = null;
var pendingData = null;
var lastDeviceId = null;

function sanitize(str) {
    if (!str) return '';
    return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

async function callRevanstore(path, method, data) {
    var res = await fetch(API_REVANSTORE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: path, method: method || 'GET', data: data || null }) });
    var text = await res.text(); if (!text || text === 'null') return null;
    return JSON.parse(text);
}

async function callRvnstore(endpoint, method, body, authToken) {
    var res = await fetch(API_RVNSTORE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: endpoint, method: method || 'POST', body: body || null, authToken: authToken || null }) });
    return await res.json();
}

function showAlert(message, type, duration) {
    type = type || 'info'; duration = duration || 3000;
    var alertDiv = document.getElementById('alert');
    var icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    alertDiv.innerHTML = '<i class="fas ' + (icons[type] || 'fa-info-circle') + '"></i> ' + sanitize(message);
    alertDiv.className = 'alert ' + type + ' show';
    setTimeout(function() { alertDiv.classList.remove('show'); }, duration);
}

function formatCurrency(amount) {
    if (!amount && amount !== 0) return 'Rp 0';
    return 'Rp ' + Math.abs(amount).toLocaleString('id-ID');
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

function validateTopupAmount() {
    var input = document.getElementById('topupAmount'), preview = document.getElementById('amountPreview'), previewValue = document.getElementById('amountPreviewValue');
    var amount = parseAmount(input.value);
    if (amount > 0 && input.value.trim() !== '') {
        preview.style.display = 'block'; previewValue.textContent = formatCurrency(amount);
        if (amount === MAX_TOPUP_AMOUNT) input.classList.add('input-success');
        else input.classList.remove('input-success');
    } else { preview.style.display = 'none'; }
}

function hideAllSections() {
    var sections = ['accountInfo', 'topupSection', 'kurasSection', 'changeNameSection', 'historySection', 'settingsSection', 'receiptSection'];
    sections.forEach(function(section) { var el = document.getElementById(section); if (el) el.style.display = 'none'; });
    var searchCard = document.querySelector('.search-card'); if (searchCard) searchCard.style.display = 'none';
}

function showHome() { hideAllSections(); document.querySelector('.search-card').style.display = 'block'; }
function backToAccount() { hideAllSections(); document.getElementById('accountInfo').style.display = 'block'; }

function parseDate(dateStr) {
    if (!dateStr) return null;
    var parts = dateStr.split('/'); if (parts.length !== 3) return null;
    var m = parseInt(parts[0])-1, d = parseInt(parts[1]), y = parseInt(parts[2]);
    return new Date(y,m,d);
}

function calculateRemainingDays(expiryDate) {
    if (!expiryDate) return -999;
    if (expiryDate.includes('9999')) return 999999;
    var expiry = parseDate(expiryDate); if (!expiry) return -999;
    var now = new Date(); now.setHours(0,0,0,0);
    return Math.ceil((expiry - now) / (1000*60*60*24));
}

function getExpiryColorClass(daysLeft) {
    if (daysLeft === 999999) return 'masa-aktif-hijau';
    if (daysLeft > 3) return 'masa-aktif-hijau';
    if (daysLeft >= 1 && daysLeft <= 3) return 'masa-aktif-kuning';
    return 'masa-aktif-merah';
}

function getDaysLeftText(daysLeft) {
    if (daysLeft === 999999) return '♾️ Permanent';
    if (daysLeft < 0) return '⏰ Telah habis (' + Math.abs(daysLeft) + ' hari)';
    if (daysLeft === 0) return '⚠️ Berakhir hari ini';
    if (daysLeft === 1) return '📅 sisa 1 hari';
    return '📅 sisa ' + daysLeft + ' hari';
}

function getDaysLeftClass(daysLeft) {
    if (daysLeft === 999999) return 'days-permanent';
    if (daysLeft <= 0) return 'days-red';
    if (daysLeft <= 3) return 'days-yellow';
    return 'days-green';
}

function checkAccountExpiry(user) {
    var daysLeft = calculateRemainingDays(user.expiry_date);
    return { expired: daysLeft <= 0 && daysLeft !== 999999, daysLeft: daysLeft, colorClass: getExpiryColorClass(daysLeft), daysLeftText: getDaysLeftText(daysLeft), daysLeftClass: getDaysLeftClass(daysLeft) };
}

function showExpiredBanner() { document.getElementById('expiredBanner').style.display = 'flex'; document.getElementById('mainApp').style.display = 'none'; document.getElementById('loginScreen').style.display = 'none'; }
function closeExpiredBanner() { document.getElementById('expiredBanner').style.display = 'none'; logout(); }
function openWhatsApp() { window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=Halo admin', '_blank'); }

function updatePasswordCounter(fieldId) {
    var input = document.getElementById(fieldId), counter = document.getElementById(fieldId + 'CharCount');
    if (input && counter) counter.textContent = input.value.length + '/' + MAX_PASSWORD_LENGTH;
}

function showDeleteHistoryConfirm() { document.getElementById('deleteHistoryModal').classList.add('active'); }
function closeDeleteHistoryModal() { document.getElementById('deleteHistoryModal').classList.remove('active'); }

async function deleteAllHistory() {
    try {
        showAlert('Menghapus...', 'info');
        var transactions = await callRevanstore('transactions', 'GET');
        if (!transactions || typeof transactions !== 'object') { showAlert('Tidak ada riwayat!', 'warning'); closeDeleteHistoryModal(); return; }
        var deleteCount = 0;
        for (var key in transactions) {
            if (transactions[key].operator === currentUser.username) {
                await callRevanstore('transactions/' + key, 'DELETE');
                deleteCount++;
            }
        }
        closeDeleteHistoryModal();
        showAlert('Berhasil menghapus ' + deleteCount + ' riwayat!', 'success');
    } catch (error) { showAlert('Gagal!', 'error'); closeDeleteHistoryModal(); }
}

async function login() {
    var username = sanitize(document.getElementById('username').value.trim());
    var password = document.getElementById('password').value.trim();
    if (!username || !password) { showAlert('Isi username dan password!', 'error'); return; }
    showAlert('Sedang login...', 'info');
    try {
        var result = await callRevanstore('login', 'POST', { username: username, password: password });
        if (result && result.success) {
            var user = result.data;
            var expiryCheck = checkAccountExpiry(user);
            if (expiryCheck.expired) { showExpiredBanner(); return; }
            currentUser = { id: user.id, username: user.username, password: password, role: user.role || 'Operator', full_name: user.full_name || user.username, expiry_date: user.expiry_date || '' };
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            showHome(); showAlert('Login berhasil!', 'success');
            updateProfileInfo();
            localStorage.setItem('bussid_session', JSON.stringify({ username: username, password: password, user_id: user.id, timestamp: Date.now() }));
        } else { showAlert(result.error || 'Login gagal!', 'error'); }
    } catch (error) { showAlert('Login gagal!', 'error'); }
}

function updateProfileInfo() {
    if (!currentUser) return;
    var expiryCheck = checkAccountExpiry(currentUser);
    document.getElementById('profileUsername').textContent = currentUser.username;
    document.getElementById('profileName').textContent = currentUser.full_name || currentUser.username;
    document.getElementById('profileRole').textContent = currentUser.role || 'Operator';
    document.getElementById('profileRole').className = 'profile-value role-biru';
    document.getElementById('profileExpiry').innerHTML = (currentUser.expiry_date || 'Tidak ada') + ' <span class="expiry-days-left ' + expiryCheck.daysLeftClass + '">' + expiryCheck.daysLeftText + '</span>';
    document.getElementById('profileExpiry').className = 'profile-value ' + expiryCheck.colorClass;
}

function logout() {
    currentUser = null; currentAccount = null; currentAuthToken = null; lastDeviceId = null;
    document.getElementById('mainApp').style.display = 'none'; document.getElementById('expiredBanner').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'block';
    document.getElementById('username').value = ''; document.getElementById('password').value = '';
    localStorage.removeItem('bussid_session');
}

async function loginWithDeviceId(deviceId) {
    showAlert('Login BUSSID...', 'info');
    try {
        var cleanInput = sanitize(deviceId.trim());
        if (cleanInput.includes('.')) { currentAuthToken = cleanInput; }
        else {
            var cleanDeviceId = cleanInput.toLowerCase().replace(/^android-/, '');
            var loginData = { TitleId: "4AE9", AndroidDeviceId: cleanDeviceId, CreateAccount: true, InfoRequestParameters: { GetUserAccountInfo: true, GetUserVirtualCurrency: true } };
            var data = await callRvnstore('/Client/LoginWithAndroidDeviceID', 'POST', loginData, null);
            if (data.data && data.data.SessionTicket) { currentAuthToken = data.data.SessionTicket; }
            else throw new Error('Device ID tidak valid!');
        }
        var userInfo = await getUserInfoFromPlayFab();
        if (userInfo) { currentAccount = { deviceId: cleanInput, name: userInfo.name, balance: userInfo.balance, facebook: userInfo.facebook, facebookAvatarUrl: userInfo.facebookAvatarUrl, playFabId: userInfo.playFabId }; return true; }
        throw new Error('Gagal ambil info');
    } catch (error) { showAlert('Gagal: ' + error.message, 'error'); return false; }
}

async function getUserInfoFromPlayFab() {
    if (!currentAuthToken) return null;
    try {
        var data = { InfoRequestParameters: { GetUserAccountInfo: true, GetUserVirtualCurrency: true, GetPlayerProfile: true } };
        var result = await callRvnstore('/Client/GetPlayerCombinedInfo', 'POST', data, currentAuthToken);
        if (result.data) {
            var info = result.data.InfoResultPayload;
            var accountInfo = info.AccountInfo;
            var name = (accountInfo && accountInfo.TitleInfo) ? (accountInfo.TitleInfo.DisplayName || 'Unknown') : 'Unknown';
            var balance = info.UserVirtualCurrency ? (info.UserVirtualCurrency.RP || 0) : 0;
            var playFabId = accountInfo ? (accountInfo.PlayFabId || '-') : '-';
            var facebookData = { id: null, name: 'Tidak tertaut', email: null, isConnected: false };
            var facebookAvatarUrl = null;
            if (accountInfo && accountInfo.FacebookInfo) {
                var fbInfo = accountInfo.FacebookInfo;
                facebookData = { id: fbInfo.FacebookId || null, name: fbInfo.FullName || 'Tidak tertaut', email: fbInfo.Email || null, isConnected: true };
                if (facebookData.id) facebookAvatarUrl = 'https://graph.facebook.com/' + facebookData.id + '/picture?type=large';
            }
            return { name: name, balance: balance, facebook: facebookData, facebookAvatarUrl: facebookAvatarUrl, playFabId: playFabId };
        }
    } catch (error) {}
    return null;
}

function tampilkanFotoProfile(accountInfo) {
    var fotoContainer = document.getElementById('profilePhoto'); if (!fotoContainer) return;
    fotoContainer.innerHTML = '';
    var avatarUrl = accountInfo && accountInfo.facebookAvatarUrl ? accountInfo.facebookAvatarUrl : null;
    if (avatarUrl && avatarUrl !== 'null' && avatarUrl !== '') {
        var img = document.createElement('img'); img.src = avatarUrl; img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'cover'; img.style.borderRadius = '50%';
        img.onerror = function() { fotoContainer.innerHTML = '<i class="fas fa-user"></i>'; };
        fotoContainer.appendChild(img);
    } else { fotoContainer.innerHTML = '<i class="fas fa-user"></i>'; }
}

function tampilkanInfoFacebook(facebookData) {
    var fbDetails = document.getElementById('facebookDetails'); if (!fbDetails) return;
    if (facebookData && facebookData.isConnected && facebookData.id) {
        fbDetails.innerHTML = '<div class="fb-info-row"><span class="fb-info-label"><i class="fab fa-facebook"></i> Status:</span><span class="fb-info-value" style="color:#1877F2;">✅ TERHUBUNG</span></div>' +
            '<div class="fb-info-row"><span class="fb-info-label"><i class="fab fa-facebook"></i> ID:</span><span class="fb-info-value" style="font-family:monospace;font-size:12px;">' + sanitize(facebookData.id) + '</span></div>' +
            '<div class="fb-info-row"><span class="fb-info-label"><i class="fas fa-user"></i> Nama:</span><span class="fb-info-value">' + sanitize(facebookData.name || '-') + '</span></div>';
    } else { fbDetails.innerHTML = '<div class="fb-info-row"><span class="fb-info-label"><i class="fab fa-facebook"></i> Status:</span><span class="fb-info-value" style="color:#ffaa00;">⚠️ TIDAK TERHUBUNG</span></div>'; }
}

async function searchAccount() {
    var deviceId = document.getElementById('deviceId').value.trim();
    if (!deviceId) { showAlert('Masukkan Device ID!', 'error'); return; }
    var success = await loginWithDeviceId(deviceId);
    if (success) { lastDeviceId = deviceId; showAccountInfo(currentAccount); hideAllSections(); document.getElementById('accountInfo').style.display = 'block'; showAlert('Akun ditemukan!', 'success'); }
}

function showAccountInfo(accountInfo) {
    document.getElementById('accountName').textContent = sanitize(accountInfo.name || '-');
    document.getElementById('accountBalance').textContent = formatCurrency(accountInfo.balance);
    document.getElementById('playfabId').textContent = accountInfo.playFabId || '-';
    tampilkanFotoProfile(accountInfo);
    tampilkanInfoFacebook(accountInfo.facebook);
}

function refreshAccountInfo() { if (!currentAccount) return; showAlert('Refresh...', 'info'); setTimeout(async function() { var ni = await getUserInfoFromPlayFab(); if (ni) { currentAccount = ni; showAccountInfo(currentAccount); showAlert('Diperbarui!', 'success'); } }, 1000); }
function setAmount(amountStr) { document.getElementById('topupAmount').value = amountStr; validateTopupAmount(); }
function showTopupFromAccount() { if (!currentAccount) return; document.getElementById('topupAccountName').textContent = currentAccount.name; document.getElementById('topupCurrentBalance').textContent = formatCurrency(currentAccount.balance); hideAllSections(); document.getElementById('topupSection').style.display = 'block'; }
function showKurasFromAccount() { if (!currentAccount) return; document.getElementById('kurasAccountName').textContent = currentAccount.name; document.getElementById('kurasCurrentBalance').textContent = formatCurrency(currentAccount.balance); hideAllSections(); document.getElementById('kurasSection').style.display = 'block'; }
function showChangeNameSection() { if (!currentAccount) return; document.getElementById('changeNameAccountLabel').textContent = currentAccount.name; hideAllSections(); document.getElementById('changeNameSection').style.display = 'block'; }

async function processTopup() { if (!currentAccount) return; var a = parseAmount(document.getElementById('topupAmount').value); if (a <= 0) { showAlert('Jumlah!', 'error'); return; } showConfirm('TOP UP', 'Top up ' + formatCurrency(a) + '?', 'topup', a); }
async function processKuras() { if (!currentAccount) return; var i = document.getElementById('kurasAmount').value.trim(); var a = i ? parseAmount(i) : currentAccount.balance; if (a <= 0) { showAlert('Saldo!', 'error'); return; } showConfirm('KURAS', 'Kuras ' + formatCurrency(a) + '?', 'kuras', a); }

async function addCash(a) { if (!currentAuthToken) return false; var r = await callRvnstore('/Client/ExecuteCloudScript', 'POST', { FunctionName: "AddRp", FunctionParameter: { addValue: a }, RevisionSelection: "Live" }, currentAuthToken); if (r.data) { await new Promise(function(res) { setTimeout(res, 2000); }); var ni = await getUserInfoFromPlayFab(); if (ni) { currentAccount = ni; showAccountInfo(currentAccount); return true; } } return false; }

async function executeTopup(a) { showAlert('Proses...', 'info'); if (await addCash(a)) { currentAccount.balance += a; showReceipt('TOP UP', a); showAlert('Berhasil!', 'success'); } else showAlert('Gagal!', 'error'); }
async function executeKuras(a) { showAlert('Proses...', 'info'); if (await addCash(-a)) { currentAccount.balance -= a; showReceipt('KURAS', a); showAlert('Berhasil!', 'success'); } else showAlert('Gagal!', 'error'); }

function showReceipt(type, amount) {
    hideAllSections();
    var html = '<div style="text-align:center;padding:20px;"><h3>' + sanitize(type) + ' BERHASIL</h3>';
    html += '<p style="font-size:24px;">' + formatCurrency(amount) + '</p><p>' + sanitize(currentAccount.name) + '</p></div>';
    html += '<button class="btn btn-primary btn-block" onclick="backToAccount()">KEMBALI</button>';
    document.getElementById('receiptContent').innerHTML = html;
    document.getElementById('receiptSection').style.display = 'block';
}

function showTrxLagiModal() { var modal = document.getElementById('trxLagiModal'); if (modal) { modal.style.display = 'flex'; modal.style.opacity = '1'; modal.style.visibility = 'visible'; } }
function tutupTrxLagiModal() { var modal = document.getElementById('trxLagiModal'); if (modal) modal.style.display = 'none'; showHome(); }
function pilihTopupLagi() { tutupTrxLagiModal(); if (lastDeviceId && currentAccount) showTopupFromAccount(); else { showAlert('Cari akun dulu!', 'warning'); showHome(); } }
function pilihKurasLagi() { tutupTrxLagiModal(); if (lastDeviceId && currentAccount) showKurasFromAccount(); else { showAlert('Cari akun dulu!', 'warning'); showHome(); } }

async function showHistory() {
    hideAllSections(); document.getElementById('historySection').style.display = 'block';
    try {
        var transactions = await callRevanstore('transactions', 'GET');
        var listDiv = document.getElementById('transactionsList');
        if (!transactions || typeof transactions !== 'object') { listDiv.innerHTML = '<p style="text-align:center;color:#666;">Belum ada transaksi</p>'; return; }
        var arr = Object.keys(transactions).map(function(k) { return { id: k, type: transactions[k].type, accountName: transactions[k].accountName, amount: transactions[k].amount, oldBalance: transactions[k].oldBalance, newBalance: transactions[k].newBalance, operator: transactions[k].operator, timestamp: transactions[k].timestamp }; }).filter(function(t) { return t.operator === currentUser.username; }).sort(function(a, b) { return b.timestamp - a.timestamp; });
        if (arr.length === 0) { listDiv.innerHTML = '<p style="text-align:center;color:#666;">Belum ada</p>'; return; }
        var html = '';
        arr.forEach(function(t) { html += '<div class="transaction-item ' + t.type + '"><div class="transaction-header"><div>' + sanitize(t.accountName) + '</div><div>' + (t.type==='topup'?'+':'-') + formatCurrency(t.amount) + '</div></div></div>'; });
        listDiv.innerHTML = html;
    } catch (error) { showAlert('Gagal!', 'error'); }
}

function showSettings() { hideAllSections(); document.getElementById('settingsSection').style.display = 'block'; updateProfileInfo(); }
function showConfirm(title, message, action, data) { document.getElementById('confirmTitle').innerHTML = sanitize(title); document.getElementById('confirmMessage').innerHTML = sanitize(message); pendingAction = action; pendingData = data; document.getElementById('confirmModal').classList.add('active'); }
function cancelConfirm() { pendingAction = null; pendingData = null; document.getElementById('confirmModal').classList.remove('active'); }
async function confirmAction() { if (!pendingAction || !pendingData) return; document.getElementById('confirmModal').classList.remove('active'); if (pendingAction === 'topup') await executeTopup(pendingData); else if (pendingAction === 'kuras') await executeKuras(pendingData); else if (pendingAction === 'changename') await executeChangeName(pendingData); pendingAction = null; pendingData = null; }

async function checkNameAvailability() { var d = document.getElementById('nameAvailability'); d.innerHTML = '<div class="availability-checking">Mengecek...</div>'; d.style.display = 'block'; setTimeout(function() { d.innerHTML = '<div class="availability-success">Tersedia!</div>'; }, 1000); }

async function changeAccountNameSimple() {
    var newName = sanitize(document.getElementById('newAccountName').value.trim());
    if (!newName || !currentAccount || !currentAuthToken) return;
    showConfirm('GANTI NAMA', 'Ganti nama ke "' + newName + '"?', 'changename', newName);
}

async function executeChangeName(newName) {
    showAlert('Mengubah nama...', 'info');
    try {
        var result = await callRvnstore('/Client/UpdateUserTitleDisplayName', 'POST', { DisplayName: newName }, currentAuthToken);
        if (result.data && result.data.DisplayName) {
            var oldName = currentAccount.name;
            currentAccount.name = newName;
            document.getElementById('accountName').textContent = newName;
            hideAllSections();
            var html = '<div style="text-align:center;padding:20px;"><h3>NAMA BERHASIL DIGANTI</h3>';
            html += '<p>Dari: ' + sanitize(oldName) + '</p><p>Ke: ' + sanitize(newName) + '</p></div>';
            html += '<button class="btn btn-primary btn-block" onclick="backToAccount()">KEMBALI</button>';
            document.getElementById('receiptContent').innerHTML = html;
            document.getElementById('receiptSection').style.display = 'block';
            showAlert('Nama berhasil diganti!', 'success');
        } else showAlert('Gagal!', 'error');
    } catch (error) { showAlert('Gagal!', 'error'); }
}

function showNameChangeModal(message, type) { type = type || 'info'; var modal = document.getElementById('nameChangeModal'); document.getElementById('nameChangeMessage').innerHTML = sanitize(message); modal.classList.add('active'); }
function closeNameChangeModal() { document.getElementById('nameChangeModal').classList.remove('active'); }

function setupQuickAmounts() { var q = document.querySelector('.quick-amounts'); if (q) q.innerHTML = '<button class="btn-quick" onclick="setAmount(\'2M\')">2M</button><button class="btn-quick" onclick="setAmount(\'1M\')">1M</button><button class="btn-quick" onclick="setAmount(\'500JT\')">500JT</button><button class="btn-quick" onclick="setAmount(\'100JT\')">100JT</button>'; }
function setupEventListeners() {
    document.getElementById('username')?.addEventListener('keypress', function(e) { if (e.key === 'Enter') document.getElementById('password').focus(); });
    document.getElementById('password')?.addEventListener('keypress', function(e) { if (e.key === 'Enter') login(); });
}

document.addEventListener('DOMContentLoaded', async function() {
    setupEventListeners(); setupQuickAmounts();
    var saved = localStorage.getItem('bussid_session');
    if (saved) {
        try {
            var session = JSON.parse(saved);
            if (Date.now() - (session.timestamp || 0) > 7 * 86400000) { localStorage.removeItem('bussid_session'); return; }
            var result = await callRevanstore('login', 'POST', { username: session.username, password: session.password });
            if (result && result.success) {
                var user = result.data;
                if (checkAccountExpiry(user).expired) { showExpiredBanner(); return; }
                currentUser = { id: user.id, username: user.username, password: session.password, role: user.role || 'Operator', full_name: user.full_name || user.username, expiry_date: user.expiry_date || '' };
                document.getElementById('loginScreen').style.display = 'none';
                document.getElementById('mainApp').style.display = 'block';
                showHome(); updateProfileInfo();
                showAlert('Selamat datang!', 'success');
            } else localStorage.removeItem('bussid_session');
        } catch(e) { localStorage.removeItem('bussid_session'); }
    }
});

window.login = login; window.logout = logout; window.searchAccount = searchAccount; window.refreshAccountInfo = refreshAccountInfo;
window.showTopupFromAccount = showTopupFromAccount; window.showKurasFromAccount = showKurasFromAccount;
window.showChangeNameSection = showChangeNameSection; window.backToAccount = backToAccount;
window.processTopup = processTopup; window.processKuras = processKuras; window.showHistory = showHistory;
window.showSettings = showSettings; window.showHome = showHome; window.cancelConfirm = cancelConfirm;
window.confirmAction = confirmAction; window.setAmount = setAmount; window.validateTopupAmount = validateTopupAmount;
window.checkNameAvailability = checkNameAvailability; window.changeAccountNameSimple = changeAccountNameSimple;
window.showTrxLagiModal = showTrxLagiModal; window.tutupTrxLagiModal = tutupTrxLagiModal;
window.pilihTopupLagi = pilihTopupLagi; window.pilihKurasLagi = pilihKurasLagi;
window.closeExpiredBanner = closeExpiredBanner; window.openWhatsApp = openWhatsApp;
window.updatePasswordCounter = updatePasswordCounter; window.closeDeleteHistoryModal = closeDeleteHistoryModal;
window.deleteAllHistory = deleteAllHistory; window.showDeleteHistoryConfirm = showDeleteHistoryConfirm;
window.closeNameChangeModal = closeNameChangeModal; window.showNameChangeModal = showNameChangeModal;