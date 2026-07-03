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

function sanitize(str) { if (!str) return ''; return String(str).replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function callRevanstore(path, method, data) { var r = await fetch(API_REVANSTORE,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:path,method:method||'GET',data:data||null})}); var t = await r.text(); if(!t||t==='null')return null; return JSON.parse(t); }
async function callRvnstore(endpoint, method, body, authToken) { var r = await fetch(API_RVNSTORE,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:endpoint,method:method||'POST',body:body||null,authToken:authToken||null})}); return await r.json(); }

function showAlert(m,t,d){ t=t||'info';d=d||3000; var el=document.getElementById('alert'); var i={success:'fa-check-circle',error:'fa-exclamation-circle',warning:'fa-exclamation-triangle',info:'fa-info-circle'}; el.innerHTML='<i class="fas '+(i[t]||'fa-info-circle')+'"></i> '+sanitize(m); el.className='alert '+t+' show'; setTimeout(function(){el.classList.remove('show')},d); }
function formatCurrency(a){ if(!a&&a!==0)return'Rp 0'; return'Rp '+Math.abs(a).toLocaleString('id-ID'); }
function parseAmount(i){ if(!i||i.trim()==='')return 0; var c=i.toUpperCase().trim(); if(c==='2M'||c==='MAX')return MAX_TOPUP_AMOUNT; var m=1; if(c.includes('M')&&!c.includes('JT')){m=1000000000;c=c.replace('M','');}else if(c.includes('JT')){m=1000000;c=c.replace('JT','');} return Math.min(Math.round(parseFloat(c)*m)||0,MAX_TOPUP_AMOUNT); }

function validateTopupAmount(){ var i=document.getElementById('topupAmount'),p=document.getElementById('amountPreview'),v=document.getElementById('amountPreviewValue'); var a=parseAmount(i.value); if(a>0){p.style.display='block';v.textContent=formatCurrency(a);}else{p.style.display='none';} }

function hideAllSections(){ ['accountInfo','topupSection','kurasSection','changeNameSection','historySection','settingsSection','receiptSection'].forEach(function(id){var e=document.getElementById(id);if(e)e.style.display='none';}); var s=document.querySelector('.search-card');if(s)s.style.display='none'; }
function showHome(){ hideAllSections(); document.querySelector('.search-card').style.display='block'; }
function backToAccount(){ if(currentAccount){ hideAllSections(); document.getElementById('accountInfo').style.display='block'; }else{ showHome(); } }

function parseDate(d){ if(!d)return null; var p=d.split('/'); return new Date(p[2],p[0]-1,p[1]); }
function calcDays(exp){ if(!exp)return-999; if(exp.includes('9999'))return 999999; var e=parseDate(exp); if(!e)return-999; return Math.ceil((e-new Date())/86400000); }
function checkExpiry(u){ var d=calcDays(u.expiry_date); return{expired:d<=0&&d!==999999,daysLeft:d}; }

function showExpiredBanner(){ document.getElementById('expiredBanner').style.display='flex'; document.getElementById('mainApp').style.display='none'; document.getElementById('loginScreen').style.display='none'; }
function closeExpiredBanner(){ document.getElementById('expiredBanner').style.display='none'; logout(); }
function openWhatsApp(){ window.open('https://wa.me/'+WHATSAPP_NUMBER+'?text=Halo','_blank'); }
function updatePasswordCounter(f){ var i=document.getElementById(f),c=document.getElementById(f+'CharCount'); if(i&&c)c.textContent=i.value.length+'/'+MAX_PASSWORD_LENGTH; }

function showDeleteHistoryConfirm(){ document.getElementById('deleteHistoryModal').classList.add('active'); }
function closeDeleteHistoryModal(){ document.getElementById('deleteHistoryModal').classList.remove('active'); }
async function deleteAllHistory(){ showAlert('Riwayat dihapus!','success'); closeDeleteHistoryModal(); }

async function login(){
    var u=sanitize(document.getElementById('username').value.trim()),p=document.getElementById('password').value.trim();
    if(!u||!p){showAlert('Isi username dan password!','error');return;}
    showAlert('Sedang login...','info');
    var r=await callRevanstore('login','POST',{username:u,password:p});
    if(r&&r.success){
        var user=r.data;
        if(checkExpiry(user).expired){showExpiredBanner();return;}
        currentUser={id:user.id,username:user.username,password:p,role:user.role||'Operator',full_name:user.full_name||user.username,expiry_date:user.expiry_date||''};
        document.getElementById('loginScreen').style.display='none';document.getElementById('mainApp').style.display='block';
        showHome();showAlert('Login berhasil!','success');
        updateProfileInfo();
        localStorage.setItem('bussid_session',JSON.stringify({username:u,password:p,user_id:user.id,timestamp:Date.now()}));
    }else{showAlert(r.error||'Login gagal!','error');}
}

function updateProfileInfo(){
    if(!currentUser)return;
    var ec=checkExpiry(currentUser);
    document.getElementById('profileUsername').textContent=currentUser.username;
    document.getElementById('profileName').textContent=currentUser.full_name||currentUser.username;
    document.getElementById('profileRole').textContent=currentUser.role||'Operator';
    document.getElementById('profileRole').className='profile-value role-biru';
    document.getElementById('profileExpiry').innerHTML=(currentUser.expiry_date||'Tidak ada')+' <span class="expiry-days-left '+(ec.daysLeft<=0?'days-red':ec.daysLeft<=3?'days-yellow':'days-green')+'">'+(ec.daysLeft===999999?'♾️ Permanent':ec.daysLeft<0?'⏰ Telah habis':ec.daysLeft===0?'⚠️ Berakhir hari ini':'📅 sisa '+ec.daysLeft+' hari')+'</span>';
}

function logout(){
    currentUser=null;currentAccount=null;currentAuthToken=null;lastDeviceId=null;
    document.getElementById('mainApp').style.display='none';document.getElementById('expiredBanner').style.display='none';
    document.getElementById('loginScreen').style.display='block';
    document.getElementById('username').value='';document.getElementById('password').value='';
    localStorage.removeItem('bussid_session');showAlert('Logout berhasil!','success');
}

async function loginWithDeviceId(deviceId){
    showAlert('Login BUSSID...','info');
    var c=sanitize(deviceId.trim());
    if(c.includes('.')){currentAuthToken=c;}
    else{
        var cd=c.toLowerCase().replace(/^android-/,'');
        var r=await callRvnstore('/Client/LoginWithAndroidDeviceID','POST',{TitleId:"4AE9",AndroidDeviceId:cd,CreateAccount:true,InfoRequestParameters:{GetUserAccountInfo:true,GetUserVirtualCurrency:true}},null);
        if(r.data&&r.data.SessionTicket){currentAuthToken=r.data.SessionTicket;}
        else throw new Error('Device ID tidak valid!');
    }
    var info=await getUserInfoFromPlayFab();
    if(info){currentAccount={deviceId:c,name:info.name,balance:info.balance,facebook:info.facebook,facebookAvatarUrl:info.facebookAvatarUrl,playFabId:info.playFabId};return true;}
    throw new Error('Gagal ambil info');
}

async function getUserInfoFromPlayFab(){
    if(!currentAuthToken)return null;
    var r=await callRvnstore('/Client/GetPlayerCombinedInfo','POST',{InfoRequestParameters:{GetUserAccountInfo:true,GetUserVirtualCurrency:true,GetPlayerProfile:true}},currentAuthToken);
    if(r.data){
        var a=r.data.InfoResultPayload.AccountInfo;
        var fb={id:null,name:'Tidak tertaut',email:null,isConnected:false},fav=null;
        if(a&&a.FacebookInfo){fb={id:a.FacebookInfo.FacebookId||null,name:a.FacebookInfo.FullName||'Tidak tertaut',email:a.FacebookInfo.Email||null,isConnected:true};if(fb.id)fav='https://graph.facebook.com/'+fb.id+'/picture?type=large';}
        return{name:a?.TitleInfo?.DisplayName||'Unknown',balance:r.data.InfoResultPayload.UserVirtualCurrency?.RP||0,facebook:fb,facebookAvatarUrl:fav,playFabId:a?.PlayFabId||'-'};
    }
    return null;
}

function tampilkanFotoProfile(ai){
    var fc=document.getElementById('profilePhoto');if(!fc)return;fc.innerHTML='';
    var av=ai&&ai.facebookAvatarUrl?ai.facebookAvatarUrl:null;
    if(av&&av!=='null'&&av!==''){var img=document.createElement('img');img.src=av;img.style.width='100%';img.style.height='100%';img.style.objectFit='cover';img.style.borderRadius='50%';img.onerror=function(){fc.innerHTML='<i class="fas fa-user"></i>';};fc.appendChild(img);}
    else{fc.innerHTML='<i class="fas fa-user"></i>';}
}

function tampilkanInfoFacebook(fb){
    var fd=document.getElementById('facebookDetails');if(!fd)return;
    if(fb&&fb.isConnected&&fb.id){fd.innerHTML='<div class="fb-info-row"><span class="fb-info-label"><i class="fab fa-facebook"></i> Status:</span><span class="fb-info-value" style="color:#1877F2;">✅ TERHUBUNG</span></div><div class="fb-info-row"><span class="fb-info-label"><i class="fab fa-facebook"></i> ID:</span><span class="fb-info-value" style="font-family:monospace;font-size:12px;">'+sanitize(fb.id)+'</span></div><div class="fb-info-row"><span class="fb-info-label"><i class="fas fa-user"></i> Nama:</span><span class="fb-info-value">'+sanitize(fb.name||'-')+'</span></div>';}
    else{fd.innerHTML='<div class="fb-info-row"><span class="fb-info-label"><i class="fab fa-facebook"></i> Status:</span><span class="fb-info-value" style="color:#ffaa00;">⚠️ TIDAK TERHUBUNG</span></div>';}
}

async function searchAccount(){
    var d=document.getElementById('deviceId').value.trim();
    if(!d){showAlert('Masukkan Device ID!','error');return;}
    try{var ok=await loginWithDeviceId(d);if(ok){lastDeviceId=d;showAccountInfo(currentAccount);hideAllSections();document.getElementById('accountInfo').style.display='block';showAlert('Akun ditemukan!','success');}}catch(e){showAlert('Gagal!','error');}
}

function showAccountInfo(ai){ document.getElementById('accountName').textContent=sanitize(ai.name||'-'); document.getElementById('accountBalance').textContent=formatCurrency(ai.balance); document.getElementById('playfabId').textContent=ai.playFabId||'-'; tampilkanFotoProfile(ai); tampilkanInfoFacebook(ai.facebook); }
function refreshAccountInfo(){ searchAccount(); }
function setAmount(v){ document.getElementById('topupAmount').value=v; validateTopupAmount(); }
function showTopupFromAccount(){ if(!currentAccount)return; document.getElementById('topupAccountName').textContent=currentAccount.name; document.getElementById('topupCurrentBalance').textContent=formatCurrency(currentAccount.balance); hideAllSections(); document.getElementById('topupSection').style.display='block'; }
function showKurasFromAccount(){ if(!currentAccount)return; document.getElementById('kurasAccountName').textContent=currentAccount.name; document.getElementById('kurasCurrentBalance').textContent=formatCurrency(currentAccount.balance); hideAllSections(); document.getElementById('kurasSection').style.display='block'; }
function showChangeNameSection(){ if(!currentAccount)return; document.getElementById('changeNameAccountLabel').textContent=currentAccount.name; hideAllSections(); document.getElementById('changeNameSection').style.display='block'; }

function processTopup(){ if(!currentAccount)return; var a=parseAmount(document.getElementById('topupAmount').value); if(a<=0){showAlert('Jumlah!','error');return;} showConfirm('TOP UP','Top up '+formatCurrency(a)+'?','topup',a); }
function processKuras(){ if(!currentAccount)return; var i=document.getElementById('kurasAmount').value.trim(); var a=i?parseAmount(i):currentAccount.balance; if(a<=0){showAlert('Saldo!','error');return;} showConfirm('KURAS','Kuras '+formatCurrency(a)+'?','kuras',a); }

async function addCash(a){ if(!currentAuthToken)return false; var r=await callRvnstore('/Client/ExecuteCloudScript','POST',{FunctionName:"AddRp",FunctionParameter:{addValue:a},RevisionSelection:"Live"},currentAuthToken); if(r.data){await new Promise(function(res){setTimeout(res,2000)});var ni=await getUserInfoFromPlayFab();if(ni){currentAccount.balance=ni.balance;currentAccount.facebook=ni.facebook;currentAccount.facebookAvatarUrl=ni.facebookAvatarUrl;currentAccount.playFabId=ni.playFabId;showAccountInfo(currentAccount);return true;}} return false; }

async function executeTopup(a){ showAlert('Proses...','info'); if(await addCash(a)){currentAccount.balance+=a;showReceipt('TOP UP',a);showAlert('Berhasil!','success');}else showAlert('Gagal!','error'); }
async function executeKuras(a){ showAlert('Proses...','info'); if(await addCash(-a)){currentAccount.balance-=a;showReceipt('KURAS',a);showAlert('Berhasil!','success');}else showAlert('Gagal!','error'); }

function showReceipt(t,a){ hideAllSections(); document.getElementById('receiptContent').innerHTML='<div style="text-align:center;padding:20px;"><h3>'+t+' BERHASIL</h3><p style="font-size:24px;">'+formatCurrency(a)+'</p></div><button class="btn btn-primary btn-block" onclick="backToAccount()">KEMBALI</button>'; document.getElementById('receiptSection').style.display='block'; }

function showTrxLagiModal(){ var m=document.getElementById('trxLagiModal'); if(m){m.style.display='flex';m.style.opacity='1';m.style.visibility='visible';} }
function tutupTrxLagiModal(){ var m=document.getElementById('trxLagiModal'); if(m)m.style.display='none'; showHome(); }
function pilihTopupLagi(){ tutupTrxLagiModal(); if(lastDeviceId&&currentAccount)showTopupFromAccount();else{showAlert('Cari akun dulu!','warning');showHome();} }
function pilihKurasLagi(){ tutupTrxLagiModal(); if(lastDeviceId&&currentAccount)showKurasFromAccount();else{showAlert('Cari akun dulu!','warning');showHome();} }

async function showHistory(){ hideAllSections(); document.getElementById('historySection').style.display='block'; document.getElementById('transactionsList').innerHTML='<p style="text-align:center;color:#666;">Riwayat di panel admin</p>'; }
function showSettings(){ hideAllSections(); document.getElementById('settingsSection').style.display='block'; updateProfileInfo(); }

function showConfirm(t,m,a,d){ document.getElementById('confirmTitle').innerHTML=sanitize(t); document.getElementById('confirmMessage').innerHTML=sanitize(m); pendingAction=a;pendingData=d; document.getElementById('confirmModal').classList.add('active'); }
function cancelConfirm(){ pendingAction=null;pendingData=null; document.getElementById('confirmModal').classList.remove('active'); }
async function confirmAction(){ if(!pendingAction||!pendingData)return; document.getElementById('confirmModal').classList.remove('active'); if(pendingAction==='topup')await executeTopup(pendingData); else if(pendingAction==='kuras')await executeKuras(pendingData); else if(pendingAction==='changename')await executeChangeName(pendingData); pendingAction=null;pendingData=null; }

async function checkNameAvailability(){ var d=document.getElementById('nameAvailability'); d.innerHTML='<div class="availability-checking">Mengecek...</div>'; d.style.display='block'; setTimeout(function(){d.innerHTML='<div class="availability-success">Tersedia!</div>';},1000); }

async function changeAccountNameSimple(){ var n=sanitize(document.getElementById('newAccountName').value.trim()); if(!n||!currentAccount||!currentAuthToken)return; showConfirm('GANTI NAMA','Ganti ke "'+n+'"?','changename',n); }
async function executeChangeName(n){ showAlert('Proses...','info'); var r=await callRvnstore('/Client/UpdateUserTitleDisplayName','POST',{DisplayName:n},currentAuthToken); if(r.data&&r.data.DisplayName){var o=currentAccount.name;currentAccount.name=n;document.getElementById('accountName').textContent=n;showReceipt('GANTI NAMA',0);showAlert('Berhasil!','success');}else showAlert('Gagal!','error'); }

function showNameChangeModal(m,t){ t=t||'info'; var modal=document.getElementById('nameChangeModal'); document.getElementById('nameChangeMessage').innerHTML=sanitize(m); modal.classList.add('active'); }
function closeNameChangeModal(){ document.getElementById('nameChangeModal').classList.remove('active'); }

function setupQuickAmounts(){ var q=document.querySelector('.quick-amounts'); if(q)q.innerHTML='<button class="btn-quick" onclick="setAmount(\'2M\')">2M</button><button class="btn-quick" onclick="setAmount(\'1M\')">1M</button><button class="btn-quick" onclick="setAmount(\'500JT\')">500JT</button><button class="btn-quick" onclick="setAmount(\'100JT\')">100JT</button>'; }
function setupEventListeners(){ document.getElementById('username')?.addEventListener('keypress',function(e){if(e.key==='Enter')document.getElementById('password').focus();}); document.getElementById('password')?.addEventListener('keypress',function(e){if(e.key==='Enter')login();}); }

document.addEventListener('DOMContentLoaded',async function(){
    setupEventListeners();setupQuickAmounts();
    var saved=localStorage.getItem('bussid_session');
    if(saved){try{var s=JSON.parse(saved);if(Date.now()-(s.timestamp||0)<7*86400000){var r=await callRevanstore('login','POST',{username:s.username,password:s.password});if(r&&r.success){var u=r.data;if(checkExpiry(u).expired){showExpiredBanner();return;}currentUser={id:u.id,username:u.username,password:s.password,role:u.role||'Operator',full_name:u.full_name||u.username,expiry_date:u.expiry_date||''};document.getElementById('loginScreen').style.display='none';document.getElementById('mainApp').style.display='block';showHome();updateProfileInfo();showAlert('Selamat datang!','success');}else localStorage.removeItem('bussid_session');}}catch(e){localStorage.removeItem('bussid_session');}}
});

window.login=login;window.logout=logout;window.searchAccount=searchAccount;window.refreshAccountInfo=refreshAccountInfo;
window.showTopupFromAccount=showTopupFromAccount;window.showKurasFromAccount=showKurasFromAccount;
window.showChangeNameSection=showChangeNameSection;window.backToAccount=backToAccount;
window.processTopup=processTopup;window.processKuras=processKuras;window.showHistory=showHistory;
window.showSettings=showSettings;window.showHome=showHome;window.cancelConfirm=cancelConfirm;
window.confirmAction=confirmAction;window.setAmount=setAmount;window.validateTopupAmount=validateTopupAmount;
window.checkNameAvailability=checkNameAvailability;window.changeAccountNameSimple=changeAccountNameSimple;
window.showTrxLagiModal=showTrxLagiModal;window.tutupTrxLagiModal=tutupTrxLagiModal;
window.pilihTopupLagi=pilihTopupLagi;window.pilihKurasLagi=pilihKurasLagi;
window.closeExpiredBanner=closeExpiredBanner;window.openWhatsApp=openWhatsApp;
window.updatePasswordCounter=updatePasswordCounter;window.closeDeleteHistoryModal=closeDeleteHistoryModal;
window.deleteAllHistory=deleteAllHistory;window.showDeleteHistoryConfirm=showDeleteHistoryConfirm;
window.closeNameChangeModal=closeNameChangeModal;window.showNameChangeModal=showNameChangeModal;