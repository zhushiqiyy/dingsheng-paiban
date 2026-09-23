/* ============================================================
 * 视图：二级值班（管理员全部门 / 普通用户本部门）
 * ============================================================ */
window.VS2 = (function () {

  function nextMonth() {
    const now = new Date();
    let y = now.getFullYear(), m = now.getMonth() + 1;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    return { year: y, month: m };
  }

  function render(main) {
    const u = App.currentUser();
    const admin = u.role === 'admin';
    // 当前部门
    let dept = admin ? (window.__s2_dept || CONFIG.DEPARTMENTS[0]) : CONFIG.DEPARTMENTS.find(d => d.name === u.department);
    if (!dept) {
      main.innerHTML = '<div class="card"><div class="muted">你的账号未绑定有效部门，请联系管理员。</div></div>';
      return;
    }
    // 当前选中编组（普通用户可自定义备选人员栏）
    let groupId = window.__s2_group || 'all';

    function renderDept() {
      window.__s2_dept = dept;
      let s2 = Store.getS2(dept.id);
      if (!s2) {
        const nm = nextMonth();
        s2 = {
          year: nm.year, month: nm.month,
          assignments: {}, tags: {},
          note: dept.note,
          approver: '', maker: '', publisher: '', publishDate: '',
        };
      }
      const li = Store.getLastInput('s2', dept.id);
      s2.approver = s2.approver || li.approver || dept.approver;
      s2.maker = s2.maker || li.maker || dept.maker;
      s2.publisher = s2.publisher || li.publisher || dept.publisher;
      const now = new Date();
      s2.publishDate = s2.publishDate || Utils.fmtDateCN(now.getFullYear(), now.getMonth() + 1, now.getDate());

      // 候选人：默认全部本部门人员，或选中编组的成员
      const allCandidates = Store.listPersonnel().filter(p => p.department === dept.name);
      const myGroups = Store.listGroups(u.id);
      let candidates = allCandidates;
      if (groupId !== 'all') {
        const g = myGroups.find(x => x.id === groupId);
        if (g) candidates = Store.groupPersons(u.id, groupId);
      }

      // 主容器
      main.innerHTML = '';
      const deptBar = document.createElement('div');
      deptBar.className = 'dept-bar';
      // 编组选择（管理员与普通用户都可用）
      const groupOpts = `<option value="all">全部人员（${allCandidates.length}人）</option>` +
        myGroups.map(g => `<option value="${g.id}" ${g.id === groupId ? 'selected' : ''}>${esc(g.name)}（${(g.personIds || []).length}人）</option>`).join('');
      const groupUI = `<label>备选栏 <select id="s2-group">${groupOpts}</select></label>
        <button id="s2-groups" class="btn">🔧 编组管理</button>`;
      if (admin) {
        let tabs = '';
        CONFIG.DEPARTMENTS.forEach(d => {
          tabs += `<button class="dept-tab ${d.id === dept.id ? 'active' : ''}" data-dept="${d.id}">${d.short || d.name}</button>`;
        });
        deptBar.innerHTML = `<div class="dept-tabs">${tabs}</div>${groupUI}<span class="spacer"></span>
          <button id="s2-export-all" class="btn btn-primary">📤 导出全部 9 部门汇总</button>`;
        main.appendChild(deptBar);
        deptBar.querySelectorAll('.dept-tab').forEach(t => t.addEventListener('click', () => {
          dept = CONFIG.DEPARTMENTS.find(d => d.id === t.getAttribute('data-dept'));
          renderDept();
        }));
        deptBar.querySelector('#s2-export-all').addEventListener('click', exportAll);
      } else {
        deptBar.innerHTML = `<div class="dept-title">${dept.name} 二级值班表</div>${groupUI}`;
        main.appendChild(deptBar);
      }
      // 编组事件
      deptBar.querySelector('#s2-group').addEventListener('change', (e) => {
        groupId = e.target.value;
        window.__s2_group = groupId;
        renderDept();
      });
      deptBar.querySelector('#s2-groups').addEventListener('click', () => {
        Schedule.groupManager(u.id, dept.name, () => renderDept());
      });

      const body = document.createElement('div');
      main.appendChild(body);

      DutyEditor.render(body, {
        year: s2.year, month: s2.month,
        assignments: s2.assignments, tags: s2.tags, note: s2.note,
        signers: { approver: s2.approver, maker: s2.maker },
        candidatePersons: candidates,
        groupByTeam: true,
        userId: u.id,
        departmentName: dept.name,
        titleSuffix: '值班表',
        personHeader: '值班人',
        signerFields: [
          { key: 'approver', label: '审批：', defaultValue: dept.approver },
          { key: 'maker', label: '制表：', defaultValue: dept.maker },
        ],
        getSubmit: () => Store.getSubmit('s2', dept.id),
        onSubmit: () => Store.setSubmit('s2', dept.id, true),
        onSave(patch) {
          if (patch.assignments) s2.assignments = patch.assignments;
          if (patch.tags) s2.tags = patch.tags;
          if (patch.note !== undefined) s2.note = patch.note;
          if (patch.signers) { s2.approver = patch.signers.approver; s2.maker = patch.signers.maker; }
          Store.setS2(dept.id, s2);
          Store.setLastInput('s2', dept.id, { approver: s2.approver, maker: s2.maker });
        },
        onYearMonthChange(y, m) {
          s2.year = y; s2.month = m;
          s2.assignments = {}; s2.tags = {};
          Store.setS2(dept.id, s2);
          renderDept();
        },
        onExport() {
          const doc = WordGen.buildLevel2([{ dept, data: s2 }]);
          WordGen.download(doc, `${dept.name}${s2.year}年${s2.month}月份二级值班表.docx`);
        },
      });
    }

    function exportAll() {
      // 按模板顺序导出 9 部门
      const items = [];
      CONFIG.DEPARTMENTS.forEach(d => {
        let s = Store.getS2(d.id);
        if (!s) { const nm = nextMonth(); s = { year: nm.year, month: nm.month, assignments: {}, tags: {}, note: d.note, approver: d.approver, maker: d.maker, publisher: d.publisher, publishDate: '' }; }
        items.push({ dept: d, data: s });
      });
      const y = items[0].data.year, m = items[0].data.month;
      const doc = WordGen.buildLevel2(items);
      WordGen.download(doc, `二级值班表汇总_${y}年${m}月份.docx`);
    }

    renderDept();
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  return { render };
})();
