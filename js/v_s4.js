/* ============================================================
 * 视图：节假日值班（Excel，自动填充）
 * ============================================================ */
window.VS4 = (function () {

  function render(main) {
    main.innerHTML = '';
    const u = App.currentUser();
    const admin = u.role === 'admin';

    // 顶部：年份 + 节假日选择 + 生成
    const bar = document.createElement('div');
    bar.className = 'editor-bar';
    bar.innerHTML = `
      <label>年份 <select id="s4-year">${yearOptions()}</select></label>
      <label>节假日 <select id="s4-holiday"></select></label>
      <button id="s4-gen" class="btn btn-primary">🔁 自动填充生成</button>
      <span class="spacer"></span>
      <button id="s4-export" class="btn btn-primary">📤 导出 Excel</button>
    `;
    main.appendChild(bar);

    const holidaySel = bar.querySelector('#s4-holiday');
    function loadHolidays() {
      const year = +bar.querySelector('#s4-year').value;
      const h = CONFIG.HOLIDAYS[year];
      holidaySel.innerHTML = '';
      if (!h || !h.holidays.length) {
        holidaySel.innerHTML = '<option value="">该年份无节假日数据</option>';
        return;
      }
      h.holidays.forEach(x => {
        holidaySel.innerHTML += `<option value="${x.name}">${x.name}（${x.start[0]}月${x.start[1]}日—${x.end[0]}月${x.end[1]}日）</option>`;
      });
    }
    loadHolidays();
    bar.querySelector('#s4-year').addEventListener('change', () => { loadHolidays(); loadOrGen(); });

    let s4 = Store.getS4();

    function loadOrGen() {
      s4 = Store.getS4();
      renderResult();
    }

    bar.querySelector('#s4-gen').addEventListener('click', () => {
      const year = +bar.querySelector('#s4-year').value;
      const name = holidaySel.value;
      if (!name) { alert('请选择节假日'); return; }
      s4 = generate(year, name);
      Store.setS4(s4);
      renderResult();
    });
    bar.querySelector('#s4-export').addEventListener('click', exportExcel);

    const resultBox = document.createElement('div');
    resultBox.id = 's4-result';
    main.appendChild(resultBox);

    function renderResult() {
      resultBox.innerHTML = '';
      if (!s4) {
        resultBox.innerHTML = '<div class="card"><div class="muted">请选择节假日并点击「自动填充生成」。</div></div>';
        return;
      }
      // sheet tabs
      const sheetNames = ['鼎盛公司'].concat(CONFIG.DEPARTMENTS.map(d => d.name));
      const tabs = document.createElement('div');
      tabs.className = 'dept-tabs';
      sheetNames.forEach((sn, i) => {
        tabs.innerHTML += `<button class="dept-tab ${i === 0 ? 'active' : ''}" data-sheet="${sn}">${sn}</button>`;
      });
      resultBox.appendChild(tabs);

      const sheetView = document.createElement('div');
      sheetView.className = 's4-sheet';
      resultBox.appendChild(sheetView);

      function showSheet(name) {
        const sheet = (s4.sheets || {})[name];
        if (!sheet) { sheetView.innerHTML = '<div class="muted">无数据</div>'; return; }
        // 构建可编辑表格
        const table = document.createElement('table');
        table.className = 's4-table';
        const thead = document.createElement('thead');
        let hr = '<tr><th class="s4-label-head">班组/区域</th>';
        s4.dates.forEach(dt => { hr += `<th colspan="2">${dt.m}月${dt.d}日</th>`; });
        hr += '</tr><tr><th></th>';
        s4.dates.forEach(() => { hr += '<th>白天</th><th>晚上</th>'; });
        hr += '</tr>';
        thead.innerHTML = hr;
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        sheet.rows.forEach((r, ri) => {
          const tr = document.createElement('tr');
          const tdLabel = document.createElement('td');
          tdLabel.className = 's4-label';
          tdLabel.textContent = r.label;
          tr.appendChild(tdLabel);
          s4.dates.forEach(dt => {
            const key = `${dt.m}-${dt.d}`;
            const dd = (r.days && r.days[key]) || {};
            tr.appendChild(makeCell(dd, 'day', name, ri, key));
            tr.appendChild(makeCell(dd, 'night', name, ri, key));
          });
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        sheetView.innerHTML = '';
        sheetView.appendChild(table);
      }

      function makeCell(dd, part, sheetName, ri, key) {
        const td = document.createElement('td');
        td.className = 's4-cell';
        const p = dd[part];
        renderVal(td, p);
        td.addEventListener('click', () => editCell(td, sheetName, ri, key, part));
        return td;
      }
      function renderVal(td, p) {
        td.innerHTML = '';
        if (p && p.name) {
          const ph = Utils.phoneText(p);
          td.innerHTML = `<span class="cell-name">${esc(p.name)}</span>${ph ? `<span class="cell-phone">${esc(ph)}</span>` : ''}`;
          td.classList.add('filled');
        }
      }
      function editCell(td, sheetName, ri, key, part) {
        const cur = (s4.sheets[sheetName].rows[ri].days[key] || {})[part] || {};
        const overlay = personPickerModal(cur, (p) => {
          const row = s4.sheets[sheetName].rows[ri];
          if (!row.days) row.days = {};
          if (!row.days[key]) row.days[key] = {};
          row.days[key][part] = { name: p.name, phone: p.phone };
          Store.setS4(s4);
          renderVal(td, { name: p.name, phone: p.phone });
        });
        overlay.addEventListener('clear', () => {
          const row = s4.sheets[sheetName].rows[ri];
          if (row.days && row.days[key]) row.days[key][part] = {};
          Store.setS4(s4);
          renderVal(td, null);
        });
      }

      tabs.querySelectorAll('.dept-tab').forEach(t => t.addEventListener('click', () => {
        tabs.querySelectorAll('.dept-tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        showSheet(t.getAttribute('data-sheet'));
      }));
      showSheet('鼎盛公司');
    }

    function exportExcel() {
      if (!s4) { alert('请先生成节假日值班表'); return; }
      const wb = ExcelGen.buildHolidayWorkbook(s4);
      ExcelGen.download(wb, `${CONFIG.COMPANY.shortName}${s4.year}年${s4.holidayName}值班表.xlsx`);
    }

    // 初始：若有已有数据则显示
    if (s4) {
      bar.querySelector('#s4-year').value = s4.year;
      loadHolidays();
      holidaySel.value = s4.holidayName;
      renderResult();
    }
  }

  /* ---------- 生成逻辑 ---------- */
  function generate(year, holidayName) {
    const h = CONFIG.HOLIDAYS[year];
    const holiday = h && h.holidays.find(x => x.name === holidayName);
    if (!holiday) return null;

    const dates = [];
    const [sm, sd] = holiday.start, [em, ed] = holiday.end;
    // 跨月/同月日期枚举
    let cm = sm, cd = sd;
    while (true) {
      dates.push({ y: year, m: cm, d: cd });
      if (cm === em && cd === ed) break;
      cd++;
      const dim = Utils.daysInMonth(year, cm);
      if (cd > dim) { cd = 1; cm++; }
      if (cm > 12) break;
    }

    function dayKey(dt) { return `${dt.m}-${dt.d}`; }
    function emptyDays() {
      const o = {};
      dates.forEach(dt => o[dayKey(dt)] = { day: {}, night: {} });
      return o;
    }
    // 一级值班 -> 全天（白天+晚上同人）
    function fillS1() {
      const o = emptyDays();
      const s1 = Store.getS1();
      if (s1) {
        dates.forEach(dt => {
          const p = s1.assignments && s1.assignments[dt.d];
          if (p && p.name) o[dayKey(dt)] = { day: { name: p.name, phone: p.phone }, night: { name: p.name, phone: p.phone } };
        });
      }
      return o;
    }
    // 二级值班 -> 办公室（全天）
    function fillS2(deptId) {
      const o = emptyDays();
      const s2 = Store.getS2(deptId);
      if (s2) {
        dates.forEach(dt => {
          const p = s2.assignments && s2.assignments[dt.d];
          if (p && p.name) o[dayKey(dt)] = { day: { name: p.name, phone: p.phone }, night: { name: p.name, phone: p.phone } };
        });
      }
      return o;
    }
    // 班组值班 -> 班组（全天）
    function fillS3(deptId, teamName) {
      const o = emptyDays();
      const s3 = Store.getS3(deptId);
      if (s3) {
        dates.forEach(dt => {
          const p = s3.cells && s3.cells[dt.d] && s3.cells[dt.d][teamName];
          if (p && p.name) o[dayKey(dt)] = { day: { name: p.name, phone: p.phone }, night: { name: p.name, phone: p.phone } };
        });
      }
      return o;
    }

    const sheets = {};

    // 鼎盛公司 汇总
    const companyRows = [];
    companyRows.push({ label: '一级值班领导', days: fillS1() });
    // 公司级部门（可手工填）
    CONFIG.COMPANY_LEVEL.forEach(d => companyRows.push({ label: d, days: emptyDays() }));
    // 各部门办公室人员
    CONFIG.DEPARTMENTS.forEach(dept => {
      companyRows.push({ label: `${dept.name}（${dept.biz}）`, days: fillS2(dept.id) });
    });
    sheets['鼎盛公司'] = { rows: companyRows };

    // 各部门 sheet
    CONFIG.DEPARTMENTS.forEach(dept => {
      const rows = [];
      rows.push({ label: '办公室', days: fillS2(dept.id) });
      Store.teamsOf(dept.name).forEach(t => {
        rows.push({ label: t.name, days: fillS3(dept.id, t.name) });
      });
      sheets[dept.name] = { rows };
    });

    return { year, holidayName, dates, sheets };
  }

  /* ---------- 人员选择弹窗 ---------- */
  function personPickerModal(cur, onPick) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal">
      <div class="modal-title">选择值班人</div>
      <input id="pk-search" class="inp" placeholder="搜索 姓名/拼音/电话…" style="width:100%">
      <div class="pk-list"></div>
      <div class="modal-actions">
        <button id="pk-clear" class="btn btn-danger">清空</button>
        <button id="pk-cancel" class="btn">取消</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);

    const list = overlay.querySelector('.pk-list');
    function refresh(q) {
      list.innerHTML = '';
      const people = Store.listPersonnel().filter(p => Utils.matchPerson(q, p)).slice(0, 50);
      people.forEach(p => {
        const item = document.createElement('div');
        item.className = 'pp-item';
        item.innerHTML = `<div class="pp-name">${esc(p.name)}</div><div class="pp-phone">${esc(Utils.phoneText(p))}</div>${p.team ? `<span class="pp-tag">${esc(p.team)}</span>` : ''}`;
        item.addEventListener('click', () => { onPick(p); overlay.remove(); });
        list.appendChild(item);
      });
      if (people.length === 0) list.innerHTML = '<div class="muted">无匹配人员</div>';
    }
    refresh('');
    overlay.querySelector('#pk-search').addEventListener('input', (e) => refresh(e.target.value));
    overlay.querySelector('#pk-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#pk-clear').addEventListener('click', () => {
      overlay.dispatchEvent(new CustomEvent('clear'));
      overlay.remove();
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    return overlay;
  }

  function yearOptions() {
    const y = new Date().getFullYear(); let s = '';
    for (let i = y - 1; i <= y + 2; i++) s += `<option value="${i}" ${i === y ? 'selected' : ''}>${i}</option>`;
    return s;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  return { render };
})();
