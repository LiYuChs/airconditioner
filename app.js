const API_URL = window.COOL_HOURS_API_URL || '';
const fallbackUsers=[
  {id:'u1',name:'使用者一',color:'#c8ddd5'},{id:'u2',name:'使用者二',color:'#e8cbbd'},
  {id:'u3',name:'使用者三',color:'#d8d3e8'},{id:'u4',name:'使用者四',color:'#eadfb8'}];
let data={users:fallbackUsers,records:[],active:null},selectedId='u1',currentUser=null,token='',ticker=null,poller=null,busy=false;
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);

async function api(action,payload={}){
  if(!API_URL) throw new Error('尚未設定 Google 試算表連線網址，請參考 GOOGLE_SHEETS_SETUP.md');
  const response=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,...payload})});
  const result=await response.json();
  if(!result.ok) throw new Error(result.error||'雲端連線失敗');
  return result;
}
function applyData(next){data=next;currentUser=currentUser?data.users.find(u=>u.id===currentUser.id)||currentUser:null;renderPicker();if(currentUser){populateFilters();renderAll()}}
async function bootstrap(){
  renderPicker();
  if(!API_URL){$('#loginError').textContent='尚未設定雲端網址，請先依照設定說明完成部署。';return}
  try{const r=await api('bootstrap');applyData(r)}catch(e){$('#loginError').textContent='無法連接 Google 試算表：'+e.message}
}
function initials(name){return name.trim().slice(0,1)}
function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function renderPicker(){
  $('#userPicker').innerHTML=data.users.map(u=>`<button type="button" class="user-choice ${u.id===selectedId?'selected':''}" data-id="${u.id}"><span class="mini-avatar" style="background:${u.color}">${initials(u.name)}</span>${escapeHtml(u.name)}</button>`).join('');
  $$('.user-choice').forEach(b=>b.onclick=()=>{selectedId=b.dataset.id;renderPicker();$('#pin').focus()});
}
$('#loginForm').onsubmit=async e=>{
  e.preventDefault();if(busy)return;busy=true;$('#loginError').textContent='正在驗證…';
  try{const r=await api('login',{userId:selectedId,pin:$('#pin').value});token=r.token;currentUser=r.data.users.find(u=>u.id===selectedId);data=r.data;$('#pin').value='';$('#loginError').textContent='';showApp()}
  catch(err){$('#loginError').textContent=err.message}finally{busy=false}
};
function showApp(){
  $('#loginView').classList.add('hidden');$('#appView').classList.remove('hidden');updateIdentity();
  $('#todayText').textContent=new Intl.DateTimeFormat('zh-TW',{year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date()).toUpperCase();
  setManualDefaults();populateFilters();renderAll();startTimers();
}
function updateIdentity(){$('#sideName').textContent=currentUser.name;$('#sideAvatar').textContent=initials(currentUser.name);$('#sideAvatar').style.background=currentUser.color;$('#greeting').textContent=`你好，${currentUser.name}`}
function startTimers(){clearInterval(ticker);clearInterval(poller);ticker=setInterval(renderTimer,1000);poller=setInterval(sync,15000);renderTimer()}
async function sync(){if(busy||!currentUser)return;try{const r=await api('bootstrap');applyData(r)}catch{/* 保留畫面資料，下一輪再同步 */}}
$('#logoutBtn').onclick=()=>{currentUser=null;token='';clearInterval(ticker);clearInterval(poller);$('#appView').classList.add('hidden');$('#loginView').classList.remove('hidden');renderPicker()};
function renderTimer(){
  if(!currentUser)return;const active=data.active&&data.active.userId===currentUser.id?data.active:null,ms=active?Date.now()-active.start:0;
  $('#timer').textContent=formatClock(ms);$('#timerStatus').textContent=active?`開始於 ${time(active.start)}`:data.active?`${nameOf(data.active.userId)}正在使用冷氣`:'尚未開始使用冷氣';
  $('#timerBtn').classList.toggle('running',!!active);$('#timerBtn').innerHTML=active?'<span>■</span><b>結束計時</b><small>儲存本次紀錄</small>':'<span>▶</span><b>開始計時</b><small>記錄本次使用</small>';
}
$('#timerBtn').onclick=async()=>{
  if(busy)return;if(data.active&&data.active.userId!==currentUser.id){toast(`${nameOf(data.active.userId)}正在計時中`);return}
  busy=true;const stopping=!!data.active;$('#timerBtn').disabled=true;
  try{const r=await api(stopping?'stop':'start',{userId:currentUser.id,token});applyData(r);toast(stopping?'本次使用紀錄已儲存':'已開始計時')}
  catch(e){toast(e.message)}finally{busy=false;$('#timerBtn').disabled=false}
};
$('#manualForm').onsubmit=async e=>{
  e.preventDefault();if(busy)return;const start=new Date($('#manualStart').value),end=new Date($('#manualEnd').value);
  if(!isFinite(start)||!isFinite(end)){$('#manualError').textContent='請填寫完整的開始與結束日期時間。';return}
  if(end<=start){$('#manualError').textContent='結束時間必須晚於開始時間。';return}
  busy=true;try{const r=await api('add',{userId:currentUser.id,token,start:start.toISOString(),end:end.toISOString(),note:$('#manualNote').value.trim()||'手動補登'});applyData(r);e.target.reset();setManualDefaults();$('#manualError').textContent='';toast('補登紀錄已新增')}
  catch(err){$('#manualError').textContent=err.message}finally{busy=false}
};
function localDateTimeValue(date){
  const pad=value=>String(value).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function setManualDefaults(){
  const start=new Date(),end=new Date(start.getTime()+60*60*1000);
  start.setSeconds(0,0);end.setSeconds(0,0);
  $('#manualStart').value=localDateTimeValue(start);$('#manualEnd').value=localDateTimeValue(end);
}
function renderAll(){renderTimer();renderStats();renderUsageShare();renderRecent();renderRecords()}
function monthRecords(){const n=new Date();return data.records.filter(r=>{const d=new Date(r.start);return d.getFullYear()===n.getFullYear()&&d.getMonth()===n.getMonth()})}
function renderStats(){const all=monthRecords(),mine=all.filter(r=>r.userId===currentUser.id);$('#myMonth').textContent=hours(mine);$('#allMonth').textContent=hours(all);$('#myCount').textContent=mine.length}
function hours(rs){return(rs.reduce((s,r)=>s+r.end-r.start,0)/36e5).toFixed(1)}
function renderUsageShare(){
  const records=monthRecords(),totals=data.users.map(user=>({user,ms:records.filter(r=>r.userId===user.id).reduce((sum,r)=>sum+r.end-r.start,0)}));
  const totalMs=totals.reduce((sum,item)=>sum+item.ms,0),bill=Math.max(0,Number($('#electricityBill').value)||0);
  let cursor=0;const segments=totals.filter(item=>item.ms>0).map(item=>{const start=cursor;cursor+=item.ms/totalMs*100;return `${safeColor(item.user.color)} ${start}% ${cursor}%`});
  $('#usagePie').style.background=segments.length?`conic-gradient(${segments.join(',')})`:'#e4e5df';
  $('#pieHours').textContent=(totalMs/36e5).toFixed(1);
  $('#usageLegend').innerHTML=totals.map(({user,ms})=>{const percent=totalMs?ms/totalMs*100:0;return `<div><i style="background:${safeColor(user.color)}"></i><span>${escapeHtml(user.name)}</span><strong>${percent.toFixed(1)}%</strong><small>${(ms/36e5).toFixed(1)} 小時</small></div>`}).join('');
  $('#costBreakdown').innerHTML=totals.map(({user,ms})=>{const amount=totalMs?bill*ms/totalMs:0;return `<div><span><i style="background:${safeColor(user.color)}"></i>${escapeHtml(user.name)}</span><strong>${formatMoney(amount)}</strong></div>`}).join('')+(totalMs?'':'<p>本月尚無紀錄，暫時無法依比例分攤。</p>');
}
function safeColor(color){return /^#[0-9a-f]{6}$/i.test(color)?color:'#c8ddd5'}
function formatMoney(value){return new Intl.NumberFormat('zh-TW',{style:'currency',currency:'TWD',minimumFractionDigits:0,maximumFractionDigits:2}).format(value)}
function renderRecent(){const rs=data.records.filter(r=>r.userId===currentUser.id).slice(0,4);$('#recentList').innerHTML=rs.length?rs.map(recordRow).join(''):'<div class="empty">還沒有紀錄，開始第一次計時吧。</div>'}
function recordRow(r){const d=new Date(r.start);return`<div class="record-row"><span class="record-icon">❄</span><div><strong>${escapeHtml(r.note)}</strong><small>${d.toLocaleDateString('zh-TW')}・${time(r.start)} — ${time(r.end)}</small></div><span class="record-duration">${duration(r)} 小時</span></div>`}
function populateFilters(){const prev=$('#userFilter').value;$('#userFilter').innerHTML='<option value="all">所有成員</option>'+data.users.map(u=>`<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('');$('#userFilter').value=prev||'all';if(!$('#monthFilter').value){const n=new Date();$('#monthFilter').value=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`}}
function renderRecords(){
  const uid=$('#userFilter').value,month=$('#monthFilter').value;let rs=[...data.records];if(uid&&uid!=='all')rs=rs.filter(r=>r.userId===uid);if(month)rs=rs.filter(r=>localMonth(r.start)===month);
  $('#allRecords').innerHTML=rs.length?`<table class="data-table"><thead><tr><th>使用者</th><th>日期</th><th>時間</th><th>備註</th><th>時數</th><th></th></tr></thead><tbody>${rs.map(r=>`<tr><td>${escapeHtml(nameOf(r.userId))}</td><td>${new Date(r.start).toLocaleDateString('zh-TW')}</td><td>${time(r.start)} — ${time(r.end)}</td><td>${escapeHtml(r.note)}</td><td><strong>${duration(r)}</strong> 小時</td><td>${r.userId===currentUser.id?`<button class="delete-btn" data-delete="${r.id}">刪除</button>`:''}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">這個月份沒有使用紀錄。</div>';
  $$('[data-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('確定要刪除這筆紀錄嗎？')||busy)return;busy=true;try{const r=await api('delete',{userId:currentUser.id,token,id:b.dataset.delete});applyData(r);toast('紀錄已刪除')}catch(e){toast(e.message)}finally{busy=false}})
}
$('#userFilter').onchange=renderRecords;$('#monthFilter').onchange=renderRecords;
try{$('#electricityBill').value=localStorage.getItem('coolHoursElectricityBill')||''}catch{}
$('#electricityBill').oninput=()=>{try{localStorage.setItem('coolHoursElectricityBill',$('#electricityBill').value)}catch{}renderUsageShare()};
$$('.nav-item').forEach(b=>b.onclick=()=>goPage(b.dataset.page));$$('[data-goto]').forEach(b=>b.onclick=()=>goPage(b.dataset.goto));
function goPage(page){$$('.page').forEach(p=>p.classList.add('hidden'));$(`#${page}Page`).classList.remove('hidden');$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$('.sidebar').classList.remove('open');if(page==='settings')$('#displayName').value=currentUser.name}
$('#menuBtn').onclick=()=>$('.sidebar').classList.toggle('open');
$('#settingsForm').onsubmit=async e=>{
  e.preventDefault();if(busy)return;const msg=$('#settingsMessage'),np=$('#newPin').value;if(np&&!/^\d{4,6}$/.test(np)){msg.style.color='#b6432d';msg.textContent='新 PIN 必須為 4–6 位數字。';return}
  busy=true;try{const r=await api('profile',{userId:currentUser.id,token,currentPin:$('#currentPin').value,name:$('#displayName').value.trim(),newPin:np});token=r.token;data=r.data;currentUser=data.users.find(u=>u.id===currentUser.id);updateIdentity();renderPicker();populateFilters();$('#currentPin').value='';$('#newPin').value='';msg.style.color='#417b58';msg.textContent='設定已儲存。'}catch(err){msg.style.color='#b6432d';msg.textContent=err.message}finally{busy=false}
};
function nameOf(id){return data.users.find(u=>u.id===id)?.name||'未知'}
function time(v){return new Date(v).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',hour12:false})}
function localMonth(v){const d=new Date(v);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
function duration(r){return((r.end-r.start)/36e5).toFixed(2)}
function formatClock(ms){const s=Math.max(0,Math.floor(ms/1000));return[Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(x=>String(x).padStart(2,'0')).join(':')}
function toast(t){const el=$('#toast');el.textContent=t;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600)}
bootstrap();
