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

    renderCloudCard(main);
  }

  /* ---------- 云同步（跨设备共享） ---------- */
  function renderCloudCard(main) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-title">☁️ 云同步（跨设备共享数据）</div>
      <div id="cloud-status" class="muted">检查云连接状态…</div>
      <div id="cloud-form" style="display:none;margin-top:10px">
        <div class="field-row">
          <input id="cloud-email" type="email" placeholder="团队账号邮箱" style="flex:1">
          <input id="cloud-pass" type="password" placeholder="密码">
          <button id="cloud-connect" class="btn btn-primary">连接</button>
        </div>
        <div class="field-row" style="margin-top:8px">
          <button id="cloud-register" class="btn">注册新团队账号（首次使用）</button>
        </div>
        <div id="cloud-otp" style="display:none;margin-top:8px">
          <input id="cloud-otp-code" placeholder="输入邮箱收到的验证码" style="flex:1">
          <button id="cloud-verify" class="btn btn-primary">验证并注册</button>
        </div>
      </div>
      <div id="cloud-actions" style="display:none;margin-top:10px;flex-wrap:wrap;gap:8px">
        <button id="cloud-upload" class="btn">⬆️ 立即上传到云端</button>
        <button id="cloud-download" class="btn">⬇️ 从云端下载覆盖本机</button>
        <button id="cloud-disconnect" class="btn btn-danger">断开云连接</button>
      </div>
      <p class="muted" style="margin-top:10px;font-size:12px;line-height:1.6">
        说明：用一个「团队账号」（邮箱+密码）连接云端后，本机的人员、排班、设置会自动上传到云端；其他电脑用同一团队账号连接，即可共享全部数据。<br>
        · 登录态（当前登录的用户名）不跨设备同步，各电脑各自登录自己的账号。<br>
        · 首次使用：先点「注册新团队账号」，输入邮箱收验证码完成注册，之后每台电脑用「连接」登录即可。<br>
        · 连接后请点「立即上传」把本机数据同步到云端；之后数据改动会自动上传。
      </p>
    `;
    main.appendChild(card);

    const statusEl = card.querySelector('#cloud-status');
    const formEl = card.querySelector('#cloud-form');
    const actionsEl = card.querySelector('#cloud-actions');
    const otpBox = card.querySelector('#cloud-otp');

    if (!(window.CloudSync && CloudSync.isAvailable())) {
      statusEl.textContent = '云服务不可用（SDK 未加载，请检查网络后刷新页面）。';
      return;
    }

    function showConnected() {
      statusEl.innerHTML = '✅ 已连接云端，数据改动将自动同步。';
      formEl.style.display = 'none';
      actionsEl.style.display = 'flex';
    }
    function showDisconnected() {
      statusEl.innerHTML = '⚠️ 未连接云端（数据仅存在本机浏览器）。首次请注册团队账号，或输入已有账号密码连接。';
      formEl.style.display = 'block';
      actionsEl.style.display = 'none';
    }

    CloudSync.refreshState().then((enabled) => {
      if (enabled) showConnected(); else showDisconnected();
    });

    let pendingVerificationId = null;
    let pendingEmail = '';

    card.querySelector('#cloud-connect').addEventListener('click', async () => {
      const email = card.querySelector('#cloud-email').value.trim();
      const pass = card.querySelector('#cloud-pass').value;
      if (!email || !pass) { alert('请输入团队账号邮箱和密码'); return; }
      const btn = card.querySelector('#cloud-connect');
      btn.disabled = true; btn.textContent = '连接中…';
      const r = await CloudSync.connect(email, pass);
      btn.disabled = false; btn.textContent = '连接';
      if (!r.ok) { alert('连接失败：' + r.msg + '（若账号尚未注册，请点「注册新团队账号」）'); return; }
      // 连接后：先下载云端数据；云端有人则以云端为准，云端空才上传本机（避免空数据覆盖云端）
      const d = await CloudSync.download();
      showConnected();
      if (d.ok && d.data) {
        const data = d.data;
        data.session = (Store.get() && Store.get().session) || { userId: null };
        Store.loadFromCloud(data);
        App.renderRoot();
        alert(`已连接云端，并同步云端数据到本机（云端 ${(data.personnel || []).length} 人）。`);
      } else if (d.ok && !d.data) {
        // 云端无数据：上传本机
        const up = await CloudSync.uploadGuarded(JSON.parse(Store.exportAll()));
        if (!up.ok && up.guarded) { alert(up.msg); return; }
        alert(up.ok ? '已连接云端，本机数据已上传到云端。' : '已连接云端，但首次上传失败：' + up.msg);
      } else {
        alert('已连接云端，但读取云端数据失败：' + d.msg);
      }
    });

    card.querySelector('#cloud-register').addEventListener('click', async () => {
      const email = card.querySelector('#cloud-email').value.trim();
      const pass = card.querySelector('#cloud-pass').value;
      if (!email || !pass) { alert('请先填写团队账号邮箱和密码（密码用于日后登录）'); return; }
      const btn = card.querySelector('#cloud-register');
      btn.disabled = true; btn.textContent = '发送验证码中…';
      const r = await CloudSync.sendOtp(email);
      btn.disabled = false; btn.textContent = '重新发送验证码';
      if (!r.ok) { alert('发送验证码失败：' + r.msg); return; }
      pendingVerificationId = r.verificationId;
      pendingEmail = email;
      otpBox.style.display = 'flex';
      alert('验证码已发送到 ' + email + '，请查收邮件并在下方输入验证码。');
    });

    card.querySelector('#cloud-verify').addEventListener('click', async () => {
      const token = card.querySelector('#cloud-otp-code').value.trim();
      const pass = card.querySelector('#cloud-pass').value;
      if (!token) { alert('请输入邮箱收到的验证码'); return; }
      if (!pendingVerificationId) { alert('请先点「注册新团队账号」发送验证码'); return; }
      const btn = card.querySelector('#cloud-verify');
      btn.disabled = true; btn.textContent = '注册中…';
      const r = await CloudSync.verifyRegister(pendingVerificationId, token, pendingEmail, pass);
      btn.disabled = false; btn.textContent = '验证并注册';
      if (!r.ok) { alert('注册失败：' + r.msg); return; }
      // 注册（全新账号）后：云端应为空，直接上传本机；用受保护版本兜底
      const up = await CloudSync.uploadGuarded(JSON.parse(Store.exportAll()));
      otpBox.style.display = 'none';
      card.querySelector('#cloud-otp-code').value = '';
      showConnected();
      if (!up.ok && up.guarded) { alert(up.msg); return; }
      alert(up.ok ? '团队账号已注册并连接，本机数据已上传到云端。' : '团队账号已注册连接，但首次上传失败：' + up.msg);
    });

    card.querySelector('#cloud-upload').addEventListener('click', async () => {
      const up = await CloudSync.uploadGuarded(JSON.parse(Store.exportAll()));
      if (!up.ok && up.guarded) { alert(up.msg); return; }
      alert(up.ok ? '已上传到云端。' : '上传失败：' + up.msg);
    });

    card.querySelector('#cloud-download').addEventListener('click', async () => {
      const r = await CloudSync.download();
      if (!r.ok) { alert('下载失败：' + r.msg); return; }
      if (!r.data) { alert('云端暂无数据。'); return; }
      const cloudCount = (r.data.personnel || []).length;
      const localCount = (Store.listPersonnel() || []).length;
      // 云端人员为空、本机有人：提示（可能是云端被误清空，或人员还没上传过）
      if (cloudCount === 0 && localCount > 0) {
        if (!confirm(`云端人员信息为空，但本机有 ${localCount} 人。\n若下载，将用云端空数据覆盖本机，导致本机人员丢失。\n\n确定仍要下载？（建议先点「立即上传」把本机数据上传到云端）`)) return;
      } else if (!confirm('从云端下载将覆盖本机当前全部数据，确定继续？')) {
        return;
      }
      const data = r.data;
      data.session = (Store.get() && Store.get().session) || { userId: null };
      Store.loadFromCloud(data);
      App.renderRoot();
      alert('已从云端载入数据。');
    });

    card.querySelector('#cloud-disconnect').addEventListener('click', async () => {
      if (!confirm('断开云连接后，本机将不再自动同步云端。确定断开？')) return;
      await CloudSync.disconnect();
      showDisconnected();
    });
  }

  return { render };
})();
