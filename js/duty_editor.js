/* ============================================================
 * 值班表编辑器（一级/二级共用）
 * 三栏布局：左人员面板 | 中表格 | 右功能栏（组合/记忆）
 * 支持：拖拽、组合拖入、复制/剪切/粘贴/拖动、全天晚切换、保存/提交
 * ============================================================ */
window.DutyEditor = (function () {

  function render(main, cfg) {
    main.innerHTML = '';
    const data = {
      year: cfg.year, month: cfg.month,
      assignments: cfg.assignments || {},
      tags: cfg.tags || {},
      note: cfg.note || '',
      signers: cfg.signers || {},
    };
    const u = App.currentUser();
    const userId = cfg.userId || (u && u.id);
    const departmentName = cfg.departmentName || '';

    const wrap = document.createElement('div');
    wrap.className = 'editor';

    // 顶部工具栏
    const bar = document.createElement('div');
    bar.className = 'editor-bar';
    bar.innerHTML = `
      <label>年份 <select id="ed-year">${yearOptions(data.year)}</select></label>
      <label>月份 <select id="ed-month">${monthOptions(data.month)}</select></label>
      <span class="spacer"></span>
      <span class="save-state" id="ed-state"></span>
      <button id="ed-save" class="btn">💾 保存</button>
      <button id="ed-submit" class="btn btn-primary">✅ 提交</button>
      <button id="ed-export" class="btn btn-primary">📤 导出 Word</button>
    `;
    wrap.appendChild(bar);

    // 主体三栏
    const body = document.createElement('div');
    body.className = 'editor-body';
    const left = document.createElement('div'); left.className = 'editor-left';
    const center = document.createElement('div'); center.className = 'editor-center';
    const right = document.createElement('div'); right.className = 'editor-right-side';
    body.appendChild(left); body.appendChild(center); body.appendChild(right);
    wrap.appendChild(body);

    main.appendChild(wrap);

    /* ---------- 左：人员面板（组织关系筛选 + 搜索） ---------- */
    const panelCtl = Schedule.renderPersonPanel(left, cfg.candidatePersons || [], {
      groupByTeam: !!cfg.groupByTeam,
    }, (p) => hintPick(p));

    /* ---------- 中：网格 ---------- */
    const gridBox = document.createElement('div');
    gridBox.className = 'duty-grid-box';
    center.appendChild(gridBox);

    const days = Utils.daysInMonth(data.year, data.month);
    const rowCount = Math.ceil(days / 2);
    let clipboard = null;

    function renderGrid() {
      gridBox.innerHTML = '';
      const table = document.createElement('table');
      table.className = 'duty-table';
      table.innerHTML = `
        <thead>
          <tr><th class="dt-company" colspan="4">${CONFIG.COMPANY.fullName}</th></tr>
          <tr><th class="dt-title" colspan="4">${Utils.yearCN(data.year)}年${Utils.monthCN(data.month)}${cfg.titleSuffix || '值班表'}</th></tr>
          <tr><th>日期</th><th>${cfg.personHeader || '值班人'}</th><th>日期</th><th>${cfg.personHeader || '值班人'}</th></tr>
        </thead>
        <tbody></tbody>
      `;
      const tbody = table.querySelector('tbody');
      for (let i = 0; i < rowCount; i++) {
        const leftDay = i + 1;
        const rightDay = leftDay + rowCount;
        const tr = document.createElement('tr');
        tr.appendChild(makeDateCell(leftDay));
        tr.appendChild(makePersonCell(leftDay));
        if (rightDay <= days) {
          tr.appendChild(makeDateCell(rightDay));
          tr.appendChild(makePersonCell(rightDay));
        } else {
          const e1 = document.createElement('td'); e1.className = 'dt-date';
          const e2 = document.createElement('td'); e2.className = 'dt-person';
          tr.appendChild(e1); tr.appendChild(e2);
        }
        tbody.appendChild(tr);
      }
      gridBox.appendChild(table);
    }

    function makeDateCell(day) {
      const td = document.createElement('td');
      td.className = 'dt-date';
      const tag = data.tags[day] || Utils.dayTag(data.year, data.month, day);
      if (tag === '全天') td.classList.add('is-allday');
      const num = document.createElement('span'); num.className = 'dt-num'; num.textContent = Utils.pad2(day);
      const tagEl = document.createElement('span'); tagEl.className = 'dt-tag'; tagEl.textContent = tag;
      tagEl.title = '点击切换 全天/晚';
      td.appendChild(num);
      td.appendChild(tagEl);
      tagEl.addEventListener('click', () => {
        data.tags[day] = (tag === '全天' ? '晚' : '全天');
        cfg.onSave({ tags: { ...data.tags } });
        renderGrid();
      });
      return td;
    }

    function assignPerson(day, p) {
      if (p && p.name) data.assignments[day] = { name: p.name, phone: p.phone, shortPhone: p.shortPhone };
      else delete data.assignments[day];
    }

    function makePersonCell(day) {
      const td = document.createElement('td');
      td.className = 'dt-person';
      td.tabIndex = 0;
      renderPersonContent(td, data.assignments[day]);
      Schedule.makeDroppable(td, {
        onDrop: (payload) => {
          if (payload && payload.bundle) {
            // 组合：从当前日期开始连续填充
            payload.persons.forEach((p, idx) => {
              if (day + idx <= days) assignPerson(day + idx, p);
            });
            recordCo();
          } else if (payload && payload.name) {
            assignPerson(day, payload);
            recordCo();
          }
          cfg.onSave({ assignments: { ...data.assignments } });
          renderGrid();
        },
        onClear: () => { delete data.assignments[day]; cfg.onSave({ assignments: { ...data.assignments } }); renderPersonContent(td, null); },
      });
      // 拖动已填格（移动/复制）
      td.addEventListener('dragstart', (e) => {
        const p = data.assignments[day];
        if (p && p.name) { e.dataTransfer.effectAllowed = 'copyMove'; e.dataTransfer.setData('text/plain', JSON.stringify(p)); }
      });
      // 点击选中
      td.addEventListener('click', () => {
        gridBox.querySelectorAll('.dt-person.selected').forEach(x => x.classList.remove('selected'));
        td.classList.add('selected');
      });
      // 复制/剪切/粘贴
      td.addEventListener('keydown', (e) => {
        const p = data.assignments[day];
        if ((e.ctrlKey || e.metaKey) && e.key === 'c') { if (p && p.name) clipboard = { ...p }; }
        if ((e.ctrlKey || e.metaKey) && e.key === 'x') { if (p && p.name) { clipboard = { ...p }; delete data.assignments[day]; cfg.onSave({ assignments: { ...data.assignments } }); renderPersonContent(td, null); } }
        if ((e.ctrlKey || e.metaKey) && e.key === 'v') { if (clipboard) { assignPerson(day, clipboard); cfg.onSave({ assignments: { ...data.assignments } }); renderPersonContent(td, clipboard); } }
        if (e.key === 'Delete' || e.key === 'Backspace') { if (p && p.name) { delete data.assignments[day]; cfg.onSave({ assignments: { ...data.assignments } }); renderPersonContent(td, null); } }
      });
      return td;
    }

    function renderPersonContent(td, p) {
      td.innerHTML = '';
      if (p && p.name) {
        const n = document.createElement('div'); n.className = 'cell-name'; n.textContent = p.name;
        const ph = Utils.phoneText(p);
        td.appendChild(n);
        if (ph) { const d = document.createElement('div'); d.className = 'cell-phone'; d.textContent = ph; td.appendChild(d); }
        td.classList.add('filled');
        td.draggable = true;
      } else {
        td.innerHTML = '<span class="cell-placeholder">拖入人员</span>';
        td.classList.remove('filled');
        td.draggable = false;
      }
    }

    /* ---------- 点击面板人员填入（待放置模式） ---------- */
    let pendingCell = null;
    function hintPick(p) {
      if (pendingCell) {
        assignPerson(pendingCell._day, p);
        cfg.onSave({ assignments: { ...data.assignments } });
        recordCo();
        renderGrid();
        pendingCell = null;
      }
    }
    gridBox.addEventListener('dblclick', (e) => {
      const td = e.target.closest('.dt-person');
      if (!td) return;
      td.classList.toggle('pending');
      if (td.classList.contains('pending')) { pendingCell = td; pendingCell._day = getDayOfCell(td); }
      else pendingCell = null;
    });
    function getDayOfCell(td) {
      const tr = td.parentElement;
      const cells = tr.querySelectorAll('.dt-person');
      const idx = Array.from(cells).indexOf(td);
      const rowIdx = Array.from(tr.parentElement.children).indexOf(tr);
      return idx === 0 ? rowIdx + 1 : rowIdx + 1 + rowCount;
    }

    // 记录相邻共现记忆（按日期顺序）
    function recordCo() {
      const ordered = [];
      for (let d = 1; d <= days; d++) if (data.assignments[d] && data.assignments[d].name) ordered.push(data.assignments[d]);
      Store.recordCoMemory(ordered);
    }

    /* ---------- 说明/备注 ---------- */
    const noteBox = document.createElement('div');
    noteBox.className = 'note-box';
    noteBox.innerHTML = `<div class="note-label">说明 / 备注（可编辑）</div>`;
    const noteArea = document.createElement('textarea');
    noteArea.className = 'note-area';
    noteArea.value = data.note;
    noteArea.addEventListener('input', () => { data.note = noteArea.value; cfg.onSave({ note: noteArea.value }); });
    noteBox.appendChild(noteArea);
    center.appendChild(noteBox);

    // 签字栏
    const signerBox = document.createElement('div');
    signerBox.className = 'signer-box';
    (cfg.signerFields || []).forEach(f => {
      const lbl = document.createElement('label');
      lbl.textContent = f.label;
      const inp = document.createElement('input');
      inp.className = 'inp signer-inp';
      inp.value = data.signers[f.key] || '';
      inp.placeholder = f.defaultValue || '';
      inp.addEventListener('input', () => { data.signers[f.key] = inp.value; cfg.onSave({ signers: { ...data.signers } }); });
      lbl.appendChild(inp);
      signerBox.appendChild(lbl);
    });
    center.appendChild(signerBox);

    /* ---------- 右：功能栏（组合拖入 + 智能记忆） ---------- */
    Schedule.bundlePanel(right, {
      userId, departmentName,
      onBundleDrop: (persons) => { /* 点击组合：提示拖拽 */ },
      onManage: () => Schedule.bundleEditor(userId, departmentName, () => refreshBundlePanel()),
    });
    function refreshBundlePanel() {
      Schedule.bundlePanel(right, { userId, departmentName, onBundleDrop: () => {}, onManage: () => Schedule.bundleEditor(userId, departmentName, refreshBundlePanel) });
    }

    /* ---------- 保存/提交/导出 ---------- */
    function updateState() {
      const st = document.getElementById('ed-state');
      if (st) {
        const rec = cfg.getSubmit ? cfg.getSubmit() : null;
        st.textContent = rec && rec.submitted ? '✅ 已提交' : '● 未提交';
        st.className = 'save-state ' + (rec && rec.submitted ? 'submitted' : 'draft');
      }
    }
    bar.querySelector('#ed-save').addEventListener('click', () => {
      cfg.onSave({ assignments: { ...data.assignments }, tags: { ...data.tags }, note: data.note, signers: { ...data.signers } });
      recordCo();
      flash('已保存');
    });
    bar.querySelector('#ed-submit').addEventListener('click', () => {
      if (!confirm('确定提交当前排班？提交后视为定稿。')) return;
      cfg.onSave({ assignments: { ...data.assignments }, tags: { ...data.tags }, note: data.note, signers: { ...data.signers } });
      recordCo();
      if (cfg.onSubmit) cfg.onSubmit();
      updateState();
      flash('已提交');
    });
    bar.querySelector('#ed-export').addEventListener('click', () => cfg.onExport());

    function flash(msg) {
      const st = document.getElementById('ed-state');
      if (st) { st.textContent = msg; setTimeout(updateState, 1500); }
    }

    // 年份/月份
    bar.querySelector('#ed-year').addEventListener('change', (e) => { cfg.onYearMonthChange(+e.target.value, data.month); });
    bar.querySelector('#ed-month').addEventListener('change', (e) => { cfg.onYearMonthChange(data.year, +e.target.value); });

    renderGrid();
    updateState();
    return { panelCtl };
  }

  function yearOptions(sel) {
    const y = new Date().getFullYear();
    let s = '';
    for (let i = y - 1; i <= y + 2; i++) s += `<option value="${i}" ${i === sel ? 'selected' : ''}>${i}</option>`;
    return s;
  }
  function monthOptions(sel) {
    let s = '';
    for (let i = 1; i <= 12; i++) s += `<option value="${i}" ${i === sel ? 'selected' : ''}>${i}月</option>`;
    return s;
  }

  return { render };
})();
