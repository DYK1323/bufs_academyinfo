'use strict';

const HAKGWA_SAFE_CATEGORY_OPTIONS = [
  '',
  '\uC778\uBB38',
  '\uC0AC\uD68C',
  '\uAD50\uC721',
  '\uACF5\uD559',
  '\uC790\uC5F0',
  '\uC758\uC57D',
  '\uC608\uCCB4\uB2A5',
];
const HAKGWA_SAFE_RENDER_BATCH = 200;

function getHakgwaSafeRowValue(row, preferredKeys, fallbackIndex) {
  if (!row || typeof row !== 'object') return '';

  for (const key of preferredKeys) {
    if (key in row && row[key] != null) {
      return String(row[key]).trim();
    }
  }

  const values = Object.entries(row)
    .filter(([key]) => !String(key).includes('\uCF54\uB4DC'))
    .map(([, value]) => value);

  return values[fallbackIndex] == null ? '' : String(values[fallbackIndex]).trim();
}

function buildHakgwaSafeOptions(selectedValue) {
  return HAKGWA_SAFE_CATEGORY_OPTIONS.map(value =>
    `<option value="${esc(value)}"${value === selectedValue ? ' selected' : ''}>${value || '(\uBBF8\uBD84\uB958)'}</option>`
  ).join('');
}

function createHakgwaSafeRow(name = '', category = '', subCategory = '', note = '') {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="cell-input" type="text" value="${esc(name)}" placeholder="\uC608: \uACBD\uC601\uD559\uACFC" oninput="setDirty()"></td>
    <td><select class="cell-input" style="padding:2px 4px;" onchange="setDirty()">${buildHakgwaSafeOptions(category)}</select></td>
    <td><input class="cell-input" type="text" value="${esc(subCategory)}" placeholder="\uC608: \uACBD\uC601\u00B7\uACBD\uC81C" style="width:110px;" oninput="setDirty()"></td>
    <td><input class="cell-input" type="text" value="${esc(note)}" placeholder="" oninput="setDirty()"></td>
    <td class="td-actions"><button class="btn btn-danger btn-sm" onclick="deleteHakgwaRow(this)">\uC0AD\uC81C</button></td>
  `;
  return tr;
}

function waitHakgwaSafePaint() {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

renderHakgwaTable = async function(rows) {
  const tbody = document.getElementById('hk-table-body');
  tbody.innerHTML = '';

  const list = Array.isArray(rows) ? rows : [];
  for (let i = 0; i < list.length; i += HAKGWA_SAFE_RENDER_BATCH) {
    const frag = document.createDocumentFragment();
    for (const row of list.slice(i, i + HAKGWA_SAFE_RENDER_BATCH)) {
      const name = getHakgwaSafeRowValue(row, ['\uD559\uACFC\uBA85'], 0);
      const category = getHakgwaSafeRowValue(row, ['\uB300\uACC4\uC5F4'], 1);
      const subCategory = getHakgwaSafeRowValue(row, ['\uC911\uACC4\uC5F4'], 2);
      const note = getHakgwaSafeRowValue(row, ['\uBE44\uACE0'], 3);
      frag.appendChild(createHakgwaSafeRow(name, category, subCategory, note));
    }
    tbody.appendChild(frag);
    updateHakgwaCount();
    showHakgwaEmptyHint();

    if (i + HAKGWA_SAFE_RENDER_BATCH < list.length) {
      await waitHakgwaSafePaint();
    }
  }

  updateHakgwaCount();
  showHakgwaEmptyHint();
};

appendHakgwaRow = function(name = '', category = '', subCategory = '', note = '') {
  const tbody = document.getElementById('hk-table-body');
  tbody.appendChild(createHakgwaSafeRow(name, category, subCategory, note));
  updateHakgwaCount();
  showHakgwaEmptyHint();
};

collectHakgwaData = function() {
  const rows = document.getElementById('hk-table-body').querySelectorAll('tr');
  const data = [];

  for (const tr of rows) {
    const inputs = tr.querySelectorAll('input');
    const sel = tr.querySelector('select');
    const name = inputs[0]?.value.trim() || '';
    const category = sel?.value.trim() || '';
    const subCategory = inputs[1]?.value.trim() || '';
    const note = inputs[2]?.value.trim() || '';
    if (!name) continue;

    const entry = {
      '\uD559\uACFC\uBA85': name,
      '\uB300\uACC4\uC5F4': category,
    };
    if (subCategory) entry['\uC911\uACC4\uC5F4'] = subCategory;
    if (note) entry['\uBE44\uACE0'] = note;
    data.push(entry);
  }

  return data;
};

function parseHakgwaCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) return [];

  const headers = lines[0].split(',').map(header => header.trim());
  const iName = headers.findIndex(header =>
    header.includes('\uD559\uACFC\uBA85') || header === '\uD559\uACFC'
  );
  const iCategory = headers.findIndex(header =>
    header === '\uB300\uACC4\uC5F4' || (header.includes('\uACC4\uC5F4') && !header.includes('\uC911') && !header.includes('\uC18C'))
  );
  const iSubCategory = headers.findIndex(header => header === '\uC911\uACC4\uC5F4');

  if (iName < 0) {
    throw new Error('\uD559\uACFC\uBA85 \uCEEC\uB7FC\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.');
  }

  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const name = (cols[iName] || '').trim();
    if (!name) continue;

    const entry = { '\uD559\uACFC\uBA85': name };
    if (iCategory >= 0) entry['\uB300\uACC4\uC5F4'] = (cols[iCategory] || '').trim();
    if (iSubCategory >= 0) entry['\uC911\uACC4\uC5F4'] = (cols[iSubCategory] || '').trim();
    result.push(entry);
  }

  return result;
}

onHakgwaFileLoad = function(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async ev => {
    try {
      const text = ev.target.result;
      const data = file.name.toLowerCase().endsWith('.json')
        ? JSON.parse(text)
        : parseHakgwaCsv(text);
      if (!data.length) throw new Error('\uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.');
      await renderHakgwaTable(data);
      setDirty();
    } catch (err) {
      alert(`\uD30C\uC77C \uC624\uB958: ${err.message}`);
    }
  };
  reader.readAsText(file, 'utf-8');
  e.target.value = '';
};
