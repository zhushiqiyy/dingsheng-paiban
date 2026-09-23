/* ============================================================
 * 视图：人员管理（管理员） + 用户管理（管理员）
 * ============================================================ */
window.VPersonnel = (function () {

  /* ==================== 人员管理 ==================== */
  function render(main) {
    main.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-title">人员管理</div>
      <div class="toolbar">
        <input id="p-search" class="inp" placeholder="搜索 姓名/拼音/电话…">
        <button id="p-add" class="btn btn-primary">＋ 新增人员</button>
        <button id="p-import" class="btn">📥 导入 Excel/CSV</button>
        <button id="p-export" class="btn">📤 导出 Excel</button>
        <input id="p-file" type="file" accept=".xlsx,.xls,.csv" style="display:none">
        <span class="spacer"></span>
        <button id="p-batch" class="btn">批量修改班组/部门</button>
        <button id="p-del-sel" class="btn btn-danger">删除选中</button>
      </div>
      <div class="table-wrap">
        <table class="grid-table" id="p-table">
          <thead><tr>
            <th><input type="checkbox" id="p-checkall"></th>
            <th>姓名</th><th>联系电话</th><th>班组</th><th>部门</th><th>操作</th>
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="table-foot" id="p-count"></div>
    `;
    main.appendChild(card);

    let filter = '';
    function refresh() {
      const all = Store.listPersonnel();
      const filtered = all.filter(p => Utils.matchPerson(filter, p));
      const tbody = card.querySelector('#p-table tbody');
      tbody.innerHTML = '';
      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="muted">暂无人员数据，请导入或新增</td></tr>';
      }
      filtered.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input type="checkbox" class="p-check" data-id="${p.id}"></td>
          <td class="editable" data-field="name">${esc(p.name)}</td>
          <td class="editable" data-field="phone">${esc(p.phone)}</td>
          <td class="editable" data-field="team">${esc(p.team)}</td>
          <td class="editable" data-field="department">${esc(p.department)}</td>
          <td><button class="btn btn-sm btn-danger" data-del="${p.id}">删除</button></td>
        `;
        tbody.appendChild(tr);
      });
      card.querySelector('#p-count').textContent = `共 ${all.length} 人，当前显示 ${filtered.length} 人`;
    }

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
    window.__esc = esc;

    // 搜索
    card.querySelector('#p-search').addEventListener('input', (e) => { filter = e.target.value; refresh(); });

    // 全选
    card.querySelector('#p-checkall').addEventListener('change', (e) => {
      card.querySelectorAll('.p-check').forEach(c => c.checked = e.target.checked);
    });

    // 新增
    card.querySelector('#p-add').addEventListener('click', () => openPersonEditor(null, refresh));

    // 导入
    card.querySelector('#p-import').addEventListener('click', () => card.querySelector('#p-file').click());
    card.querySelector('#p-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      await importFile(file, refresh);
      e.target.value = '';
    });

    // 导出
    card.querySelector('#p-export').addEventListener('click', () => exportExcel());

    // 批量修改
    card.querySelector('#p-batch').addEventListener('click', () => {
      const ids = selectedIds(card);
      if (ids.length === 0) { alert('请先勾选要修改的人员'); return; }
      openBatchEditor(ids, refresh);
    });

    // 删除选中
    card.querySelector('#p-del-sel').addEventListener('click', () => {
      const ids = selectedIds(card);
      if (ids.length === 0) { alert('请先勾选要删除的人员'); return; }
      if (!confirm(`确定删除选中的 ${ids.length} 人？`)) return;
      ids.forEach(id => Store.removePerson(id));
      refresh();
    });

    // 行内编辑（点击单元格）
    card.querySelector('#p-table').addEventListener('click', (e) => {
      const del = e.target.getAttribute('data-del');
      if (del) { if (confirm('确定删除该人员？')) { Store.removePerson(del); refresh(); } return; }
      const td = e.target.closest('.editable');
      if (td) {
        const id = td.closest('tr').querySelector('.p-check').getAttribute('data-id');
        const field = td.getAttribute('data-field');
        openInlineEdit(td, id, field, refresh);
      }
    });

    refresh();
  }

  function selectedIds(card) {
    return Array.from(card.querySelectorAll('.p-check:checked')).map(c => c.getAttribute('data-id'));
  }

  function openInlineEdit(td, id, field, refresh) {
    const p = Store.listPersonnel().find(x => x.id === id);
    if (!p) return;
    const old = p[field] || '';
    td.innerHTML = `<input type="text" class="inp inline-inp" value="${__esc(old)}">`;
    const inp = td.querySelector('input');
    inp.focus();
    inp.select();
    const commit = () => {
      Store.updatePerson(id, { [field]: inp.value.trim() });
      refresh();
    };
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') refresh(); });
  }

  function openPersonEditor(id, refresh) {
    const p = id ? Store.listPersonnel().find(x => x.id === id) : null;
    const deptSel = App.deptOptions(p ? p.department : '');
    const overlay = modal(`
      <div class="modal-title">${p ? '编辑人员' : '新增人员'}</div>
      <div class="field"><label>姓名 *</label><input id="pe-name" value="${__esc(p ? p.name : '')}"></div>
      <div class="field"><label>联系电话 *</label><input id="pe-phone" value="${__esc(p ? p.phone : '')}"></div>
      <div class="field"><label>班组</label><input id="pe-team" value="${__esc(p ? p.team : '')}"></div>
      <div class="field"><label>部门</label><select id="pe-dept">${deptSel}</select></div>
      <div class="modal-actions">
        <button id="pe-cancel" class="btn">取消</button>
        <button id="pe-save" class="btn btn-primary">保存</button>
      </div>
    `);
    const get = (sel) => overlay.querySelector(sel);
    get('#pe-cancel').addEventListener('click', () => overlay.remove());
    get('#pe-save').addEventListener('click', () => {
      const name = get('#pe-name').value.trim();
      const phone = get('#pe-phone').value.trim();
      if (!name || !phone) { alert('姓名和电话为必填项'); return; }
      const data = { name, phone, team: get('#pe-team').value.trim(), department: get('#pe-dept').value };
      if (id) Store.updatePerson(id, data); else Store.addPerson(data);
      overlay.remove();
      refresh();
    });
  }

  function openBatchEditor(ids, refresh) {
    const deptSel = App.deptOptions('');
    const overlay = modal(`
      <div class="modal-title">批量修改（${ids.length} 人）</div>
      <div class="field"><label>修改班组为（留空不修改）</label><input id="be-team"></div>
      <div class="field"><label>修改部门为（留空不修改）</label><select id="be-dept">${deptSel}</select></div>
      <div class="modal-actions">
        <button id="be-cancel" class="btn">取消</button>
        <button id="be-save" class="btn btn-primary">应用</button>
      </div>
    `);
    overlay.querySelector('#be-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#be-save').addEventListener('click', () => {
      const team = overlay.querySelector('#be-team').value.trim();
      const dept = overlay.querySelector('#be-dept').value;
      const patch = {};
      if (team) patch.team = team;
      if (dept) patch.department = dept;
      if (Object.keys(patch).length === 0) { alert('请至少填写一项'); return; }
      ids.forEach(id => Store.updatePerson(id, patch));
      overlay.remove();
      refresh();
    });
  }

  /* ---------- 导入 ---------- */
  async function importFile(file, refresh) {
    try {
      const buf = await Utils.readFileAsArrayBuffer(file);
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      // 识别表头列：姓名/名字/name，电话/手机号/phone，班组，部门
      const header = rows[0] || [];
      const idx = {
        name: findCol(header, ['姓名', '名字', 'name', '人员', 'Name']),
        phone: findCol(header, ['电话', '联系电话', '手机号', '手机', 'phone', 'tel']),
        team: findCol(header, ['班组', 'team', '组']),
        department: findCol(header, ['部门', 'department', 'dept', '所属部门']),
      };
      const people = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.length === 0) continue;
        const name = (idx.name >= 0 ? r[idx.name] : '') || '';
        const phone = (idx.phone >= 0 ? r[idx.phone] : '') || '';
        if (!name && !phone) continue;
        people.push({
          name: String(name).trim(),
          phone: String(phone).trim(),
          team: idx.team >= 0 ? String(r[idx.team] || '').trim() : '',
          department: idx.department >= 0 ? String(r[idx.department] || '').trim() : '',
        });
      }
      if (people.length === 0) { alert('未能解析到有效人员数据，请检查列名（需包含 姓名/电话）'); return; }

      // 预览确认
      const overlay = modal(`
        <div class="modal-title">导入预览（${people.length} 人）</div>
        <div class="table-wrap" style="max-height:320px;overflow:auto">
          <table class="grid-table"><thead><tr><th>姓名</th><th>电话</th><th>班组</th><th>部门</th></tr></thead>
          <tbody>${people.slice(0, 100).map(p => `<tr><td>${__esc(p.name)}</td><td>${__esc(p.phone)}</td><td>${__esc(p.team)}</td><td>${__esc(p.department)}</td></tr>`).join('')}</tbody></table>
        </div>
        ${people.length > 100 ? '<div class="muted">（仅预览前100条）</div>' : ''}
        <div class="modal-actions">
          <button id="im-cancel" class="btn">取消</button>
          <button id="im-save" class="btn btn-primary">确认导入</button>
        </div>
      `);
      overlay.querySelector('#im-cancel').addEventListener('click', () => overlay.remove());
      overlay.querySelector('#im-save').addEventListener('click', () => {
        const added = Store.importPersonnel(people);
        overlay.remove();
        alert(`成功导入 ${added} 人`);
        refresh();
      });
    } catch (e) {
      alert('导入失败：' + e.message);
    }
  }

  function findCol(header, names) {
    for (const n of names) {
      const i = header.findIndex(h => String(h || '').trim().toLowerCase() === n.toLowerCase());
      if (i >= 0) return i;
    }
    return -1;
  }

  function exportExcel() {
    const people = Store.listPersonnel();
    const aoa = [['姓名', '联系电话', '班组', '部门']];
    people.forEach(p => aoa.push([p.name, p.phone, p.team, p.department]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 22 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '人员信息');
    XLSX.writeFile(wb, `人员信息_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  /* ==================== 用户管理 ==================== */
  function renderUsers(main) {
    main.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-title">用户管理</div>
      <div class="table-wrap">
        <table class="grid-table">
          <thead><tr><th>用户名</th><th>姓名</th><th>角色</th><th>所属部门</th><th>注册时间</th><th>操作</th></tr></thead>
          <tbody id="u-tbody"></tbody>
        </table>
      </div>
    `;
    main.appendChild(card);

    function refresh() {
      const users = Store.listUsers();
      const tbody = card.querySelector('#u-tbody');
      tbody.innerHTML = users.map(u => `
        <tr>
          <td>${__esc(u.username)}</td>
          <td>${__esc(u.name)}</td>
          <td>${u.role === 'admin' ? '<b>管理员</b>' : '普通用户'}</td>
          <td>${__esc(u.department)}</td>
          <td>${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-'}</td>
          <td>${u.role === 'admin' ? '<span class="muted">—</span>' : `<button class="btn btn-sm" data-reset="${u.id}">重置密码</button> <button class="btn btn-sm btn-danger" data-del="${u.id}">删除</button>`}</td>
        </tr>
      `).join('');
    }

    card.querySelector('#u-tbody').addEventListener('click', (e) => {
      const rid = e.target.getAttribute('data-reset');
      const did = e.target.getAttribute('data-del');
      if (rid) {
        const np = prompt('输入新密码：');
        if (np) { Store.resetUserPassword(rid, np); alert('密码已重置'); refresh(); }
      } else if (did) {
        if (confirm('确定删除该用户？')) { Store.deleteUser(did); refresh(); }
      }
    });

    refresh();
  }

  function modal(html) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal">${html}</div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    return overlay;
  }

  return { render, renderUsers };
})();
