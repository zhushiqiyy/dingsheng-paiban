/* ============================================================
 * 视图：班组值班（Excel 多表）
 * 一个格子可填 1-3 人，支持组合拖入/依次拖入/复制粘贴/保存提交/智能记忆
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

  const MAX_CELL = 3;

  function nextMonth() {
    const now = new Date();
    let y = now.getFullYear(), m = now.getMonth() + 1;
    m += 1; if (m > 12) { m = 1; y += 1; }
    return { year: y, month: m };
  }

  function unitForDeptName(deptName) {
    return BANZU_UNITS.find(u => u.deptName === deptName) || null;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // 归一化格子数据为数组（兼容旧的单对象）
  function normCell(cell) {
    if (!cell) return [];
    if (Array.isArray(cell)) return cell.filter(p => p && p.name);
    return [cell];
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
          <span class="save-state" id="s3-state"></span>
          <button id="s3-save" class="btn">💾 保存</button>
          <button id="s3-submit" class="btn btn-primary">✅ 提交</button>
          <button id="s3-export-all" class="btn btn-primary">📤 导出 Excel（多表）</button>`;
      } else {
        bar.innerHTML = `<div class="dept-title">${unit.title}</div>
          <label>年份 <select id="s3-year">${yearOptions(s3.year)}</select></label>
          <label>月份 <select id="s3-month">${monthOptions(s3.month)}</select></label>
          <span class="spacer"></span>
          <span class="save-state" id="s3-state"></span>
          <button id="s3-save" class="btn">💾 保存</button>
          <button id="s3-submit" class="btn btn-primary">✅ 提交</button>
          <button id="s3-export-one" class="btn btn-primary">📤 导出本部门 Excel</button>`;
      }
      main.appendChild(bar);

      // 主体三栏
      const body = document.createElement('div');
      body.className = 's3-body';
      const left = document.createElement('div'); left.className = 'editor-left';
      const center = document.createElement('div'); center.className = 'editor-center';
      const right = document.createElement('div'); right.className = 'editor-right-side';
      body.appendChild(left); body.appendChild(center); body.appendChild(right);
      main.appendChild(body);

      // 左：人员面板（组织关系筛选）
      Schedule.renderPersonPanel(left, candidates, { groupByTeam: true });

      // 中：网格
      renderGrid(center, unit, teams, days);

      // 右：功能栏（组合拖入 + 智能记忆）
      Schedule.bundlePanel(right, { userId: u.id, departmentName: unit.deptName, onBundleDrop: () => {}, onManage: () => Schedule.bundleEditor(u.id, unit.deptName, refreshBundle) });
      function refreshBundle() {
        Schedule.bundlePanel(right, { userId: u.id, departmentName: unit.deptName, onBundleDrop: () => {}, onManage: () => Schedule.bundleEditor(u.id, unit.deptName, refreshBundle) });
      }

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

      // 保存/提交
      bar.querySelector('#s3-save').addEventListener('click', () => { Store.setS3(unit.deptId, s3); recordCo(); flash('已保存'); });
      bar.querySelector('#s3-submit').addEventListener('click', () => {
        if (!confirm('确定提交当前班组值班？提交后视为定稿。')) return;
        Store.setS3(unit.deptId, s3); recordCo();
        Store.setSubmit('s3', unit.deptId, true);
        updateState();
        flash('已提交');
      });
      function updateState() {
        const st = document.getElementById('s3-state');
        const rec = Store.getSubmit('s3', unit.deptId);
        if (st) { st.textContent = rec && rec.submitted ? '✅ 已提交' : '● 未提交'; st.className = 'save-state ' + (rec && rec.submitted ? 'submitted' : 'draft'); }
      }
      function flash(msg) {
        const st = document.getElementById('s3-state');
        if (st) { st.textContent = msg; setTimeout(updateState, 1500); }
      }
      updateState();
    }

    function recordCo() {
      const ordered = [];
      for (let d = 1; d <= Utils.daysInMonth(s3.year, s3.month); d++) {
        const row = s3.cells[d] || {};
        Object.values(row).forEach(cell => normCell(cell).forEach(p => ordered.push(p)));
      }
      Store.recordCoMemory(ordered);
    }

    function renderGrid(center, unit, teams, days) {
      center.innerHTML = '';
      const box = document.createElement('div');
      box.className = 's3-grid-box';

      const tip = document.createElement('div');
      tip.className = 'grid-tip';
      tip.innerHTML = '提示：拖入人员/组合到单元格（一格可 1-3 人，右键清空单人）；点击格子后 Ctrl+C 复制 / Ctrl+V 粘贴 / Ctrl+X 剪切 / Delete 删除；拖动已填格可移动复制。';
      box.appendChild(tip);

      const table = document.createElement('table');
      table.className = 's3-table';
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
          renderCellContent(td, normCell(s3.cells[d] && s3.cells[d][t.name]));
          attachCellHandlers(td, d, t.name);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      box.appendChild(table);
      center.appendChild(box);
    }

    function renderCellContent(td, list) {
      td.innerHTML = '';
      if (list.length > 0) {
        list.forEach(p => {
          const wrap = document.createElement('div');
          wrap.className = 'cell-person';
          const n = document.createElement('span'); n.className = 'cell-name'; n.textContent = p.name;
          const ph = Utils.phoneText(p);
          wrap.appendChild(n);
          if (ph) { const s = document.createElement('span'); s.className = 'cell-phone'; s.textContent = ph; wrap.appendChild(s); }
          td.appendChild(wrap);
        });
        td.classList.add('filled');
        td.draggable = true;
      } else {
        td.classList.remove('filled');
        td.draggable = false;
      }
    }

    let clipboard = null; // 数组

    function attachCellHandlers(td, date, team) {
      const getList = () => normCell(s3.cells[date] && s3.cells[date][team]);
      const setList = (list) => {
        if (!s3.cells[date]) s3.cells[date] = {};
        s3.cells[date][team] = list.slice(0, MAX_CELL);
        Store.setS3(unit.deptId, s3);
        renderCellContent(td, normCell(s3.cells[date][team]));
      };
      const addPerson = (p) => {
        const list = getList();
        if (list.length >= MAX_CELL) { alert(`一个格子最多 ${MAX_CELL} 人`); return; }
        list.push(p); setList(list);
      };

      Schedule.makeDroppable(td, {
        onDrop(payload) {
          if (payload && payload.bundle) {
            const list = getList();
            payload.persons.forEach(p => { if (list.length < MAX_CELL) list.push(p); });
            setList(list);
          } else if (payload && payload.name) {
            addPerson(payload);
          }
        },
        onClear() {
          const list = getList();
          list.pop();
          setList(list);
        },
      });

      td.addEventListener('dragstart', (e) => {
        const list = getList();
        if (list.length) { e.dataTransfer.effectAllowed = 'copyMove'; e.dataTransfer.setData('text/plain', JSON.stringify(list)); }
      });
      td.addEventListener('click', () => {
        document.querySelectorAll('.s3-cell.selected').forEach(x => x.classList.remove('selected'));
        td.classList.add('selected');
      });
      td.addEventListener('keydown', (e) => {
        const list = getList();
        if ((e.ctrlKey || e.metaKey) && e.key === 'c') { if (list.length) clipboard = list.map(p => ({ ...p })); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'x') { if (list.length) { clipboard = list.map(p => ({ ...p })); setList([]); } }
        if ((e.ctrlKey || e.metaKey) && e.key === 'v') { if (clipboard && clipboard.length) setList(getList().concat(clipboard)); }
        if (e.key === 'Delete' || e.key === 'Backspace') { if (list.length) { list.pop(); setList(list); } }
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
