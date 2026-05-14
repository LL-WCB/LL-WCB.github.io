let workbook = null;
let allData = [];       // array of row arrays (including header row at [0])
let columns = [];       // column names from row 0
let checkColIdx = -1;   // index of the 'check' column
let colFormats = {};    // map of original col index → number format string (e.g. "#,##0.00")

// ── File ingestion ──────────────────────────────────────────

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = new Uint8Array(e.target.result);
      workbook = XLSX.read(data, { type: 'array', cellDates: true, cellNF: true, cellStyles: true });
      parseSheet();
      document.getElementById('fileName').textContent = file.name;
      document.getElementById('fileBadge').classList.add('visible');
    } catch (err) {
      showToast('⚠ Could not read file: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

function parseSheet() {
  const sheetName = workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  // header: 1 gives array-of-arrays; no defval so empty cells are undefined (easier to detect)
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1 });
  if (!raw || raw.length < 2) { showToast('⚠ Sheet appears empty or has no data rows.'); return; }

  // Normalise: pad all rows to header length, empty cells → ''
  const headerRow = raw[0].map(c => (c !== undefined && c !== null) ? String(c).trim() : '');
  const maxLen = headerRow.length;
  allData = raw.map(row => {
    const r = [...row];
    while (r.length < maxLen) r.push('');
    return r;
  });

  columns = headerRow;
  checkColIdx = columns.findIndex(c => c.trim().toLowerCase() === 'check');

  // Extract number format codes from the first data row of the original sheet
  // SheetJS cell addresses are like A1, B2 etc. Row 2 = first data row (1-indexed)
  colFormats = {};
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const firstDataRow = 1; // 0-indexed: row index 1 = Excel row 2
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: firstDataRow, c });
    const cell = ws[addr];
    if (cell && cell.z) {
      colFormats[c] = cell.z; // z is the number format string
    }
  }

  buildColumnUI(checkColIdx < 0);
  updateStats();
  document.getElementById('colSection').classList.add('visible');
}

// ── Column UI ───────────────────────────────────────────────

function buildColumnUI(noCheckCol) {
  const grid = document.getElementById('colGrid');
  grid.innerHTML = '';

  // Show/hide warning if no 'check' column found
  let warn = document.getElementById('noCheckWarn');
  if (!warn) {
    warn = document.createElement('p');
    warn.id = 'noCheckWarn';
    warn.className = 'note';
    warn.style.cssText = 'color: var(--accent2); margin-bottom: 12px; display: none;';
    warn.innerHTML = '⚠ No <strong>check</strong> column found in the first row — all rows will be exported.';
    grid.parentNode.insertBefore(warn, grid);
  }
  warn.style.display = noCheckCol ? 'block' : 'none';

  columns.forEach((col, i) => {
    if (i === checkColIdx) return; // skip 'check' column

    const item = document.createElement('label');
    item.className = 'col-item checked';
    item.dataset.idx = i;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.dataset.idx = i;
    cb.addEventListener('change', () => {
      item.classList.toggle('checked', cb.checked);
      updateStats();
    });

    const name = document.createElement('span');
    name.className = 'col-name';
    name.textContent = col || `(col ${i + 1})`;
    name.title = col;

    item.appendChild(cb);
    item.appendChild(name);
    grid.appendChild(item);
  });

  document.getElementById('colMeta').textContent = `${columns.length - (checkColIdx >= 0 ? 1 : 0)} columns detected`;
}

function getCheckedColIndices() {
  return [...document.querySelectorAll('#colGrid input[type="checkbox"]:checked')]
    .map(cb => parseInt(cb.dataset.idx));
}

function selectAll() {
  document.querySelectorAll('#colGrid input[type="checkbox"]').forEach(cb => {
    cb.checked = true;
    cb.closest('.col-item').classList.add('checked');
  });
  updateStats();
}

function selectNone() {
  document.querySelectorAll('#colGrid input[type="checkbox"]').forEach(cb => {
    cb.checked = false;
    cb.closest('.col-item').classList.remove('checked');
  });
  updateStats();
}

// ── Stats ───────────────────────────────────────────────────

function updateStats() {
  const dataRows = allData.slice(1);
  const totalRows = dataRows.length;

  let checkedRows;
  if (checkColIdx >= 0) {
    checkedRows = dataRows.filter(row => {
      const val = row[checkColIdx];
      return val !== undefined && val !== null && String(val).trim() !== '';
    }).length;
  } else {
    checkedRows = totalRows; // no check column → include all
  }

  const selCols = getCheckedColIndices().length;

  document.getElementById('statTotalRows').textContent = totalRows.toLocaleString();
  document.getElementById('statCheckedRows').textContent = checkedRows.toLocaleString();
  document.getElementById('statSelCols').textContent = selCols.toLocaleString();

  document.getElementById('exportBtn').disabled = selCols === 0;
}

// ── Export ──────────────────────────────────────────────────

function exportFile() {
  const selIdx = getCheckedColIndices();
  if (selIdx.length === 0) { showToast('⚠ Select at least one column.'); return; }

  // Header row
  const outputRows = [selIdx.map(i => columns[i])];

  // Data rows — filter by 'check' column
  const dataRows = allData.slice(1);
  const filteredRows = checkColIdx >= 0
    ? dataRows.filter(row => {
        const val = row[checkColIdx];
        return val !== undefined && val !== null && String(val).trim() !== '';
      })
    : dataRows;

  filteredRows.forEach(row => {
    outputRows.push(selIdx.map(i => row[i]));
  });

  const ws = XLSX.utils.aoa_to_sheet(outputRows);

  // Apply original number formats to each column's data cells
  selIdx.forEach((origColIdx, outColIdx) => {
    const fmt = colFormats[origColIdx];
    if (!fmt) return;
    // Start at row index 1 (skip header row 0)
    for (let r = 1; r < outputRows.length; r++) {
      const addr = XLSX.utils.encode_cell({ r, c: outColIdx });
      if (ws[addr] && ws[addr].t === 'n') { // only apply to numeric cells
        ws[addr].z = fmt;
      }
    }
  });

  // Auto column widths
  const colWidths = selIdx.map((_, ci) => {
    const maxLen = outputRows.reduce((m, row) => {
      const v = row[ci];
      return Math.max(m, v != null ? String(v).length : 0);
    }, 10);
    return { wch: Math.min(maxLen + 2, 40) };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Filtered');
  XLSX.writeFile(wb, 'filtered_export.xlsx');

  showToast(`✓ Exported ${filteredRows.length} rows × ${selIdx.length} columns`);
}

// ── Toast ───────────────────────────────────────────────────

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}