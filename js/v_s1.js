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

    // 候选人 = 全部人员
    const candidates = Store.listPersonnel();

    DutyEditor.render(main, {
      year: s1.year, month: s1.month,
      assignments: s1.assignments, tags: s1.tags, note: s1.note,
      signers: { maker: s1.maker, reviewer: s1.reviewer, approver: s1.approver },
      candidatePersons: candidates,
      groupByTeam: false,
      titleSuffix: '干部值班表',
      personHeader: '值班人及其手机号',
      signerFields: [
        { key: 'maker', label: '制表：', defaultValue: CONFIG.SCHEDULE1_DEFAULTS.maker },
        { key: 'reviewer', label: '审核：', defaultValue: CONFIG.SCHEDULE1_DEFAULTS.reviewer },
        { key: 'approver', label: '批准：', defaultValue: CONFIG.SCHEDULE1_DEFAULTS.approver },
      ],
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
        // 切换月份时保留签字人，清空或保留排班？保留同一月份数据更好 —— 这里按新月份清空排班
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

  return { render };
})();
