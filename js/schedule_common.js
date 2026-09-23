/* ============================================================
 * 共享排班组件：人员检索面板 + 拖拽放置
 * ============================================================ */
window.Schedule = (function () {

  /** 拖拽中的 payload */
  let _dragPayload = null;

  /** 渲染左侧候选人面板（可搜索、可拖拽、可按班组分组）
   * @param container DOM
   * @param {array} persons 候选人员（可含 team 字段）
   * @param {object} opts { groupByTeam:boolean }
   * @param {function} onPick(p) 点击选中回调
   */
  function renderPersonPanel(container, persons, opts, onPick) {
    opts = opts || {};
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'pp-panel';

    // 搜索框
    const search = document.createElement('input');
    search.type = 'text';
    search.className = 'pp-search';
    search.placeholder = '搜索姓名 / 拼音 / 电话…';
    wrap.appendChild(search);

    const list = document.createElement('div');
    list.className = 'pp-list';
    wrap.appendChild(list);

    function refresh() {
      const q = search.value;
      list.innerHTML = '';
      const filtered = persons.filter(p => Utils.matchPerson(q, p));

      if (opts.groupByTeam) {
        // 按班组分组
        const groups = {};
        filtered.forEach(p => {
          const t = p.team || '未分组';
          (groups[t] = groups[t] || []).push(p);
        });
        Object.keys(groups).sort().forEach(team => {
          const gTitle = document.createElement('div');
          gTitle.className = 'pp-group';
          gTitle.textContent = `${team}（${groups[team].length}人）`;
          list.appendChild(gTitle);
          groups[team].forEach(p => list.appendChild(makeItem(p, onPick)));
        });
      } else {
        filtered.forEach(p => list.appendChild(makeItem(p, onPick)));
      }
      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'pp-empty';
        empty.textContent = '无匹配人员';
        list.appendChild(empty);
      }
    }

    search.addEventListener('input', refresh);
    refresh();
    container.appendChild(wrap);
    return { refresh, setQuery: (q) => { search.value = q; refresh(); } };
  }

  function makeItem(p, onPick) {
    const item = document.createElement('div');
    item.className = 'pp-item';
    item.draggable = true;
    const nameEl = document.createElement('div');
    nameEl.className = 'pp-name';
    nameEl.textContent = p.name;
    const phoneEl = document.createElement('div');
    phoneEl.className = 'pp-phone';
    phoneEl.textContent = Utils.phoneText(p);
    const teamEl = p.team ? _tag(p.team) : null;
    item.appendChild(nameEl);
    item.appendChild(phoneEl);
    if (teamEl) item.appendChild(teamEl);

    item.addEventListener('dragstart', (e) => {
      _dragPayload = p;
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', JSON.stringify(p));
      item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => { item.classList.remove('dragging'); });
    item.addEventListener('click', () => { if (onPick) onPick(p); });
    return item;
  }
  function _tag(txt) {
    const s = document.createElement('span');
    s.className = 'pp-tag';
    s.textContent = txt;
    return s;
  }

  /** 让一个单元格支持拖放 + 点击粘贴 + 右键清除
   * @param el 单元格 DOM
   * @param {object} opts { onDrop(p, el), onClear(el), getPayload() }
   */
  function makeDroppable(el, opts) {
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      el.classList.add('drop-target');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drop-target'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drop-target');
      let p = _dragPayload;
      if (!p) {
        try { p = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (err) { p = null; }
      }
      if (p && opts.onDrop) opts.onDrop(p, el);
    });
    // 右键清除
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (opts.onClear) opts.onClear(el);
    });
  }

  /** 读取剪贴板中的纯文本（用于单元格粘贴） */
  function readClipboard(cb) {
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(cb).catch(() => cb(''));
    } else {
      cb('');
    }
  }
  function writeClipboard(text, cb) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(cb || (() => {})).catch(() => {});
    }
  }

  /* ---------- 编组管理（普通用户自定义备选人员栏） ---------- */
  /**
   * 打开编组管理弹窗
   * @param userId 当前用户 id
   * @param departmentName 所属部门（用于筛选候选人）
   * @param onChanged 编组变化后回调
   */
  function groupManager(userId, departmentName, onChanged) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal" style="width:640px">
      <div class="modal-title">编组管理（自定义备选人员栏）</div>
      <div class="gm-new">
        <input id="gm-name" class="inp" placeholder="新编组名称，如：一部班长+工程师">
        <button id="gm-add" class="btn btn-primary">＋ 新建编组</button>
      </div>
      <div id="gm-list" class="gm-list"></div>
      <div class="modal-actions"><button id="gm-close" class="btn">关闭</button></div>
    </div>`;
    document.body.appendChild(overlay);

    const allPeople = Store.listPersonnel().filter(p => p.department === departmentName);
    function refresh() {
      const groups = Store.listGroups(userId);
      const listEl = overlay.querySelector('#gm-list');
      listEl.innerHTML = '';
      if (groups.length === 0) {
        listEl.innerHTML = '<div class="muted" style="padding:12px">还没有编组，点击「新建编组」创建一个。</div>';
      }
      groups.forEach(g => {
        const row = document.createElement('div');
        row.className = 'gm-row';
        const info = document.createElement('div');
        info.className = 'gm-info';
        const nameEl = document.createElement('div');
        nameEl.className = 'gm-name';
        nameEl.textContent = g.name;
        const cnt = document.createElement('div');
        cnt.className = 'gm-cnt';
        cnt.textContent = `${(g.personIds || []).length} 人`;
        info.appendChild(nameEl); info.appendChild(cnt);
        const btns = document.createElement('div');
        btns.innerHTML = `<button class="btn btn-sm" data-edit="${g.id}">编辑成员</button> <button class="btn btn-sm btn-danger" data-del="${g.id}">删除</button>`;
        row.appendChild(info); row.appendChild(btns);
        listEl.appendChild(row);
      });
    }

    overlay.querySelector('#gm-add').addEventListener('click', () => {
      const name = overlay.querySelector('#gm-name').value.trim();
      if (!name) { alert('请输入编组名称'); return; }
      Store.addGroup(userId, name, []);
      overlay.querySelector('#gm-name').value = '';
      refresh();
      if (onChanged) onChanged();
    });

    overlay.querySelector('#gm-list').addEventListener('click', (e) => {
      const editId = e.target.getAttribute('data-edit');
      const delId = e.target.getAttribute('data-del');
      if (delId) {
        if (!confirm('删除该编组？')) return;
        Store.removeGroup(userId, delId);
        refresh();
        if (onChanged) onChanged();
        return;
      }
      if (editId) { openEditGroup(editId); }
    });

    function openEditGroup(groupId) {
      const g = Store.listGroups(userId).find(x => x.id === groupId);
      if (!g) return;
      const editOverlay = document.createElement('div');
      editOverlay.className = 'modal-overlay';
      editOverlay.innerHTML = `<div class="modal" style="width:640px">
        <div class="modal-title">编辑编组：${esc(g.name)}</div>
        <input id="eg-search" class="inp" placeholder="搜索 姓名/拼音/电话…" style="width:100%;margin-bottom:8px">
        <div class="eg-body">${allPeople.map(p => `
          <label class="eg-item">
            <input type="checkbox" value="${p.id}" ${(g.personIds || []).includes(p.id) ? 'checked' : ''}>
            <span class="eg-name">${esc(p.name)}</span>
            <span class="eg-phone">${esc(Utils.phoneText(p))}</span>
            <span class="eg-tag">${esc(p.team)}</span>
          </label>`).join('')}</div>
        <div class="modal-actions">
          <button id="eg-cancel" class="btn">取消</button>
          <button id="eg-save" class="btn btn-primary">保存</button>
        </div>
      </div>`;
      document.body.appendChild(editOverlay);

      function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
      // 搜索过滤
      editOverlay.querySelector('#eg-search').addEventListener('input', (e) => {
        const q = e.target.value;
        editOverlay.querySelectorAll('.eg-item').forEach(it => {
          const name = it.querySelector('.eg-name').textContent;
          const phone = it.querySelector('.eg-phone').textContent;
          const team = it.querySelector('.eg-tag').textContent;
          const show = Utils.matchPerson(q, { name, phone, team });
          it.style.display = show ? '' : 'none';
        });
      });
      editOverlay.querySelector('#eg-cancel').addEventListener('click', () => editOverlay.remove());
      editOverlay.querySelector('#eg-save').addEventListener('click', () => {
        const ids = Array.from(editOverlay.querySelectorAll('.eg-item input:checked')).map(i => i.value);
        Store.updateGroup(userId, groupId, { personIds: ids });
        editOverlay.remove();
        refresh();
        if (onChanged) onChanged();
      });
    }

    overlay.querySelector('#gm-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    refresh();
    return overlay;
  }

  return {
    renderPersonPanel, makeDroppable, readClipboard, writeClipboard,
    getDragPayload: () => _dragPayload,
    groupManager,
  };
})();
