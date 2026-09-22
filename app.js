/*
  UBMC Blood Directory
  IMPORTANT: Keep your existing API_URL line from your working app.js.
*/
const API_URL = "https://script.google.com/macros/s/AKfycbzqyAK_6qsewxkGA9F3xh8XRvrX3-nZsozhnoQiGQl2IeaedTuLxlCHZ3Sy_JlTk3pgAw/exec";
const AUTO_SYNC_MS = 30000;
const CACHE_KEY = "ubmc_blood_directory_cache_v1";

let db = {headers: [], rows: []};
let loading = true;

const $ = id => document.getElementById(id);

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}
function isMobileHeader(h){ return /mobile|phone|contact|telephone|cell/i.test(h); }
function isBloodHeader(h){ return /blood/i.test(h); }
function isAvailabilityHeader(h){ return /available|availability|status/i.test(h); }
function uniqueValues(header){
  return [...new Set(db.rows.map(r=>String(r[header]??"").trim()).filter(Boolean))].sort();
}

function saveCache(){
  try{ localStorage.setItem(CACHE_KEY, JSON.stringify(db)); }catch(e){}
}
function loadCache(){
  try{
    const saved=localStorage.getItem(CACHE_KEY);
    if(saved){
      const parsed=JSON.parse(saved);
      if(parsed && Array.isArray(parsed.headers) && Array.isArray(parsed.rows)){
        db=parsed;
        return true;
      }
    }
  }catch(e){}
  return false;
}

function showLoading(){
  if($("empty")) $("empty").style.display="none";
  if($("tableBody")) $("tableBody").innerHTML=
    `<tr><td colspan="${Math.max(db.headers.length+1,1)}" class="loadingCell">Loading latest data…</td></tr>`;
}
function showTemporaryError(){
  if($("empty")) $("empty").style.display="none";
  if($("tableBody")) $("tableBody").innerHTML=
    `<tr><td colspan="${Math.max(db.headers.length+1,1)}" class="loadingCell">Connecting to the Google Sheet…</td></tr>`;
}

async function fetchFreshData(){
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), 15000);
  try{
    const res=await fetch(API_URL+"?t="+Date.now(),{
      method:"GET",
      cache:"no-store",
      signal:controller.signal
    });
    if(!res.ok) throw new Error("HTTP "+res.status);
    const fresh=await res.json();
    if(!Array.isArray(fresh.headers) || !Array.isArray(fresh.rows)){
      throw new Error("Invalid data");
    }
    db=fresh;
    saveCache();
    return true;
  }finally{
    clearTimeout(timer);
  }
}

async function loadData(silent=false){
  if(API_URL.startsWith("PASTE_")){
    const hasCache=loadCache();
    if(!hasCache){
      db={headers:["Name","Roll","Batch","Mobile Number","Blood Group","Available"],rows:[]};
    }
    buildUI();
    return;
  }

  if(!silent && !loadCache()) showLoading();
  else if(!silent && db.rows.length===0) showTemporaryError();

  try{
    await fetchFreshData();
    loading=false;
    buildUI();
  }catch(err){
    loading=false;
    // IMPORTANT: Never erase working data when the network/API is slow.
    if(db.rows.length>0){
      buildUI();
    }else{
      showTemporaryError();
      // Retry shortly without asking the user to refresh.
      setTimeout(()=>loadData(true),2500);
    }
  }
}

function buildUI(){
  const headers=db.headers.filter(Boolean);

  $("stats").innerHTML=`
    <div class="stat"><b>${db.rows.length}</b><span>RECORDS</span></div>
    <div class="stat"><b>${headers.length}</b><span>COLUMNS</span></div>
    <div class="stat"><b>${db.rows.filter(r=>Object.values(r).some(v=>/available/i.test(String(v)))).length}</b><span>AVAILABLE / STATUS MATCHES</span></div>`;

  const filters=headers.filter(h=>isBloodHeader(h)||isAvailabilityHeader(h)||uniqueValues(h).length<=30);
  $("filters").innerHTML=filters.slice(0,4).map(h=>`
    <select class="filter" data-header="${esc(h)}" onchange="renderTable()">
      <option value="">All ${esc(h)}</option>
      ${uniqueValues(h).map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("")}
    </select>`).join("");

  $("tableHead").innerHTML=headers.map(h=>`<th>${esc(h)}</th>`).join("")+`<th>Action</th>`;

  $("dynamicForm").innerHTML=headers.map(h=>`
    <label><span>${esc(h)}</span><input name="field" data-header="${esc(h)}" placeholder="${esc(h)}"></label>
  `).join("")+`
    <label><span>Admin PIN</span><input name="pin" id="adminPin" type="password" placeholder="Admin PIN" required></label>
    <button type="submit">Add to Google Sheet</button>`;

  renderTable();
}

function getFilteredRows(){
  const q=$("search").value.toLowerCase().trim();
  const selects=[...document.querySelectorAll(".filter")];
  return db.rows.filter(row=>{
    const matchesSearch=!q||db.headers.some(h=>String(row[h]??"").toLowerCase().includes(q));
    const matchesFilters=selects.every(s=>!s.value||String(row[s.dataset.header]??"")===s.value);
    return matchesSearch&&matchesFilters;
  });
}

function renderTable(){
  const rows=getFilteredRows(), headers=db.headers.filter(Boolean);
  $("count").textContent=`${rows.length} record${rows.length===1?"":"s"}`;

  $("tableBody").innerHTML=rows.map(row=>`
    <tr>${headers.map(h=>{
      const value=row[h]??"";
      if(isMobileHeader(h)&&value){
        const tel=String(value).replace(/[^\d+]/g,"");
        return `<td><a class="phone" href="tel:${esc(tel)}">${esc(value)}</a></td>`;
      }
      if(isBloodHeader(h)&&value) return `<td><span class="blood">${esc(value)}</span></td>`;
      if(isAvailabilityHeader(h)&&value){
        const ok=/available|yes|active/i.test(String(value));
        return `<td><span class="pill ${ok?"ok":"no"}">${esc(value)}</span></td>`;
      }
      return `<td>${esc(value)}</td>`;
    }).join("")}
      <td><button class="editHint" onclick="alert('Edit or delete this record directly in the Google Sheet. The website will update automatically.')">Sheet</button></td>
    </tr>`).join("");

  $("empty").style.display=rows.length?"none":"block";
}

$("dynamicForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(API_URL.startsWith("PASTE_")){ $("formMsg").textContent="Connect the Apps Script URL first."; return; }

  const fields={};
  document.querySelectorAll('#dynamicForm input[data-header]').forEach(i=>fields[i.dataset.header]=i.value);
  const pin=$("adminPin").value;
  $("formMsg").textContent="Saving…";

  try{
    const res=await fetch(API_URL,{method:"POST",body:JSON.stringify({pin,fields})});
    const out=await res.json();
    $("formMsg").textContent=out.message||(out.success?"Saved.":"Failed.");
    if(out.success){
      document.querySelectorAll('#dynamicForm input[data-header]').forEach(i=>i.value="");
      $("adminPin").value="";
      setTimeout(()=>{closeModal();loadData(true);},500);
    }
  }catch(err){ $("formMsg").textContent="Connection failed. Try again."; }
});

function openModal(){ $("modal").classList.remove("hide"); }
function closeModal(){ $("modal").classList.add("hide"); $("formMsg").textContent=""; }
function resetFilters(){ $("search").value=""; document.querySelectorAll(".filter").forEach(s=>s.value=""); renderTable(); }

$("search").addEventListener("input",renderTable);
$("year").textContent=new Date().getFullYear();

// 1) Show previously successful data immediately.
// 2) Fetch the latest Sheet data in the background.
// 3) Keep old data if the Google service is temporarily slow.
const hadCache=loadCache();
if(hadCache) buildUI(); else showLoading();
loadData(false);

// Automatic background sync every 30 seconds.
setInterval(()=>loadData(true),AUTO_SYNC_MS);
