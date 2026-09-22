const API_URL = "https://script.google.com/macros/s/AKfycbzqyAK_6qsewxkGA9F3xh8XRvrX3-nZsozhnoQiGQl2IeaedTuLxlCHZ3Sy_JlTk3pgAw/exec";

let db = {headers: [], rows: []};

const $ = id => document.getElementById(id);

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function isMobileHeader(h) {
  return /mobile|phone|contact|telephone|cell/i.test(h);
}

function isBloodHeader(h) {
  return /blood/i.test(h);
}

function isAvailabilityHeader(h) {
  return /available|availability|status/i.test(h);
}

function uniqueValues(header) {
  return [...new Set(db.rows.map(r => String(r[header] ?? "").trim()).filter(Boolean))].sort();
}

async function loadData() {
  try {
    if (API_URL.startsWith("PASTE_")) {
      db = {
        headers: ["Name","Roll","Batch","Mobile Number","Blood Group","Available"],
        rows: [
          {Name:"Sample Student",Roll:"101",Batch:"2022-23","Mobile Number":"01700000000","Blood Group":"O+","Available":"Available"}
        ]
      };
    } else {
      const res = await fetch(API_URL + "?t=" + Date.now());
      db = await res.json();
      if (!db.headers) db.headers = [];
      if (!db.rows) db.rows = [];
    }
    buildUI();
  } catch (err) {
    $("tableWrap").innerHTML = `<div class="error">Could not load Google Sheet data.</div>`;
  }
}

function buildUI() {
  const headers = db.headers.filter(Boolean);

  $("stats").innerHTML = `
    <div class="stat"><b>${db.rows.length}</b><span>RECORDS</span></div>
    <div class="stat"><b>${headers.length}</b><span>COLUMNS</span></div>
    <div class="stat"><b>${db.rows.filter(r => Object.values(r).some(v => /available/i.test(String(v)))).length}</b><span>AVAILABLE / STATUS MATCHES</span></div>
  `;

  const filters = headers.filter(h => isBloodHeader(h) || isAvailabilityHeader(h) || uniqueValues(h).length <= 30);

  $("filters").innerHTML = filters.slice(0, 4).map(h => `
    <select class="filter" data-header="${esc(h)}" onchange="renderTable()">
      <option value="">All ${esc(h)}</option>
      ${uniqueValues(h).map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("")}
    </select>
  `).join("");

  $("tableHead").innerHTML = headers.map(h => `<th>${esc(h)}</th>`).join("");
  $("tableHead").innerHTML += `<th>Action</th>`;

  const form = $("dynamicForm");
  form.innerHTML = headers.map(h => `
    <label>
      <span>${esc(h)}</span>
      <input name="field" data-header="${esc(h)}" placeholder="${esc(h)}">
    </label>
  `).join("") + `
    <label><span>Admin PIN</span><input name="pin" id="adminPin" type="password" placeholder="Admin PIN" required></label>
    <button type="submit">Add to Google Sheet</button>
  `;

  renderTable();
}

function getFilteredRows() {
  const q = $("search").value.toLowerCase().trim();
  const selects = [...document.querySelectorAll(".filter")];

  return db.rows.filter(row => {
    const matchesSearch = !q || db.headers.some(h =>
      String(row[h] ?? "").toLowerCase().includes(q)
    );

    const matchesFilters = selects.every(s =>
      !s.value || String(row[s.dataset.header] ?? "") === s.value
    );

    return matchesSearch && matchesFilters;
  });
}

function renderTable() {
  const rows = getFilteredRows();
  const headers = db.headers.filter(Boolean);

  $("count").textContent = `${rows.length} record${rows.length === 1 ? "" : "s"}`;

  $("tableBody").innerHTML = rows.map(row => `
    <tr>
      ${headers.map(h => {
        const value = row[h] ?? "";
        if (isMobileHeader(h) && value) {
          const tel = String(value).replace(/[^\d+]/g, "");
          return `<td><a class="phone" href="tel:${esc(tel)}">${esc(value)}</a></td>`;
        }
        if (isBloodHeader(h) && value) {
          return `<td><span class="blood">${esc(value)}</span></td>`;
        }
        if (isAvailabilityHeader(h) && value) {
          const ok = /available|yes|active/i.test(String(value));
          return `<td><span class="pill ${ok ? "ok" : "no"}">${esc(value)}</span></td>`;
        }
        return `<td>${esc(value)}</td>`;
      }).join("")}
      <td><button class="editHint" onclick="alert('Edit or delete this record directly in the Google Sheet. The website updates automatically when refreshed.')">Sheet</button></td>
    </tr>
  `).join("");

  $("empty").style.display = rows.length ? "none" : "block";
}

$("dynamicForm").addEventListener("submit", async e => {
  e.preventDefault();

  if (API_URL.startsWith("PASTE_")) {
    $("formMsg").textContent = "First connect the Apps Script Web App URL in app.js.";
    return;
  }

  const fields = {};
  document.querySelectorAll('#dynamicForm input[data-header]').forEach(input => {
    fields[input.dataset.header] = input.value;
  });

  const pin = $("adminPin").value;
  $("formMsg").textContent = "Saving...";

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ pin, fields })
    });
    const out = await res.json();

    $("formMsg").textContent = out.message || (out.success ? "Saved." : "Failed.");

    if (out.success) {
      document.querySelectorAll('#dynamicForm input[data-header]').forEach(i => i.value = "");
      $("adminPin").value = "";
      setTimeout(() => {
        closeModal();
        loadData();
      }, 700);
    }
  } catch (err) {
    $("formMsg").textContent = "Connection failed. Check the Apps Script deployment.";
  }
});

function openModal() { $("modal").classList.remove("hide"); }
function closeModal() { $("modal").classList.add("hide"); $("formMsg").textContent = ""; }
function resetFilters() {
  $("search").value = "";
  document.querySelectorAll(".filter").forEach(s => s.value = "");
  renderTable();
}

$("search").addEventListener("input", renderTable);
$("year").textContent = new Date().getFullYear();
loadData();