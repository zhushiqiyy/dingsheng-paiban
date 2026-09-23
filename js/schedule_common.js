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
    phoneEl.textContent = p.phone || '';
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

  return {
    renderPersonPanel, makeDroppable, readClipboard, writeClipboard,
    getDragPayload: () => _dragPayload,
  };
})();
