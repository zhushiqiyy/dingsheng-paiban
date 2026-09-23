/* ============================================================
 * 值班表编辑器（一级/二级共用）
 * 2 列日期网格 + 左侧人员面板 + 拖拽 + 全天/晚切换 + 签字栏
 * ============================================================ */
window.DutyEditor = (function () {

  /**
   * 渲染值班表编辑器
   * @param {object} cfg {
   *   title,                       // 标题文案
   *   year, month,
   *   assignments, tags, note,     // 数据
   *   candidatePersons,            // 左侧候选人
   *   groupByTeam,                 // 是否按班组分组
   *   signerFields,                // [{key,label,defaultValue}] 签字栏
   *   onSave(patch),               // 数据变更保存回调
   *   onExport(),                  // 导出回调
   * }
   */
  function render(main, cfg) {
    main.innerHTML = '';
    const data = {
      year: cfg.year, month: cfg.month,
      assignments: cfg.assignments || {},
      tags: cfg.tags || {},
      note: cfg.note || '',
      signers: cfg.signers || {},
    };

    const wrap = document.createElement('div');
    wrap.className = 'editor';

    // 顶部工具栏
    const bar = document.createElement('div');
    bar.className = 'editor-bar';
    bar.innerHTML = `
      <label>年份 <select id="ed-year">${yearOptions(data.year)}</select></label>
      <label>月份 <select id="ed-month">${monthOptions(data.month)}</select></label>
      <span class="spacer"></span>
      <button id="ed-export" class="btn btn-primary">📤 导出 Word</button>
    `;
    wrap.appendChild(bar);

    // 主体：左面板 + 右网格
    const body = document.createElement('div');
    body.className = 'editor-body';
    const left = document.createElement('div');
    left.className = 'editor-left';
    const right = document.createElement('div');
    right.className = 'editor-right';
    body.appendChild(left);
    body.appendChild(right);
    wrap.appendChild(body);

    main.appendChild(wrap);

    // 候选人面板
    const panelCtl = Schedule.renderPersonPanel(left, cfg.candidatePersons || [], { groupByTeam: !!cfg.groupByTeam }, (p) => {
      // 点击面板人员 -> 若存在“待放置”高亮格则填入，否则提示
      hintPick(p);
    });

    // 网格
    const gridBox = document.createElement('div');
    gridBox.className = 'duty-grid-box';
    right.appendChild(gridBox);

    function renderGrid() {
      gridBox.innerHTML = '';
      const days = Utils.daysInMonth(data.year, data.month);
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
      const rowCount = Math.ceil(days / 2);
      for (let i = 0; i < rowCount; i++) {
        const leftDay = i + 1;
        const rightDay = leftDay + rowCount;
        const tr = document.createElement('tr');

        // 左日期
        tr.appendChild(makeDateCell(leftDay));
        tr.appendChild(makePersonCell(leftDay));
        // 右日期
        if (rightDay <= days) {
          tr.appendChild(makeDateCell(rightDay));
          tr.appendChild(makePersonCell(rightDay));
        } else {
          const e1 = document.createElement('td'); e1.className = 'dt-date'; e1.textContent = '';
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
        const newTag = tag === '全天' ? '晚' : '全天';
        data.tags[day] = newTag;
        cfg.onSave({ tags: { ...data.tags } });
        renderGrid();
      });
      return td;
    }

    function makePersonCell(day) {
      const td = document.createElement('td');
      td.className = 'dt-person';
      const p = data.assignments[day];
      renderPersonContent(td, p, day);
      Schedule.makeDroppable(td, {
        onDrop: (person, el) => {
          data.assignments[day] = { name: person.name, phone: person.phone };
          cfg.onSave({ assignments: { ...data.assignments } });
          renderPersonContent(el, { name: person.name, phone: person.phone }, day);
        },
        onClear: () => {
          delete data.assignments[day];
          cfg.onSave({ assignments: { ...data.assignments } });
          renderPersonContent(td, null, day);
        },
      });
      return td;
    }

    function renderPersonContent(td, p, day) {
      td.innerHTML = '';
      if (p && p.name) {
        const n = document.createElement('div'); n.className = 'cell-name'; n.textContent = p.name;
        const ph = document.createElement('div'); ph.className = 'cell-phone'; ph.textContent = Utils.phoneText(p);
        td.appendChild(n);
        if (ph.textContent) td.appendChild(ph);
      } else {
        td.innerHTML = '<span class="cell-placeholder">拖入人员</span>';
      }
    }

    let pendingCell = null;
    function hintPick(p) {
      if (pendingCell) {
        const day = pendingCell._day;
        data.assignments[day] = { name: p.name, phone: p.phone };
        cfg.onSave({ assignments: { ...data.assignments } });
        renderGrid();
        pendingCell = null;
      }
    }
    // 高亮待放置：双击人员格进入“待放置”状态（供点击面板人员填入）
    gridBox.addEventListener('dblclick', (e) => {
      const td = e.target.closest('.dt-person');
      if (!td) return;
      td.classList.toggle('pending');
      if (td.classList.contains('pending')) { pendingCell = td; pendingCell._day = getDayOfCell(td); }
      else pendingCell = null;
    });
    function getDayOfCell(td) {
      // 从表格定位：同一行左列 day = row*1 + 1（需重新计算）
      const tr = td.parentElement;
      const cells = tr.querySelectorAll('.dt-person');
      const idx = Array.from(cells).indexOf(td);
      const rowIdx = Array.from(tr.parentElement.children).indexOf(tr);
      const rowCount = Math.ceil(Utils.daysInMonth(data.year, data.month) / 2);
      return idx === 0 ? rowIdx + 1 : rowIdx + 1 + rowCount;
    }

    // 说明/备注
    const noteBox = document.createElement('div');
    noteBox.className = 'note-box';
    noteBox.innerHTML = `<div class="note-label">说明 / 备注（可编辑）</div>`;
    const noteArea = document.createElement('textarea');
    noteArea.className = 'note-area';
    noteArea.value = data.note;
    noteArea.addEventListener('input', () => { data.note = noteArea.value; cfg.onSave({ note: noteArea.value }); });
    noteBox.appendChild(noteArea);
    right.appendChild(noteBox);

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
      inp.addEventListener('input', () => {
        data.signers[f.key] = inp.value;
        cfg.onSave({ signers: { ...data.signers } });
      });
      lbl.appendChild(inp);
      signerBox.appendChild(lbl);
    });
    right.appendChild(signerBox);

    // 事件：年份/月份切换
    wrap.querySelector('#ed-year').addEventListener('change', (e) => { cfg.onYearMonthChange(+e.target.value, data.month); });
    wrap.querySelector('#ed-month').addEventListener('change', (e) => { cfg.onYearMonthChange(data.year, +e.target.value); });
    wrap.querySelector('#ed-export').addEventListener('click', () => cfg.onExport());

    renderGrid();
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
