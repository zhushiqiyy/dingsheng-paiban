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
    { deptId: 'famen', deptName: '阀门维修部', sheetName: '阀门维修部（全厂性）', title: '阀门维修部班组值班表' },
    { deptId: 'qingxi', deptName: '清洗部', sheetName: '清洗部（全厂性）', title: '清洗部班组值班表' },
  ];

  // 需要同步到各事业部最后一列的「全厂性」单元
  const SYNC_UNIT_IDS = ['zonghe', 'famen', 'qingxi'];
  // 同步列在表头显示的区域名
  const SYNC_ZONE = { zonghe: '综合维修', famen: '阀门', qingxi: '清洗' };

  const MAX_CELL = 3;

  // 色块调色板（浅色背景）
  const PALETTE = ['FFF2CC', 'FFD966', 'FFC7CE', 'D6E4F0', 'E2EFDA', 'FCE4D6', 'D9E1F2', 'F8CBAD'];

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

  /* ---------- 导入解析：从单元格文本提取人员（姓名+电话） ---------- */
  // 模板单元格格式：如 "牛  涛13758031896/632896" 或多人 "曹文浩.../532256\n孟  伟.../637620"
  function parseCellPersons(cellText) {
    const segs = String(cellText == null ? '' : cellText).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const result = [];
    segs.forEach(seg => {
      const nums = seg.match(/\d+/g) || [];
      const name = seg.replace(/[\d/\s·、,，.]+/g, '').trim();
      let phone = '', shortPhone = '';
      for (const n of nums) {
        if (!phone && /^1\d{10}$/.test(n)) phone = n;
        else if (!shortPhone && n.length >= 5) shortPhone = n;
      }
      if (name || phone || shortPhone) result.push({ name, phone, shortPhone });
    });
    return result;
  }

  // 与后台正确人员库比对，返回 {person, method}；method ∈ 长号/短号/姓名/拼音/未匹配
  function resolvePerson(raw, personnel) {
    const clean = s => String(s || '').replace(/\s+/g, '');
    const n = clean(raw.name);
    if (raw.phone) { const h = personnel.find(p => p.phone === raw.phone); if (h) return { person: h, method: '长号' }; }
    if (raw.shortPhone) { const h = personnel.find(p => p.shortPhone === raw.shortPhone); if (h) return { person: h, method: '短号' }; }
    if (n) { const h = personnel.find(p => clean(p.name) === n); if (h) return { person: h, method: '姓名' }; }
    if (n && window.pinyinPro) {
      try {
        const py = window.pinyinPro.pinyin(n, { toneType: 'none', type: 'array' }).join('').toLowerCase();
        const hits = personnel.filter(p => {
          const ppy = window.pinyinPro.pinyin(clean(p.name), { toneType: 'none', type: 'array' }).join('').toLowerCase();
          return ppy === py;
        });
        if (hits.length === 1) return { person: hits[0], method: '拼音' };
      } catch (e) { /* ignore */ }
    }
    return { person: null, method: '未匹配' };
  }

  // 人员唯一键（姓名+长号+短号；姓名相同手机号不同算不同）
  function personKey(p) { return p ? (p.name || '') + '|' + (p.phone || '') + '|' + (p.shortPhone || '') : ''; }

  function render(main) {
    const u = App.currentUser();
    const admin = u.role === 'admin';
    let unit = admin ? (window.__s3_unit || BANZU_UNITS[0]) : unitForDeptName(u.department);
    if (!unit) {
      main.innerHTML = '<div class="card"><div class="muted">你的部门暂无班组值班表，请联系管理员。</div></div>';
      return;
    }

    let s3 = Store.getS3(unit.deptId);
    if (!s3) { const nm = nextMonth(); s3 = { year: nm.year, month: nm.month, cells: {}, colors: {}, colorPersons: {} }; }
    if (!s3.colors) s3.colors = {};
    if (!s3.colorPersons) s3.colorPersons = {};  // { ci: [{name,phone,shortPhone,id}] } 每个色块统一填入的人员
    // 色块填充状态（renderUnit 与 renderGrid 共用）
    let fillMode = false;
    let selected = new Set(); // 选中的格子 key `${date}|${team}`
    let boxSelecting = false; // 是否正在框选
    let boxStart = null;      // 框选起始格 { date, teamIdx }
    let hiddenTeams = new Set(); // 隐藏的班组列（列显隐控制）

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

      // 色块填充模式
      const fillBtn = document.createElement('button');
      fillBtn.className = 'btn';
      fillBtn.textContent = '🎨 色块填充';
      fillBtn.addEventListener('click', () => {
        fillMode = !fillMode;
        fillBtn.classList.toggle('active', fillMode);
        selected.clear();
        if (!fillMode) { paletteRow.style.display = 'none'; }
        else { paletteRow.style.display = 'flex'; }
        renderGrid(center, unit, teams, days);
      });
      bar.appendChild(fillBtn);

      // 导入排班（按模板 Excel）
      const importBtn = document.createElement('button');
      importBtn.className = 'btn';
      importBtn.textContent = '📥 导入 Excel';
      const importInput = document.createElement('input');
      importInput.type = 'file';
      importInput.accept = '.xlsx,.xls';
      importInput.style.display = 'none';
      importBtn.addEventListener('click', () => importInput.click());
      importInput.addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        await importS3File(f);
        e.target.value = '';
      });
      bar.appendChild(importBtn);
      bar.appendChild(importInput);

      // 调色板（色块填充时显示）
      const paletteRow = document.createElement('div');
      paletteRow.className = 'palette-row';
      paletteRow.style.display = 'none';
      PALETTE.forEach((color, ci) => {
        const sw = document.createElement('span');
        sw.className = 'palette-swatch';
        sw.style.background = '#' + color;
        sw.title = '色块 ' + (ci + 1);
        sw.addEventListener('click', () => {
          if (selected.size === 0) { alert('请先在表格中点击选中要填色的格子'); return; }
          selected.forEach(key => { const [d, t] = key.split('|'); if (!s3.colors[d]) s3.colors[d] = {}; s3.colors[d][t] = ci; });
          Store.setS3(unit.deptId, s3);
          selected.clear();
          renderGrid(center, unit, teams, days);
          renderColorBlocks();
        });
        paletteRow.appendChild(sw);
      });
      const clearColorBtn = document.createElement('button');
      clearColorBtn.className = 'btn btn-sm';
      clearColorBtn.textContent = '清除色块';
      clearColorBtn.addEventListener('click', () => {
        if (selected.size === 0) { alert('请先选中要清除色块的格子'); return; }
        selected.forEach(key => { const [d, t] = key.split('|'); if (s3.colors[d]) delete s3.colors[d][t]; });
        Store.setS3(unit.deptId, s3);
        selected.clear();
        renderGrid(center, unit, teams, days);
        renderColorBlocks();
      });
      paletteRow.appendChild(clearColorBtn);
      main.appendChild(paletteRow);

      // 主体三栏：左人员/色块 | 中网格 | 右智能组合
      const body = document.createElement('div');
      body.className = 's3-body';
      const left = document.createElement('div'); left.className = 'editor-left';
      const center = document.createElement('div'); center.className = 'editor-center';
      const right = document.createElement('div'); right.className = 'editor-right-side';
      body.appendChild(left); body.appendChild(center); body.appendChild(right);
      main.appendChild(body);

      // 左：人员面板 + 色块 + 组合构建区（各用独立容器，避免互相清空）
      const leftPersons = document.createElement('div');
      const leftColor = document.createElement('div');
      const leftBundle = document.createElement('div');
      left.appendChild(leftPersons);
      left.appendChild(leftColor);
      left.appendChild(leftBundle);

      Schedule.renderPersonPanel(leftPersons, candidates, { groupByTeam: true });
      const colorBox = document.createElement('div');
      leftColor.appendChild(colorBox);

      // 把人员统一填入所有同色格子
      function applyColorPersons(ci, persons) {
        Object.keys(s3.colors || {}).forEach(d => {
          Object.keys(s3.colors[d]).forEach(t => {
            if (s3.colors[d][t] === ci) {
              let existing = normCell(s3.cells[d] && s3.cells[d][t]);
              persons.forEach(p => {
                if (existing.length < MAX_CELL && !existing.some(x => personKey(x) === personKey(p))) { existing.push(p); Store.recordUseCount(p.id); }
              });
              if (!s3.cells[d]) s3.cells[d] = {};
              s3.cells[d][t] = existing.slice(0, MAX_CELL);
            }
          });
        });
      }
      // 从所有同色格子删除某人员
      function removeColorPerson(ci, key) {
        Object.keys(s3.colors || {}).forEach(d => {
          Object.keys(s3.colors[d]).forEach(t => {
            if (s3.colors[d][t] === ci) {
              let existing = normCell(s3.cells[d] && s3.cells[d][t]).filter(p => personKey(p) !== key);
              if (!s3.cells[d]) s3.cells[d] = {};
              s3.cells[d][t] = existing.slice(0, MAX_CELL);
            }
          });
        });
      }

      function renderColorBlocks() {
        colorBox.innerHTML = '';
        const usedColors = new Set();
        Object.values(s3.colors || {}).forEach(row => Object.values(row).forEach(ci => usedColors.add(ci)));
        if (usedColors.size === 0) return;
        const head = document.createElement('div');
        head.className = 'bundle-sub';
        head.textContent = '🎨 色块统一填写（拖入→同步；预览可删）';
        colorBox.appendChild(head);
        Array.from(usedColors).sort().forEach(ci => {
          const block = document.createElement('div');
          block.className = 'color-block';
          block.style.background = '#' + PALETTE[ci];

          const title = document.createElement('div');
          title.className = 'color-block-title';
          title.textContent = `色块 ${ci + 1}`;
          block.appendChild(title);

          const listBox = document.createElement('div');
          listBox.className = 'color-block-list';
          const persons = s3.colorPersons[ci] || [];
          persons.forEach(p => {
            const chip = document.createElement('span');
            chip.className = 'color-block-chip';
            chip.innerHTML = `${esc(p.name)}<b data-ci="${ci}" data-key="${esc(personKey(p))}">×</b>`;
            listBox.appendChild(chip);
          });
          if (persons.length === 0) {
            const hint = document.createElement('div');
            hint.className = 'color-block-hint';
            hint.textContent = '拖入人员 → 同色格同步填入';
            listBox.appendChild(hint);
          }
          block.appendChild(listBox);

          // 拖入人员 → 统一填入所有同色格 + 更新预览
          Schedule.makeDroppable(block, {
            onDrop(payload) {
              const newPersons = payload && payload.bundle ? payload.persons : (payload && payload.name ? [payload] : []);
              if (!newPersons.length) return;
              let cur = s3.colorPersons[ci] || [];
              newPersons.forEach(p => {
                if (cur.length < MAX_CELL && !cur.some(x => personKey(x) === personKey(p))) cur.push(p);
              });
              s3.colorPersons[ci] = cur.slice(0, MAX_CELL);
              applyColorPersons(ci, s3.colorPersons[ci]);
              Store.setS3(unit.deptId, s3);
              renderGrid(center, unit, teams, days);
              renderColorBlocks();
            },
          });

          // 预览中删除某人 → 同步删除所有同色格
          listBox.addEventListener('click', (e) => {
            const b = e.target.closest('b[data-key]');
            if (!b) return;
            const key = b.getAttribute('data-key');
            const ci2 = +b.getAttribute('data-ci');
            s3.colorPersons[ci2] = (s3.colorPersons[ci2] || []).filter(p => personKey(p) !== key);
            removeColorPerson(ci2, key);
            Store.setS3(unit.deptId, s3);
            renderGrid(center, unit, teams, days);
            renderColorBlocks();
          });

          colorBox.appendChild(block);
        });
      }
      renderColorBlocks();
      Schedule.bundleBuilder(leftBundle, { userId: u.id, departmentName: unit.deptName, onBundleDrop: () => {}, onChanged: () => {} });

      // 右侧智能组合：同一格子（同天同班组多人）组合推荐，按频次取前 9
      function renderSmartBundles(container, unit) {
        container.innerHTML = '';
        const panel = document.createElement('div');
        panel.className = 'bundle-panel';
        const title = document.createElement('div');
        title.className = 'bundle-title';
        title.textContent = '🤝 智能组合（同一格子）';
        panel.appendChild(title);
        const sub = document.createElement('div');
        sub.className = 'bundle-sub';
        sub.textContent = '📌 高频同格搭配（拖入格子）';
        panel.appendChild(sub);
        const suggestions = Store.suggestCellBundles(unit.deptName, 9);
        if (suggestions.length === 0) {
          const hint = document.createElement('div');
          hint.className = 'bundle-hint';
          hint.textContent = '暂无推荐。完成排班保存后，系统会学习同一格子的多人组合，自动给出建议。';
          panel.appendChild(hint);
        }
        const allPeople = Store.listPersonnel();
        suggestions.forEach(s => {
          const persons = s.personIds.map(id => allPeople.find(p => p.id === id)).filter(Boolean);
          panel.appendChild(Schedule.makeBundleItem(persons, s.name, `同格搭配 ×${s.count}`, (ps) => {}));
        });
        container.appendChild(panel);
      }

      // 右：智能组合（同一格子多人组合推荐，按频次取前 9）
      renderSmartBundles(right, unit);

      // 右：班组列显隐（竖列排列，点击激活/隐藏对应列）
      function renderColumnToggle(container) {
        const panel = document.createElement('div');
        panel.className = 'bundle-panel';
        const title = document.createElement('div');
        title.className = 'bundle-title';
        title.textContent = '👁 班组列显示/隐藏';
        panel.appendChild(title);

        // 全选 / 全不选
        const actionRow = document.createElement('div');
        actionRow.className = 'col-toggle-actions';
        const allBtn = document.createElement('button');
        allBtn.className = 'btn btn-sm';
        allBtn.textContent = '✓ 全选';
        allBtn.title = '显示全部班组列';
        allBtn.addEventListener('click', () => {
          hiddenTeams.clear();
          renderColumnToggle(container);
          renderGrid(center, unit, teams, days);
        });
        const noneBtn = document.createElement('button');
        noneBtn.className = 'btn btn-sm';
        noneBtn.textContent = '✕ 全不选';
        noneBtn.title = '隐藏全部班组列（仅保留日期列）';
        noneBtn.addEventListener('click', () => {
          teams.forEach(t => hiddenTeams.add(t.name));
          renderColumnToggle(container);
          renderGrid(center, unit, teams, days);
        });
        actionRow.appendChild(allBtn);
        actionRow.appendChild(noneBtn);
        panel.appendChild(actionRow);

        const sub = document.createElement('div');
        sub.className = 'bundle-sub';
        sub.textContent = '点击班组名切换显示/隐藏该列';
        panel.appendChild(sub);
        const list = document.createElement('div');
        list.className = 'col-toggle-list';
        teams.forEach(t => {
          const on = !hiddenTeams.has(t.name);
          const item = document.createElement('div');
          item.className = 'col-toggle-item' + (on ? ' on' : '');
          item.textContent = t.name;
          item.title = on ? '点击隐藏该列' : '点击显示该列';
          item.addEventListener('click', () => {
            if (on) hiddenTeams.add(t.name); else hiddenTeams.delete(t.name);
            renderColumnToggle(container);
            renderGrid(center, unit, teams, days);
          });
          list.appendChild(item);
        });
        panel.appendChild(list);
        container.innerHTML = '';
        container.appendChild(panel);
      }
      const colToggleBox = document.createElement('div');
      right.appendChild(colToggleBox);
      renderColumnToggle(colToggleBox);

      // 中：网格
      renderGrid(center, unit, teams, days);

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

      /* ---------- 导入排班（按模板 Excel 解析 + 比对纠正） ---------- */
      async function importS3File(file) {
        const allPersonnel = Store.listPersonnel();
        try {
          const buf = await Utils.readFileAsArrayBuffer(file);
          const wb = XLSX.read(buf, { type: 'array' });
          // 匹配当前部门对应的 sheet（找不到则用第一个）
          let ws = wb.Sheets[unit.sheetName];
          if (!ws) ws = wb.Sheets[wb.SheetNames[0]];
          if (!ws) { alert('未能读取工作表，请确认文件是班组值班表模板。'); return; }
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });

          // 定位表头行（班组名行，通常第 4 行 index=3）：找到含最多班组名的行
          let headerRowIdx = -1, bestMatch = 0;
          for (let r = 0; r < Math.min(rows.length, 8); r++) {
            const row = rows[r] || [];
            let match = 0;
            teams.forEach(t => { row.forEach(c => { if (String(c || '').indexOf(t.name) >= 0) match++; }); });
            if (match > bestMatch) { bestMatch = match; headerRowIdx = r; }
          }
          if (headerRowIdx < 0) { alert('未能识别班组表头，请确认文件是班组值班表模板。'); return; }
          const headerRow = rows[headerRowIdx] || [];

          // 建立列映射：列索引 -> 班组名（第 0 列是日期，跳过）
          const colTeam = {}; // colIdx -> teamName
          for (let c = 1; c < headerRow.length; c++) {
            const cellText = String(headerRow[c] || '');
            for (const t of teams) {
              if (cellText.indexOf(t.name) >= 0) { colTeam[c] = t.name; break; }
            }
          }
          if (Object.keys(colTeam).length === 0) { alert('未能匹配到班组列，请确认班组名称与系统一致。'); return; }

          // 日期序列号 → 日（兼容 Excel 序列号与 "X月X日" 文本）
          function dayOf(v) {
            if (v == null || v === '') return null;
            if (typeof v === 'number') {
              const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
              const dd = d.getUTCDate();
              return dd >= 1 && dd <= 31 ? dd : null;
            }
            const m = String(v).match(/(\d{1,2})月(\d{1,2})日/);
            if (m) return +m[2];
            const m2 = String(v).match(/^(\d{1,2})[\/\-](\d{1,2})/);
            if (m2) return +m2[2];
            return null;
          }

          // 解析数据行：{ day, team, persons:[{name,phone,shortPhone}] }
          const parsed = [];
          for (let r = headerRowIdx + 1; r < rows.length; r++) {
            const row = rows[r] || [];
            const day = dayOf(row[0]);
            if (!day) continue;
            for (const c in colTeam) {
              const team = colTeam[c];
              const cellText = row[+c];
              if (cellText == null || cellText === '') continue;
              const persons = parseCellPersons(cellText);
              if (persons.length) parsed.push({ day, team, persons });
            }
          }

          if (parsed.length === 0) { alert('未能解析到任何值班人员，请确认模板已填写内容。'); return; }

          // 比对纠正（与后台正确人员库）
          let totalPeople = 0, matched = 0, unmatched = 0, corrected = 0;
          const records = []; // {day, team, persons:[{person, method, rawText}]}
          parsed.forEach(p => {
            p.persons.forEach(raw => {
              totalPeople++;
              const r = resolvePerson(raw, allPersonnel);
              const rec = { day: p.day, team: p.team, person: r.person, method: r.method, rawText: (raw.name || '') + (raw.phone ? ' ' + raw.phone : '') + (raw.shortPhone ? '/' + raw.shortPhone : '') };
              if (r.person) { matched++; if (r.method !== '姓名' || r.method !== '长号') corrected++; }
              else unmatched++;
              records.push(rec);
            });
          });

          // 统计覆盖情况
          let fillCount = 0, overwriteCount = 0;
          const grouped = {}; // `${day}|${team}` -> persons[]
          records.forEach(rec => {
            const key = rec.day + '|' + rec.team;
            (grouped[key] = grouped[key] || []).push(rec);
          });
          Object.keys(grouped).forEach(key => {
            const [d, t] = key.split('|');
            const existing = normCell(s3.cells[d] && s3.cells[d][t]);
            if (existing.length > 0) overwriteCount++; else fillCount++;
          });

          // 预览弹窗
          const overlay = document.createElement('div');
          overlay.className = 'modal-overlay';
          overlay.innerHTML = `<div class="modal" style="width:720px;max-width:94vw">
            <div class="modal-title">导入预览 · ${unit.title}</div>
            <div class="import-summary">
              <div>解析到 <b>${totalPeople}</b> 人 · 匹配成功 <b style="color:#16a34a">${matched}</b> 人 · 需纠正 <b style="color:#d97706">${corrected}</b> 人 · 未匹配 <b style="color:#dc2626">${unmatched}</b> 人</div>
              <div>将填入 <b>${fillCount}</b> 个空白格 · 覆盖 <b style="color:#d97706">${overwriteCount}</b> 个已有格</div>
            </div>
            <div class="import-note">说明：系统会按「姓名 / 手机号」与后台正确人员库比对，名字或电话写错会自动纠正为正确信息。未匹配的人员将被跳过（可先完善人员库后重新导入）。</div>
            <div class="table-wrap" style="max-height:340px;overflow:auto;margin-top:8px">
              <table class="grid-table"><thead><tr><th>日期</th><th>班组</th><th>原文</th><th>纠正结果</th><th>状态</th></tr></thead>
              <tbody>${records.slice(0, 300).map(rec => {
                const ok = rec.person;
                const status = ok ? (rec.method === '姓名' || rec.method === '长号' ? '✅ 匹配' : '🔧 已纠正') : '❌ 未匹配';
                const result = ok ? `${esc(rec.person.name)} ${esc(Utils.phoneText(rec.person))}` : '（跳过）';
                return `<tr><td>${s3.month}月${rec.day}日</td><td>${esc(rec.team)}</td><td>${esc(rec.rawText)}</td><td>${result}</td><td>${status}</td></tr>`;
              }).join('')}</tbody></table>
            </div>
            ${records.length > 300 ? '<div class="muted">（仅预览前 300 条）</div>' : ''}
            <div class="modal-actions">
              <button id="imp-cancel" class="btn">取消</button>
              <button id="imp-save" class="btn btn-primary">确认导入</button>
            </div>
          </div>`;
          document.body.appendChild(overlay);
          overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

          overlay.querySelector('#imp-cancel').addEventListener('click', () => overlay.remove());
          overlay.querySelector('#imp-save').addEventListener('click', () => {
            // 二次确认覆盖
            if (overwriteCount > 0) {
              if (!confirm(`检测到 ${overwriteCount} 个格子已有排班数据。\n确定覆盖这些格子？（取消则仅填充空白格）`)) {
                applyImport(false);
              } else {
                applyImport(true);
              }
            } else {
              applyImport(true);
            }
            overlay.remove();
          });

          function applyImport(overwrite) {
            const merged = {}; // key -> persons[]
            records.forEach(rec => {
              if (!rec.person) return; // 未匹配跳过
              const key = rec.day + '|' + rec.team;
              (merged[key] = merged[key] || []).push(rec.person);
            });
            Object.keys(merged).forEach(key => {
              const [d, t] = key.split('|');
              const existing = normCell(s3.cells[d] && s3.cells[d][t]);
              let list = existing;
              if (existing.length === 0 || overwrite) list = []; // 空白直接填；有数据且确认覆盖则替换
              merged[key].forEach(p => {
                if (list.length < MAX_CELL && !list.some(x => personKey(x) === personKey(p))) {
                  list.push(p);
                  Store.recordUseCount(p.id);
                }
              });
              if (!s3.cells[d]) s3.cells[d] = {};
              s3.cells[d][t] = list.slice(0, MAX_CELL);
            });
            Store.setS3(unit.deptId, s3);
            renderGrid(center, unit, teams, days);
            flash('已导入');
          }
        } catch (e) {
          alert('导入失败：' + e.message);
        }
      }
    }

    function recordCo() {
      const ordered = [];
      for (let d = 1; d <= Utils.daysInMonth(s3.year, s3.month); d++) {
        const row = s3.cells[d] || {};
        Object.values(row).forEach(cell => {
          const list = normCell(cell);
          list.forEach(p => ordered.push(p));
          if (list.length >= 2) Store.recordCellCoMemory(list); // 同一格子多人组合
        });
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
      // 可见班组（排除被隐藏的列）
      const visibleTeams = teams.filter(t => !hiddenTeams.has(t.name));
      const thead = document.createElement('thead');
      const hr = document.createElement('tr');
      const hDate = document.createElement('th'); hDate.className = 's3-date-head'; hDate.textContent = '日期';
      hr.appendChild(hDate);
      visibleTeams.forEach(t => {
        const th = document.createElement('th');
        th.className = 's3-team-head';
        th.innerHTML = `<div class="s3-team-name">${esc(t.name)}</div><div class="s3-team-phone">${esc(t.phone)}</div>`;
        hr.appendChild(th);
      });
      thead.appendChild(hr);
      table.appendChild(thead);

      // 表头（班组栏）鼠标滚轮 → 表格横向滚动
      thead.addEventListener('wheel', (e) => {
        e.preventDefault();
        box.scrollLeft += e.deltaY + e.deltaX;
      }, { passive: false });

      const tbody = document.createElement('tbody');
      for (let d = 1; d <= days; d++) {
        const tr = document.createElement('tr');
        const tdDate = document.createElement('td');
        tdDate.className = 's3-date';
        tdDate.textContent = `${s3.month}月${d}日`;
        if (Utils.isAllDay(s3.year, s3.month, d)) tdDate.classList.add('is-allday');
        tr.appendChild(tdDate);
        visibleTeams.forEach((t, teamIdx) => {
          const td = document.createElement('td');
          td.className = 's3-cell';
          td.setAttribute('data-date', d);
          td.setAttribute('data-team', t.name);
          td.setAttribute('data-team-idx', teamIdx);
          renderCellContent(td, normCell(s3.cells[d] && s3.cells[d][t.name]));
          applyColor(td, d, t.name);
          // 色块填充模式：点击/框选选中
          if (fillMode) {
            td.addEventListener('mousedown', (e) => {
              e.preventDefault();
              boxStart = { date: d, teamIdx };
              boxSelecting = true;
              selected.clear();
              clearBoxHover(table);
              clearSelected(table);
            });
            td.addEventListener('mouseover', () => {
              if (boxSelecting && boxStart) paintBox(table, boxStart, { date: d, teamIdx });
            });
            td.addEventListener('click', (e) => {
              // 单击：若无框选则单选切换
              if (!boxSelecting) {
                const key = d + '|' + t.name;
                if (selected.has(key)) { selected.delete(key); td.classList.remove('color-sel'); }
                else { selected.add(key); td.classList.add('color-sel'); }
              }
            });
          } else {
            attachCellHandlers(td, d, t.name);
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);

      // 框选结束/取消（色块填充模式）
      table.addEventListener('mouseup', () => {
        if (!boxSelecting) return;
        table.querySelectorAll('.s3-cell.box-hover').forEach(c => {
          const key = c.getAttribute('data-date') + '|' + c.getAttribute('data-team');
          selected.add(key);
          c.classList.remove('box-hover');
          c.classList.add('color-sel');
        });
        boxSelecting = false;
      });
      table.addEventListener('mouseleave', () => {
        if (boxSelecting) { clearBoxHover(table); boxSelecting = false; }
      });

      box.appendChild(table);
      center.appendChild(box);
    }

    // 清除框选临时高亮
    function clearBoxHover(table) {
      table.querySelectorAll('.s3-cell.box-hover').forEach(c => c.classList.remove('box-hover'));
    }
    function clearSelected(table) {
      table.querySelectorAll('.s3-cell.color-sel').forEach(c => c.classList.remove('color-sel'));
    }
    // 高亮框选矩形（从 start 到 cur）
    function paintBox(table, start, cur) {
      clearBoxHover(table);
      const minDate = Math.min(start.date, cur.date);
      const maxDate = Math.max(start.date, cur.date);
      const minTeam = Math.min(start.teamIdx, cur.teamIdx);
      const maxTeam = Math.max(start.teamIdx, cur.teamIdx);
      table.querySelectorAll('.s3-cell').forEach(c => {
        const dd = +c.getAttribute('data-date');
        const ti = +c.getAttribute('data-team-idx');
        if (dd >= minDate && dd <= maxDate && ti >= minTeam && ti <= maxTeam) {
          c.classList.add('box-hover');
        }
      });
    }

    function applyColor(td, d, t) {
      const ci = s3.colors && s3.colors[d] && s3.colors[d][t];
      if (ci !== undefined && ci !== null) {
        td.style.background = '#' + PALETTE[ci % PALETTE.length];
      } else {
        td.style.background = '';
      }
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
        // 同一格子内去重（按姓名+长号+短号），保留顺序，最多 MAX_CELL 人；跨列/跨行允许重复
        const seen = new Set();
        const uniq = list.filter(p => {
          const k = personKey(p);
          if (!k || seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        s3.cells[date][team] = uniq.slice(0, MAX_CELL);
        Store.setS3(unit.deptId, s3);
        renderCellContent(td, normCell(s3.cells[date][team]));
      };
      const addPerson = (p) => {
        const list = getList();
        if (list.length >= MAX_CELL) { alert(`一个格子最多 ${MAX_CELL} 人`); return; }
        if (list.some(x => personKey(x) === personKey(p))) return; // 本格已有
        list.push(p);
        Store.recordUseCount(p.id);
        setList(list);
      };

      Schedule.makeDroppable(td, {
        onDrop(payload) {
          if (payload && payload.bundle) {
            const list = getList();
            payload.persons.forEach(p => {
              if (list.length < MAX_CELL && !list.some(x => personKey(x) === personKey(p))) { list.push(p); Store.recordUseCount(p.id); }
            });
            setList(list);
          } else if (Array.isArray(payload) && payload.length) {
            // 拖动已填格（多人）复制到本格
            const list = getList();
            payload.forEach(p => {
              if (p && p.name && list.length < MAX_CELL && !list.some(x => personKey(x) === personKey(p))) { list.push(p); Store.recordUseCount(p.id); }
            });
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

    // 计算某「全厂性」单元在某日的值班人员（跨班组去重）
    function syncCellsFor(unitId) {
      const s = Store.getS3(unitId) || {};
      const res = {};
      const days = Utils.daysInMonth(s3.year, s3.month);
      for (let d = 1; d <= days; d++) {
        const row = (s.cells && s.cells[d]) || {};
        const seen = new Set();
        const people = [];
        Object.values(row).forEach(cell => {
          normCell(cell).forEach(p => {
            const key = (p.name || '') + '|' + (p.phone || '') + '|' + (p.shortPhone || '');
            if (p.name && !seen.has(key)) { seen.add(key); people.push(p); }
          });
        });
        res[d] = people;
      }
      return res;
    }

    function exportOne() {
      const teams = Store.teamsOf(unit.deptName);
      const dept = { deptName: unit.sheetName, title: unit.title, teams, cells: s3.cells, syncCols: [] };
      // 事业部单元导出时附加全厂性同步列
      if (SYNC_UNIT_IDS.indexOf(unit.deptId) === -1) {
        dept.syncCols = SYNC_UNIT_IDS.map(uid => {
          const u = BANZU_UNITS.find(x => x.deptId === uid);
          return { label: u.sheetName, zone: SYNC_ZONE[uid] || '', cells: syncCellsFor(uid) };
        });
      }
      const wb = ExcelGen.buildBanzuWorkbook([dept], null, { year: s3.year, month: s3.month });
      ExcelGen.download(wb, `${unit.sheetName}${s3.year}年${s3.month}月份班组夜间值班表.xlsx`);
    }

    function exportAll() {
      const deptList = BANZU_UNITS.map(x => {
        const s = Store.getS3(x.deptId) || { year: s3.year, month: s3.month, cells: {} };
        const dept = { deptName: x.sheetName, title: x.title, teams: Store.teamsOf(x.deptName), cells: s.cells, syncCols: [] };
        if (SYNC_UNIT_IDS.indexOf(x.deptId) === -1) {
          dept.syncCols = SYNC_UNIT_IDS.map(uid => {
            const u = BANZU_UNITS.find(y => y.deptId === uid);
            return { label: u.sheetName, zone: SYNC_ZONE[uid] || '', cells: syncCellsFor(uid) };
          });
        }
        return dept;
      });
      const wb = ExcelGen.buildBanzuWorkbook(deptList, null, { year: s3.year, month: s3.month });
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
