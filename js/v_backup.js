/* ============================================================
 * 视图：数据备份 / 导入导出（管理员）
 * ============================================================ */
window.VBackup = (function () {

  function render(main) {
    main.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-title">数据备份与恢复</div>
      <p class="muted">备份文件包含全部人员、用户、排班数据（JSON 格式），可在不同电脑间迁移，或作为存档。</p>
      <div class="backup-actions">
        <button id="bk-export" class="btn btn-primary">💾 导出全部数据</button>
        <button id="bk-import" class="btn">📥 导入数据</button>
        <input id="bk-file" type="file" accept=".json" style="display:none">
        <button id="bk-download-personnel" class="btn">📤 导出人员模板(Excel)</button>
        <button id="bk-clear" class="btn btn-danger">清空全部数据</button>
      </div>
    `;
    main.appendChild(card);

    card.querySelector('#bk-export').addEventListener('click', () => {
      const json = Store.exportAll();
      const blob = new Blob([json], { type: 'application/json' });
      Utils.downloadBlob(blob, `排班数据备份_${new Date().toISOString().slice(0, 10)}.json`);
    });

    card.querySelector('#bk-import').addEventListener('click', () => card.querySelector('#bk-file').click());
    card.querySelector('#bk-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        if (!confirm('导入将覆盖当前全部数据，确定继续？')) return;
        Store.importAll(text);
        alert('导入成功');
        App.renderRoot();
      } catch (err) {
        alert('导入失败：' + err.message);
      }
      e.target.value = '';
    });

    card.querySelector('#bk-download-personnel').addEventListener('click', () => {
      const aoa = [['姓名', '工作号码', '集团短号', '班组', '部门']];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), '人员信息');
      XLSX.writeFile(wb, '人员导入模板.xlsx');
    });

    card.querySelector('#bk-clear').addEventListener('click', () => {
      if (!confirm('确定清空全部数据？此操作不可恢复！')) return;
      if (!confirm('再次确认：清空后所有人员、用户（含管理员）、排班数据都将删除。')) return;
      Store.clearAll();
      App.renderRoot();
    });
  }

  return { render };
})();
