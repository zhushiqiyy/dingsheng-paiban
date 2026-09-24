/* ============================================================
 * 共享排班组件：人员检索面板 + 拖拽放置
 * ============================================================ */
window.Schedule = (function () {

  /** 拖拽中的 payload */
  let _dragPayload = null;

  /** 渲染左侧候选人面板（可搜索、可拖拽、可按组织关系筛选/分组）
   * @param container DOM
   * @param {array} persons 候选人员（可含 team 字段）
   * @param {object} opts { groupByTeam:boolean, teams:array（可选的组织关系筛选列表） }
   * @param {function} onPick(p) 点击选中回调
   */
  function renderPersonPanel(container, persons, opts, onPick) {
    opts = opts || {};
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'pp-panel';

    // 组织关系筛选（先筛班组，减少显示）
    let teamFilter = 'all';
    const teamOptions = opts.teams || Array.from(new Set(persons.map(p => p.team).filter(Boolean)));
    const teamSel = document.createElement('select');
    teamSel.className = 'pp-team';
    teamSel.innerHTML = `<option value="all">全部组织（${persons.length}人）</option>` +
      teamOptions.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
    wrap.appendChild(teamSel);

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
      let filtered = persons.filter(p => Utils.matchPerson(q, p));
      if (teamFilter !== 'all') filtered = filtered.filter(p => (p.team || '') === teamFilter);

      // 按使用频次降序排序（被拖入次数多的排前面，方便选择；频次相同保持原顺序）
      filtered = filtered.slice().sort((a, b) => (Store.useCountOf(b.id) || 0) - (Store.useCountOf(a.id) || 0));

      if (opts.groupByTeam && teamFilter === 'all') {
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
        empty.textContent = opts.emptyText || '无匹配人员';
        list.appendChild(empty);
      }
    }

    teamSel.addEventListener('change', () => { teamFilter = teamSel.value; refresh(); });
    search.addEventListener('input', refresh);
    refresh();
    container.appendChild(wrap);
    return { refresh, setQuery: (q) => { search.value = q; refresh(); } };
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

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

  /* ---------- 组合/捆绑（有序多人一起拖入） ---------- */
  function makeBundleItem(persons, label, sub, onPick) {
    const item = document.createElement('div');
    item.className = 'pp-item bundle-item';
    item.draggable = true;
    const nameEl = document.createElement('div');
    nameEl.className = 'pp-name';
    nameEl.textContent = label;
    const descEl = document.createElement('div');
    descEl.className = 'pp-phone';
    descEl.textContent = sub || persons.map(p => p.name).join(' → ');
    item.appendChild(nameEl);
    item.appendChild(descEl);
    const payload = { bundle: true, persons: persons };
    item.addEventListener('dragstart', (e) => {
      _dragPayload = payload;
      e.dataTransfer.effectAllowed = 'copy';
      try { e.dataTransfer.setData('text/plain', JSON.stringify(payload)); } catch (err) {}
      item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => item.classList.remove('dragging'));
    item.addEventListener('click', () => { if (onPick) onPick(persons); });
    return item;
  }

  /**
   * 右侧功能栏：组合拖入（智能建议 + 我的组合 + 新建）
   * @param container DOM
   * @param {object} cfg { userId, departmentName, onBundleDrop(persons), onManage() }
   */
  function bundlePanel(container, cfg) {
    container.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'bundle-panel';

    const title = document.createElement('div');
    title.className = 'bundle-title';
    title.textContent = '组合拖入';
    panel.appendChild(title);

    // 智能建议（相邻共现记忆）
    const sugHead = document.createElement('div');
    sugHead.className = 'bundle-sub';
    sugHead.textContent = '📌 智能建议（相邻常配）';
    panel.appendChild(sugHead);
    const suggestions = Store.suggestBundles(cfg.userId, cfg.departmentName, 5);
    if (suggestions.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'bundle-hint';
      hint.textContent = '暂无建议。完成排班保存后，系统会学习相邻值班人员，自动给出组合建议。';
      panel.appendChild(hint);
    }
    const allPeople = Store.listPersonnel();
    suggestions.forEach(s => {
      const persons = s.personIds.map(id => allPeople.find(p => p.id === id)).filter(Boolean);
      panel.appendChild(makeBundleItem(persons, s.name, `相邻搭配 ×${s.count}`, cfg.onBundleDrop));
    });

    // 我的组合
    const myHead = document.createElement('div');
    myHead.className = 'bundle-sub';
    myHead.textContent = '🧩 我的组合';
    panel.appendChild(myHead);
    const bundles = Store.listBundles(cfg.userId);
    if (bundles.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'bundle-hint';
      hint.textContent = '还没有组合，点击下方「新建组合」。';
      panel.appendChild(hint);
    }
    bundles.forEach(b => {
      const persons = b.personIds.map(id => allPeople.find(p => p.id === id)).filter(Boolean);
      panel.appendChild(makeBundleItem(persons, b.name, persons.map(p => p.name).join(' → '), cfg.onBundleDrop));
    });

    // 新建组合按钮
    const btn = document.createElement('button');
    btn.className = 'btn btn-block';
    btn.textContent = '＋ 新建组合';
    btn.addEventListener('click', () => cfg.onManage());
    panel.appendChild(btn);

    container.appendChild(panel);
    return panel;
  }

  /** 组合编辑弹窗（新建/编辑有序组合） */
  function bundleEditor(userId, departmentName, onChanged) {
    const allPeople = Store.listPersonnel().filter(p => p.department === departmentName);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal" style="width:640px">
      <div class="modal-title">新建组合（按顺序拖入，可多人）</div>
      <div class="gm-new"><input id="be-name" class="inp" placeholder="组合名称，如：1号-2号-3号"></div>
      <input id="be-search" class="inp" placeholder="搜索 姓名/拼音/电话…" style="width:100%;margin-bottom:6px">
      <div class="be-body"></div>
      <div class="modal-actions">
        <button id="be-cancel" class="btn">取消</button>
        <button id="be-save" class="btn btn-primary">保存组合</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);

    let selected = []; // 有序 person id 列表
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
    function renderSelected() {
      const box = overlay.querySelector('.be-selected');
      if (!box) return;
      box.innerHTML = selected.map((id, i) => {
        const p = allPeople.find(x => x.id === id);
        return `<span class="be-chip">${i + 1}.${esc(p ? p.name : '')}<b data-rm="${id}">×</b></span>`;
      }).join('');
      box.querySelectorAll('b[data-rm]').forEach(b => b.addEventListener('click', () => {
        selected = selected.filter(id => id !== b.getAttribute('data-rm'));
        renderSelected();
      }));
    }
    // 选中栏
    const selDiv = document.createElement('div');
    selDiv.className = 'be-selected';
    overlay.querySelector('.be-body').appendChild(selDiv);
    // 人员列表
    const listDiv = document.createElement('div');
    listDiv.className = 'be-list';
    overlay.querySelector('.be-body').appendChild(listDiv);
    function renderList(q) {
      listDiv.innerHTML = '';
      allPeople.filter(p => Utils.matchPerson(q, p)).slice(0, 200).forEach(p => {
        const it = document.createElement('div');
        it.className = 'pp-item';
        it.innerHTML = `<div class="pp-name">${esc(p.name)}</div><div class="pp-phone">${esc(Utils.phoneText(p))}</div>${p.team ? `<span class="pp-tag">${esc(p.team)}</span>` : ''}`;
        it.addEventListener('click', () => { if (!selected.includes(p.id)) { selected.push(p.id); renderSelected(); } });
        listDiv.appendChild(it);
      });
    }
    renderList('');
    overlay.querySelector('#be-search').addEventListener('input', (e) => renderList(e.target.value));
    overlay.querySelector('#be-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#be-save').addEventListener('click', () => {
      const name = overlay.querySelector('#be-name').value.trim() || ('组合' + (Store.listBundles(userId).length + 1));
      if (selected.length < 2) { alert('请至少选择 2 人组成组合'); return; }
      Store.addBundle(userId, name, selected);
      overlay.remove();
      if (onChanged) onChanged();
    });
    return overlay;
  }

  /**
   * 组合构建区（左侧内联）：拖入人员到「我的组合」→ 命名 → 创建，无需弹窗
   * @param container DOM
   * @param {object} cfg { userId, departmentName, onBundleDrop(persons), onChanged() }
   */
  function bundleBuilder(container, cfg) {
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'bundle-builder';

    const head = document.createElement('div');
    head.className = 'bundle-sub';
    head.textContent = '🧩 我的组合（拖人进来 → 创建）';
    wrap.appendChild(head);

    // 待创建组合区（可拖入人员）
    const drop = document.createElement('div');
    drop.className = 'bb-drop';
    drop.textContent = '把人员拖到这里，组成有序组合';
    wrap.appendChild(drop);
    const pending = [];
    const pendingBox = document.createElement('div');
    pendingBox.className = 'bb-pending';
    wrap.appendChild(pendingBox);

    function renderPending() {
      pendingBox.innerHTML = '';
      pending.forEach((p, i) => {
        const chip = document.createElement('span');
        chip.className = 'be-chip';
        chip.innerHTML = `${i + 1}.${esc(p.name)}<b data-i="${i}">×</b>`;
        pendingBox.appendChild(chip);
      });
      pendingBox.querySelectorAll('b[data-i]').forEach(b => b.addEventListener('click', () => {
        pending.splice(+b.getAttribute('data-i'), 1);
        renderPending();
      }));
    }
    Schedule.makeDroppable(drop, {
      onDrop(payload) {
        const persons = payload && payload.bundle ? payload.persons : (payload && payload.name ? [payload] : []);
        persons.forEach(p => { if (!pending.some(x => x.id === p.id)) pending.push(p); });
        renderPending();
      },
      onClear() { pending.pop(); renderPending(); },
    });

    // 名称 + 创建
    const nameRow = document.createElement('div');
    nameRow.className = 'bb-namerow';
    const nameInp = document.createElement('input');
    nameInp.className = 'inp';
    nameInp.placeholder = '组合名称（如：1号-2号-3号）';
    const createBtn = document.createElement('button');
    createBtn.className = 'btn btn-primary';
    createBtn.textContent = '创建组合';
    nameRow.appendChild(nameInp); nameRow.appendChild(createBtn);
    wrap.appendChild(nameRow);
    createBtn.addEventListener('click', () => {
      if (pending.length < 2) { alert('请先拖入至少 2 人组成组合'); return; }
      const name = nameInp.value.trim() || ('组合' + (Store.listBundles(cfg.userId).length + 1));
      Store.addBundle(cfg.userId, name, pending.map(p => p.id));
      pending.length = 0; nameInp.value = ''; renderPending();
      renderList();
      if (cfg.onChanged) cfg.onChanged();
    });

    // 已有组合列表（可拖出到排班表）
    const list = document.createElement('div');
    list.className = 'bb-list';
    wrap.appendChild(list);
    function renderList() {
      list.innerHTML = '';
      const bundles = Store.listBundles(cfg.userId);
      if (!bundles.length) {
        const hint = document.createElement('div');
        hint.className = 'bundle-hint';
        hint.textContent = '暂无组合。';
        list.appendChild(hint);
      }
      const all = Store.listPersonnel();
      bundles.forEach(b => {
        const persons = b.personIds.map(id => all.find(p => p.id === id)).filter(Boolean);
        const row = document.createElement('div');
        row.className = 'bb-row';
        const item = makeBundleItem(persons, b.name, persons.map(p => p.name).join(' → '), cfg.onBundleDrop);
        item.style.flex = '1';
        const del = document.createElement('span');
        del.className = 'bb-del';
        del.textContent = '✕';
        del.title = '删除组合';
        del.addEventListener('click', () => { Store.removeBundle(cfg.userId, b.id); renderList(); if (cfg.onChanged) cfg.onChanged(); });
        row.appendChild(item); row.appendChild(del);
        list.appendChild(row);
      });
    }
    renderList();

    container.appendChild(wrap);
    return { refresh: renderList, renderPending };
  }

  return {
    renderPersonPanel, makeDroppable, readClipboard, writeClipboard,
    getDragPayload: () => _dragPayload,
    groupManager, bundlePanel, bundleEditor, bundleBuilder, makeBundleItem,
  };
})();
