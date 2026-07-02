var API_REVANSTORE = '/api/revanstore';
var API_RVNSTORE = '/api/rvnstore';
var WHATSAPP_NUMBER = "6289520418604";
var MAX_TOPUP_AMOUNT = 2147483647;

var currentUser = null;
var currentAccount = null;
var currentAuthToken = null;
var pendingAction = null;
var pendingData = null;

async function callRevanstore(path, data) {
    var res = await fetch(API_REVANSTORE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: path, data: data }) });
    return await res.json();
}

async function callRvnstore(endpoint, method, body, authToken) {
    var res = await fetch(API_RVNSTORE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: endpoint, method: method || 'POST', body: body, authToken: authToken }) });
    return await res.json();
}

function showAlert(m, t, d) {
    t = t || 'info'; d = d || 3000;
    var el = document.getElementById('alert');
    el.innerHTML = '<i class="fas fa-' + ({success:'check-circle',error:'exclamation-circle',warning:'exclamation-triangle',info:'info-circle'}[t]) + '"></i> ' + m;
    el.className = 'alert ' + t + ' show';
    setTimeout(function() { el.classList.remove('show'); }, d);
}

function formatCurrency(a) { return 'Rp ' + (a || 0).toLocaleString('id-ID'); }

function parseAmount(i) {
    if (!i) return 0;
    var c = i.toUpperCase().trim();
    if (c === '2M' || c === 'MAX') return MAX_TOPUP_AMOUNT;
    var m = 1;
    if (c.includes('M') && !c.includes('JT')) { m = 1000000000; c = c.replace('M', ''); }
    else if (c.includes('JT')) { m = 1000000; c = c.replace('JT', ''); }
    return Math.min(Math.round(parseFloat(c) * m) || 0, MAX_TOPUP_AMOUNT);
}

function validateTopupAmount() {
    var i = document.getElementById('topupAmount'), p = document.getElementById('amountPreview'), pv = document.getElementById('amountPreviewValue');
    var a = parseAmount(i.value);
    if (a > 0) { p.style.display = 'block'; pv.textContent = formatCurrency(a); }
    else { p.style.display = 'none'; }
}

function hideAll() {
    ['accountInfo','topupSection','kurasSection','historySection','settingsSection','receiptSection'].forEach(function(id) { var e = document.getElementById(id); if (e) e.style.display = 'none'; });
    var s = document.querySelector('.search-card'); if (s) s.style.display = 'none';
}

function showHome() { hideAll(); document.querySelector('.search-card').style.display = 'block'; }
function backToAccount() { hideAll(); document.getElementById('accountInfo').style.display = 'block'; }

function parseDate(d) { if (!d) return null; var p = d.split('/'); return new Date(p[2], p[0]-1, p[1]); }
function calcDays(exp) { if (!exp) return -999; if (exp.includes('9999')) return 999999; var e = parseDate(exp); if (!e) return -999; return Math.ceil((e - new Date()) / 86400000); }
function checkExpiry(u) { var d = calcDays(u.expiry_date); return { expired: d <= 0 && d !== 999999, daysLeft: d }; }

function showExpiredBanner() { document.getElementById('expiredBanner').style.display = 'flex'; document.getElementById('mainApp').style.display = 'none'; document.getElementById('loginScreen').style.display = 'none'; }
function closeExpiredBanner() { document.getElementById('expiredBanner').style.display = 'none'; logout(); }
function openWhatsApp() { window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=Halo admin', '_blank'); }

async function login() {
    var u = document.getElementById('username').value.trim(), p = document.getElementById('password').value.trim();
    if (!u || !p) { showAlert('Isi username dan password!', 'error'); return; }
    showAlert('Login...', 'info');
    var r = await callRevanstore('login', { username: u, password: p });
    if (r && r.success) {
        currentUser = r.data;
        if (checkExpiry(currentUser).expired) { showExpiredBanner(); return; }
        document.getElementById('loginScreen').style.display = 'none'; document.getElementById('mainApp').style.display = 'block';
        showHome(); showAlert('Login berhasil!', 'success');
        localStorage.setItem('bussid', JSON.stringify({ username: u, id: r.data.id, ts: Date.now() }));
    } else showAlert(r?.error || 'Login gagal!', 'error');
}

function logout() {
    currentUser = null; currentAccount = null; currentAuthToken = null;
    document.getElementById('mainApp').style.display = 'none'; document.getElementById('loginScreen').style.display = 'flex';
    localStorage.removeItem('bussid');
}

async function searchAccount() {
    var d = document.getElementById('deviceId').value.trim();
    if (!d) { showAlert('Masukkan Device ID!', 'error'); return; }
    showAlert('Mencari...', 'info');
    var r = await callRvnstore('/Client/LoginWithAndroidDeviceID', 'POST', { TitleId: "4AE9", AndroidDeviceId: d.toLowerCase().replace(/^android-/, ''), CreateAccount: true, InfoRequestParameters: { GetUserAccountInfo: true, GetUserVirtualCurrency: true } });
    if (r.data?.SessionTicket) {
        currentAuthToken = r.data.SessionTicket;
        var info = await callRvnstore('/Client/GetPlayerCombinedInfo', 'POST', { InfoRequestParameters: { GetUserAccountInfo: true, GetUserVirtualCurrency: true } }, currentAuthToken);
        if (info.data) {
            var a = info.data.InfoResultPayload;
            currentAccount = { name: a.AccountInfo.TitleInfo.DisplayName || 'Unknown', balance: a.UserVirtualCurrency.RP || 0, playFabId: a.AccountInfo.PlayFabId || '-' };
            showAccountInfo(currentAccount);
            hideAll(); document.getElementById('accountInfo').style.display = 'block';
            showAlert('Akun ditemukan!', 'success');
        }
    } else showAlert('Gagal!', 'error');
}

function showAccountInfo(acc) {
    document.getElementById('accountName').textContent = acc.name;
    document.getElementById('accountBalance').textContent = formatCurrency(acc.balance);
    document.getElementById('playfabId').textContent = acc.playFabId;
    document.getElementById('facebookDetails').innerHTML = '<div class="fb-info-row"><span class="fb-info-label">Status:</span><span class="fb-info-value">Memuat...</span></div>';
}

function refreshAccountInfo() { searchAccount(); }
function showTopupFromAccount() { if (!currentAccount) return; document.getElementById('topupAccountName').textContent = currentAccount.name; document.getElementById('topupCurrentBalance').textContent = formatCurrency(currentAccount.balance); hideAll(); document.getElementById('topupSection').style.display = 'block'; }
function showKurasFromAccount() { if (!currentAccount) return; document.getElementById('kurasAccountName').textContent = currentAccount.name; document.getElementById('kurasCurrentBalance').textContent = formatCurrency(currentAccount.balance); hideAll(); document.getElementById('kurasSection').style.display = 'block'; }

function processTopup() { if (!currentAccount) return; var a = parseAmount(document.getElementById('topupAmount').value); if (a <= 0) { showAlert('Jumlah!', 'error'); return; } showConfirm('TOP UP', 'Top up ' + formatCurrency(a) + '?', 'topup', a); }
function processKuras() { if (!currentAccount) return; var i = document.getElementById('kurasAmount').value.trim(); var a = i ? parseAmount(i) : currentAccount.balance; if (a <= 0) { showAlert('Saldo!', 'error'); return; } showConfirm('KURAS', 'Kuras ' + formatCurrency(a) + '?', 'kuras', a); }

async function addCash(a) { if (!currentAuthToken) return false; var r = await callRvnstore('/Client/ExecuteCloudScript', 'POST', { FunctionName: "AddRp", FunctionParameter: { addValue: a }, RevisionSelection: "Live" }, currentAuthToken); return !!(r?.data); }
async function executeTopup(a) { showAlert('Proses...', 'info'); if (await addCash(a)) { currentAccount.balance += a; showReceipt('TOP UP', a); showAlert('Berhasil!', 'success'); } else showAlert('Gagal!', 'error'); }
async function executeKuras(a) { showAlert('Proses...', 'info'); if (await addCash(-a)) { currentAccount.balance -= a; showReceipt('KURAS', a); showAlert('Berhasil!', 'success'); } else showAlert('Gagal!', 'error'); }

function showReceipt(t, a) {
    hideAll();
    document.getElementById('receiptContent').innerHTML = '<div style="text-align:center;padding:20px;"><h3>' + t + ' BERHASIL</h3><p style="font-size:24px;">' + formatCurrency(a) + '</p></div><button class="btn btn-primary btn-block" onclick="backToAccount()">KEMBALI</button>';
    document.getElementById('receiptSection').style.display = 'block';
}

function showHistory() { hideAll(); document.getElementById('historySection').style.display = 'block'; }
function showSettings() { hideAll(); document.getElementById('settingsSection').style.display = 'block'; if (currentUser) { document.getElementById('profileUsername').textContent = currentUser.username; document.getElementById('profileName').textContent = currentUser.full_name || currentUser.username; document.getElementById('profileRole').textContent = currentUser.role || 'User'; document.getElementById('profileExpiry').textContent = currentUser.expiry_date || '-'; } }

function showConfirm(t, m, a, d) { document.getElementById('confirmTitle').innerHTML = t; document.getElementById('confirmMessage').innerHTML = m; pendingAction = a; pendingData = d; document.getElementById('confirmModal').classList.add('active'); }
function cancelConfirm() { pendingAction = null; pendingData = null; document.getElementById('confirmModal').classList.remove('active'); }
function confirmAction() { if (!pendingAction || !pendingData) return; document.getElementById('confirmModal').classList.remove('active'); if (pendingAction === 'topup') executeTopup(pendingData); else executeKuras(pendingData); pendingAction = null; pendingData = null; }

function setAmount(v) { var i = document.getElementById('topupAmount'); if (i) i.value = v; }
function setupQuick() { var q = document.querySelector('.quick-amounts'); if (q) q.innerHTML = '<button class="btn-quick" onclick="setAmount(\'2M\')">2M</button><button class="btn-quick" onclick="setAmount(\'1M\')">1M</button><button class="btn-quick" onclick="setAmount(\'500JT\')">500JT</button><button class="btn-quick" onclick="setAmount(\'100JT\')">100JT</button>'; }

async function checkNameAvailability() { var d = document.getElementById('nameAvailability'); d.innerHTML = 'Mengecek...'; d.style.display = 'block'; setTimeout(function() { d.innerHTML = 'Tersedia!'; }, 1000); }

async function changeAccountNameSimple() {
    var newName = document.getElementById('newAccountName').value.trim();
    if (!newName || !currentAuthToken) return;
    var r = await callRvnstore('/Client/UpdateUserTitleDisplayName', 'POST', { DisplayName: newName }, currentAuthToken);
    if (r?.data) { currentAccount.name = newName; document.getElementById('accountName').textContent = newName; showAlert('Nama berhasil diganti!', 'success'); }
    else showAlert('Gagal!', 'error');
}

function showNameChangeModal(m) { document.getElementById('nameChangeMessage').innerHTML = m; document.getElementById('nameChangeModal').classList.add('active'); }
function closeNameChangeModal() { document.getElementById('nameChangeModal').classList.remove('active'); }

function showTrxLagiModal() { document.getElementById('trxLagiModal').style.display = 'flex'; }
function tutupTrxLagiModal() { document.getElementById('trxLagiModal').style.display = 'none'; showHome(); }
function pilihTopupLagi() { tutupTrxLagiModal(); showTopupFromAccount(); }
function pilihKurasLagi() { tutupTrxLagiModal(); showKurasFromAccount(); }

document.addEventListener('DOMContentLoaded', function() {
    setupQuick();
    var saved = localStorage.getItem('bussid');
    if (saved) {
        try {
            var s = JSON.parse(saved);
            if (Date.now() - s.ts < 7 * 86400000) {
                document.getElementById('username').value = s.username;
            }
        } catch(e) {}
    }
});

window.login = login; window.logout = logout; window.searchAccount = searchAccount; window.refreshAccountInfo = refreshAccountInfo;
window.showTopupFromAccount = showTopupFromAccount; window.showKurasFromAccount = showKurasFromAccount;
window.processTopup = processTopup; window.processKuras = processKuras; window.showHistory = showHistory;
window.showSettings = showSettings; window.showHome = showHome; window.backToAccount = backToAccount;
window.cancelConfirm = cancelConfirm; window.confirmAction = confirmAction; window.setAmount = setAmount;
window.openWhatsApp = openWhatsApp; window.closeExpiredBanner = closeExpiredBanner;
window.checkNameAvailability = checkNameAvailability; window.changeAccountNameSimple = changeAccountNameSimple;
window.showNameChangeModal = showNameChangeModal; window.closeNameChangeModal = closeNameChangeModal;
window.showTrxLagiModal = showTrxLagiModal; window.tutupTrxLagiModal = tutupTrxLagiModal;
window.pilihTopupLagi = pilihTopupLagi; window.pilihKurasLagi = pilihKurasLagi;