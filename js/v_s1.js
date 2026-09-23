/* ============================================================
 * 视图：一级值班（干部值班表，管理员）
 * ============================================================ */
window.VS1 = (function () {

  function nextMonth() {
    const now = new Date();
    let y = now.getFullYear(), m = now.getMonth() + 1;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    return { year: y, month: m };
  }

  function render(main) {
    let s1 = Store.getS1();
    if (!s1) {
      const nm = nextMonth();
      s1 = {
        year: nm.year, month: nm.month,
        assignments: {}, tags: {},
        note: CONFIG.SCHEDULE1_DEFAULTS.note,
        maker: '', reviewer: '', approver: '',
        publishDept: CONFIG.SCHEDULE1_DEFAULTS.publishDept,
        publisher: '', publishDate: '',
      };
    }
    // 继承上次输入
    const li = Store.getLastInput('s1');
    s1.maker = s1.maker || li.maker || CONFIG.SCHEDULE1_DEFAULTS.maker;
    s1.reviewer = s1.reviewer || li.reviewer || CONFIG.SCHEDULE1_DEFAULTS.reviewer;
    s1.approver = s1.approver || li.approver || CONFIG.SCHEDULE1_DEFAULTS.approver;
    s1.publisher = s1.publisher || li.publisher || CONFIG.SCHEDULE1_DEFAULTS.publisher;
    s1.publishDept = s1.publishDept || CONFIG.SCHEDULE1_DEFAULTS.publishDept;

    // 发布时间默认当前日期
    const now = new Date();
    s1.publishDate = s1.publishDate || Utils.fmtDateCN(now.getFullYear(), now.getMonth() + 1, now.getDate());

    // 候选人 = 管理员维护的干部/领导名单
    const candidates = Store.leaderPersons();

    DutyEditor.render(main, {
      year: s1.year, month: s1.month,
      assignments: s1.assignments, tags: s1.tags, note: s1.note,
      signers: { maker: s1.maker, reviewer: s1.reviewer, approver: s1.approver },
      candidatePersons: candidates,
      groupByTeam: false,
      maxPerCell: 2,
      userId: (App.currentUser() && App.currentUser().id),
      departmentName: '',
      titleSuffix: '干部值班表',
      personHeader: '值班人及其手机号',
      extraButtons: [
        { label: '⚙ 管理候选人员', onClick: () => leaderManager(() => render(main)) },
      ],
      signerFields: [
        { key: 'maker', label: '制表：', defaultValue: CONFIG.SCHEDULE1_DEFAULTS.maker },
        { key: 'reviewer', label: '审核：', defaultValue: CONFIG.SCHEDULE1_DEFAULTS.reviewer },
        { key: 'approver', label: '批准：', defaultValue: CONFIG.SCHEDULE1_DEFAULTS.approver },
      ],
      getSubmit: () => Store.getSubmit('s1'),
      onSubmit: () => Store.setSubmit('s1', null, true),
      onSave(patch) {
        if (patch.assignments) s1.assignments = patch.assignments;
        if (patch.tags) s1.tags = patch.tags;
        if (patch.note !== undefined) s1.note = patch.note;
        if (patch.signers) {
          s1.maker = patch.signers.maker;
          s1.reviewer = patch.signers.reviewer;
          s1.approver = patch.signers.approver;
        }
        Store.setS1(s1);
        Store.setLastInput('s1', null, { maker: s1.maker, reviewer: s1.reviewer, approver: s1.approver });
      },
      onYearMonthChange(y, m) {
        s1.year = y; s1.month = m;
        s1.assignments = {}; s1.tags = {};
        Store.setS1(s1);
        render(main);
      },
      onExport() {
        const doc = WordGen.buildLevel1({
          year: s1.year, month: s1.month,
          assignments: s1.assignments, tags: s1.tags, note: s1.note,
          maker: s1.maker, reviewer: s1.reviewer, approver: s1.approver,
          publishDept: s1.publishDept, publisher: s1.publisher, publishDate: s1.publishDate,
        });
        WordGen.download(doc, `${CONFIG.COMPANY.shortName}${s1.year}年${s1.month}月份干部值班表.docx`);
      },
    });
  }

  /** 一级候选人员管理（管理员从全部人员中勾选干部/领导） */
  function leaderManager(onChanged) {
    const all = Store.listPersonnel();
    const selected = new Set(Store.getLeaderIds());
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal" style="width:680px">
      <div class="modal-title">一级值班候选人员（干部/领导）</div>
      <p class="muted" style="margin-bottom:8px">从已导入名单中勾选可参与一级值班的人员（可跨部门）。</p>
      <input id="lm-search" class="inp" placeholder="搜索 姓名/拼音/电话…" style="width:100%;margin-bottom:6px">
      <div class="eg-body" id="lm-body"></div>
      <div class="modal-actions">
        <button id="lm-cancel" class="btn">取消</button>
        <button id="lm-save" class="btn btn-primary">保存（已选 ${selected.size} 人）</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
    function renderList(q) {
      const box = overlay.querySelector('#lm-body');
      box.innerHTML = '';
      all.filter(p => Utils.matchPerson(q, p)).slice(0, 500).forEach(p => {
        const lb = document.createElement('label');
        lb.className = 'eg-item';
        lb.innerHTML = `<input type="checkbox" value="${p.id}" ${selected.has(p.id) ? 'checked' : ''}> <span class="eg-name">${esc(p.name)}</span><span class="eg-phone">${esc(Utils.phoneText(p))}</span><span class="eg-tag">${esc(p.department)}</span>`;
        box.appendChild(lb);
      });
    }
    renderList('');
    overlay.querySelector('#lm-search').addEventListener('input', (e) => renderList(e.target.value));
    overlay.querySelector('#lm-body').addEventListener('change', (e) => {
      const cb = e.target;
      if (cb.type === 'checkbox') { if (cb.checked) selected.add(cb.value); else selected.delete(cb.value); overlay.querySelector('#lm-save').textContent = `保存（已选 ${selected.size} 人）`; }
    });
    overlay.querySelector('#lm-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#lm-save').addEventListener('click', () => {
      Store.setLeaderIds(Array.from(selected));
      overlay.remove();
      if (onChanged) onChanged();
    });
  }

  return { render };
})();
