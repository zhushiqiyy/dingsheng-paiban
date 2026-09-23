/* ============================================================
 * 视图：班组值班（Excel 多表）
 * ============================================================ */
window.VS3 = (function () {

  const BANZU_UNITS = [
    { deptId: 'yibu', deptName: '项目一部', sheetName: '炼油事业部', title: '炼油芳烃事业部维保班组值班表' },
    { deptId: 'erbu', deptName: '项目二部', sheetName: '乙烯化工事业部', title: '乙烯化工事业部维保班组值班表' },
    { deptId: 'sanbu', deptName: '项目三部', sheetName: '新材料事业部', title: '新材料事业部维保班组值班表' },
    { deptId: 'sibu', deptName: '项目四部', sheetName: '公用工程事业部', title: '公用工程事业部维保班组值班表' },
    { deptId: 'wubu', deptName: '项目五部', sheetName: '码头储运事业部', title: '码头储运事业部维保班组值班表' },
    { deptId: 'zonghe', deptName: '综合维修部', sheetName: '综合维修部（全厂性）', title: '综合维修部班组值班表' },
  ];

  function nextMonth() {
    const now = new Date();
    let y = now.getFullYear(), m = now.getMonth() + 1;
    m += 1; if (m > 12) { m = 1; y += 1; }
    return { year: y, month: m };
  }

  // 用户所属部门 → 班组值班单元
  function unitForDeptName(deptName) {
    return BANZU_UNITS.find(u => u.deptName === deptName) || null;
  }

  function render(main) {
    const u = App.currentUser();
    const admin = u.role === 'admin';
    let unit = admin ? (window.__s3_unit || BANZU_UNITS[0]) : unitForDeptName(u.department);
    if (!unit) {
      main.innerHTML = '<div class="card"><div class="muted">你的部门暂无班组值班表，请联系管理员。</div></div>';
      return;
    }

    let s3 = Store.getS3(unit.deptId);
    if (!s3) { const nm = nextMonth(); s3 = { year: nm.year, month: nm.month, cells: {} }; }

    function renderUnit() {
      window.__s3_unit = unit;
      const teams = Store.teamsOf(unit.deptName);
      const candidates = Store.listPersonnel().filter(p => p.department === unit.deptName);
      const days = Utils.daysInMonth(s3.year, s3.month);

      main.innerHTML = '';
      // 部门栏
      const bar = document.createElement('div');
      bar.className = 'dept-bar';
      if (admin) {
        let tabs = '';
        BANZU_UNITS.forEach(x => { tabs += `<button class="dept-tab ${x.deptId === unit.deptId ? 'active' : ''}" data-unit="${x.deptId}">${x.sheetName}</button>`; });
        bar.innerHTML = `<div class="dept-tabs">${tabs}</div>
          <label>年份 <select id="s3-year">${yearOptions(s3.year)}</select></label>
          <label>月份 <select id="s3-month">${monthOptions(s3.month)}</select></label>
          <span class="spacer"></span>
          <button id="s3-export-all" class="btn btn-primary">📤 导出 Excel（多表）</button>`;
      } else {
        bar.innerHTML = `<div class="dept-title">${unit.title}</div>
          <label>年份 <select id="s3-year">${yearOptions(s3.year)}</select></label>
          <label>月份 <select id="s3-month">${monthOptions(s3.month)}</select></label>
          <span class="spacer"></span>
          <button id="s3-export-one" class="btn btn-primary">📤 导出本部门 Excel</button>`;
      }
      main.appendChild(bar);

      // 主体
      const body = document.createElement('div');
      body.className = 's3-body';
      const left = document.createElement('div');
      left.className = 'editor-left';
      const right = document.createElement('div');
      right.className = 'editor-right';
      body.appendChild(left); body.appendChild(right);
      main.appendChild(body);

      // 左面板（按班组分组）
      Schedule.renderPersonPanel(left, candidates, { groupByTeam: true });

      // 网格
      renderGrid(right, unit, teams, days);

      // 事件
      const onYM = () => {
        s3.year = +bar.querySelector('#s3-year').value;
        s3.month = +bar.querySelector('#s3-month').value;
        s3.cells = {};
        Store.setS3(unit.deptId, s3);
        renderUnit();
      };
      bar.querySelector('#s3-year').addEventListener('change', onYM);
      bar.querySelector('#s3-month').addEventListener('change', onYM);

      if (admin) {
        bar.querySelectorAll('.dept-tab').forEach(t => t.addEventListener('click', () => {
          unit = BANZU_UNITS.find(x => x.deptId === t.getAttribute('data-unit'));
          s3 = Store.getS3(unit.deptId) || (() => { const nm = nextMonth(); const s = { year: nm.year, month: nm.month, cells: {} }; Store.setS3(unit.deptId, s); return s; })();
          renderUnit();
        }));
        bar.querySelector('#s3-export-all').addEventListener('click', exportAll);
      } else {
        bar.querySelector('#s3-export-one').addEventListener('click', exportOne);
      }
    }

    function renderGrid(right, unit, teams, days) {
      right.innerHTML = '';
      const box = document.createElement('div');
      box.className = 's3-grid-box';

      // 操作提示
      const tip = document.createElement('div');
      tip.className = 'grid-tip';
      tip.innerHTML = '提示：拖拽左侧人员到单元格；点击单元格后 Ctrl+C 复制 / Ctrl+V 粘贴 / Ctrl+X 剪切；右键清空；拖动已填单元格可复制到其它格。';
      box.appendChild(tip);

      const table = document.createElement('table');
      table.className = 's3-table';
      // 表头
      const thead = document.createElement('thead');
      const hr = document.createElement('tr');
      const hDate = document.createElement('th'); hDate.className = 's3-date-head'; hDate.textContent = '日期';
      hr.appendChild(hDate);
      teams.forEach(t => {
        const th = document.createElement('th');
        th.className = 's3-team-head';
        th.innerHTML = `<div class="s3-team-name">${esc(t.name)}</div><div class="s3-team-phone">${esc(t.phone)}</div>`;
        hr.appendChild(th);
      });
      thead.appendChild(hr);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      for (let d = 1; d <= days; d++) {
        const tr = document.createElement('tr');
        const tdDate = document.createElement('td');
        tdDate.className = 's3-date';
        tdDate.textContent = `${s3.month}月${d}日`;
        if (Utils.isAllDay(s3.year, s3.month, d)) tdDate.classList.add('is-allday');
        tr.appendChild(tdDate);
        teams.forEach(t => {
          const td = document.createElement('td');
          td.className = 's3-cell';
          td.setAttribute('data-date', d);
          td.setAttribute('data-team', t.name);
          const p = (s3.cells[d] && s3.cells[d][t.name]) || null;
          renderCellContent(td, p);
          attachCellHandlers(td, d, t.name);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      box.appendChild(table);
      right.appendChild(box);
    }

    function renderCellContent(td, p) {
      td.innerHTML = '';
      if (p && p.name) {
        const n = document.createElement('div'); n.className = 'cell-name'; n.textContent = p.name;
        const ph = Utils.phoneText(p);
        if (ph) { const el = document.createElement('div'); el.className = 'cell-phone'; el.textContent = ph; td.appendChild(el); }
        td.appendChild(n);
        td.classList.add('filled');
        td.draggable = true;
      } else {
        td.innerHTML = '';
        td.classList.remove('filled');
        td.draggable = false;
      }
    }

    let clipboard = null; // {name, phone}

    function attachCellHandlers(td, date, team) {
      const getP = () => (s3.cells[date] && s3.cells[date][team]) || null;
      const setP = (p) => {
        if (!s3.cells[date]) s3.cells[date] = {};
        s3.cells[date][team] = p;
        Store.setS3(unit.deptId, s3);
        renderCellContent(td, p);
      };
      const clear = () => {
        if (s3.cells[date]) { delete s3.cells[date][team]; }
        Store.setS3(unit.deptId, s3);
        renderCellContent(td, null);
      };

      // 放置（来自左面板或拖动的单元格）
      Schedule.makeDroppable(td, {
        onDrop(p) { setP({ name: p.name, phone: p.phone }); },
        onClear: clear,
      });

      // 拖动已填单元格（复制）
      td.addEventListener('dragstart', (e) => {
        const p = getP();
        if (p) { e.dataTransfer.setData('text/plain', JSON.stringify(p)); e.dataTransfer.effectAllowed = 'copy'; }
      });

      // 点击选中
      td.addEventListener('click', () => {
        document.querySelectorAll('.s3-cell.selected').forEach(x => x.classList.remove('selected'));
        td.classList.add('selected');
      });

      // 键盘复制粘贴
      td.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'c') { const p = getP(); if (p) clipboard = { ...p }; }
        if ((e.ctrlKey || e.metaKey) && e.key === 'x') { const p = getP(); if (p) { clipboard = { ...p }; clear(); } }
        if ((e.ctrlKey || e.metaKey) && e.key === 'v') { if (clipboard) setP({ ...clipboard }); }
      });
      td.tabIndex = 0;
    }

    function exportOne() {
      const teams = Store.teamsOf(unit.deptName);
      const deptList = [{ deptName: unit.sheetName, teams, cells: s3.cells }];
      const wb = ExcelGen.buildBanzuWorkbook(deptList, { year: s3.year, month: s3.month });
      ExcelGen.download(wb, `${unit.sheetName}${s3.year}年${s3.month}月份班组夜间值班表.xlsx`);
    }

    function exportAll() {
      const deptList = BANZU_UNITS.map(x => {
        const s = Store.getS3(x.deptId) || { year: s3.year, month: s3.month, cells: {} };
        return { deptName: x.sheetName, teams: Store.teamsOf(x.deptName), cells: s.cells };
      });
      const wb = ExcelGen.buildBanzuWorkbook(deptList, { year: s3.year, month: s3.month });
      ExcelGen.download(wb, `班组夜间值班表汇总_${s3.year}年${s3.month}月份.xlsx`);
    }

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

    renderUnit();
  }

  function yearOptions(sel) {
    const y = new Date().getFullYear(); let s = '';
    for (let i = y - 1; i <= y + 2; i++) s += `<option value="${i}" ${i === sel ? 'selected' : ''}>${i}</option>`;
    return s;
  }
  function monthOptions(sel) {
    let s = ''; for (let i = 1; i <= 12; i++) s += `<option value="${i}" ${i === sel ? 'selected' : ''}>${i}月</option>`;
    return s;
  }

  return { render };
})();
