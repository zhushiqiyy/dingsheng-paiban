/* ============================================================
 * 数据层：localStorage 持久化 + 用户鉴权
 * ============================================================ */
window.Store = (function () {

  const KEY = 'dingsheng_schedule_v1';

  function defaultData() {
    return {
      users: [
        {
          id: 'admin',
          username: 'admin',
          password: Utils.hashPassword('admin123'),
          role: 'admin',
          name: '系统管理员',
          department: '',
          createdAt: Date.now(),
        },
      ],
      personnel: [],        // {id, name, phone(长号), shortPhone(短号), team(二级部门/班组), department(一级部门/项目部)}
      leaderIds: [],        // 一级值班候选人员（干部/领导）id 列表，管理员维护
      groups: {},           // 编组：{ userId: [ {id, name, personIds:[]} ] }
      bundles: {},          // 组合/捆绑：{ userId: [ {id, name, personIds:[]（有序）} ] }
      coMemory: {},         // 相邻人员共现记忆：{ "personId|personId": count }
      cellCoMemory: {},     // 同一格子（同天同班组）多人组合频次：{ "personId|personId|...": count }
      useCounts: {},        // 人员使用频次（被拖入排班的次数）：{ personId: count }
      holidayData: {},      // 从万年历刷新来的节假日数据：{ year: {holidays:[{name,start,end}], makeupWorkdays:[[m,d]]} }
      settings: { editPassword: 'admin123' },  // 人员编辑二次确认密码
      submit: {},           // 提交状态：{ s1:{submitted,at}, s2:{deptId:{...}}, s3:{...}, s4:{...} }
      // 排班数据
      schedules: {
        s1: null,   // 一级值班：{year, month, assignments:{day:[{name,phone,...},...]（0-2人，法定假日可2人）}, tags:{day:'全天'|'晚'}, note, maker, reviewer, approver, publishDept, publisher, publishDate}
        s2: {},     // 二级值班：{ deptId: {year, month, assignments, tags, note, approver, maker, publishDate} }
        s3: {},     // 班组值班：{ deptId: {year, month, cells: {date: {teamName: [{name,phone},...]（1-3人）}} } }
        s4: null,   // 节假日值班：{year, holidayName, dates:[...], sheets: {...} }
      },
      // 继承记忆（上次输入）
      lastInput: {
        s1: { maker: CONFIG.SCHEDULE1_DEFAULTS.maker, reviewer: CONFIG.SCHEDULE1_DEFAULTS.reviewer, approver: CONFIG.SCHEDULE1_DEFAULTS.approver, publisher: CONFIG.SCHEDULE1_DEFAULTS.publisher, publishDept: CONFIG.SCHEDULE1_DEFAULTS.publishDept },
        s2: {},  // deptId -> {approver, maker, publisher}
        s3: {},
      },
      session: { userId: null },
    };
  }

  let _data = null;
  function load() {
    if (_data) return _data;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        _data = JSON.parse(raw);
        // 补齐缺失字段
        const def = defaultData();
        for (const k in def) {
          if (!(k in _data)) _data[k] = def[k];
        }
      } else {
        _data = defaultData();
      }
    } catch (e) {
      _data = defaultData();
    }
    save();
    return _data;
  }

  function save() {
    if (_data) {
      localStorage.setItem(KEY, JSON.stringify(_data));
      // 已连接云则触发自动上传（防抖，fire-and-forget）
      if (window.CloudSync && CloudSync.isEnabled()) CloudSync.notifyLocalChange();
    }
  }

  /** 从云端载入整份数据（不走 save，避免触发回传） */
  function loadFromCloud(obj) {
    _data = obj;
    if (_data) localStorage.setItem(KEY, JSON.stringify(_data));
  }

  function get() { return load(); }
  function set(key, val) { const d = load(); d[key] = val; save(); }

  /* ---------- 用户 ---------- */
  function currentUser() {
    const d = load();
    const sid = d.session && d.session.userId;
    if (!sid) return null;
    return d.users.find(u => u.id === sid) || null;
  }
  function login(username, password) {
    const d = load();
    const u = d.users.find(x => x.username === username.trim());
    if (!u) return { ok: false, msg: '账号不存在' };
    if (u.password !== Utils.hashPassword(password)) return { ok: false, msg: '密码错误' };
    d.session = { userId: u.id };
    save();
    return { ok: true, user: u };
  }
  function logout() {
    const d = load();
    d.session = { userId: null };
    save();
  }
  function register(username, password, name, department) {
    const d = load();
    username = (username || '').trim();
    if (!username || !password) return { ok: false, msg: '用户名和密码不能为空' };
    if (username === 'admin') return { ok: false, msg: '该用户名不可用' };
    if (d.users.some(x => x.username === username)) return { ok: false, msg: '用户名已存在' };
    const u = {
      id: Utils.uid(),
      username,
      password: Utils.hashPassword(password),
      role: 'user',
      name: name || username,
      department: department || '',
      createdAt: Date.now(),
    };
    d.users.push(u);
    save();
    return { ok: true, user: u };
  }
  function deleteAccount(userId) {
    const d = load();
    const u = d.users.find(x => x.id === userId);
    if (!u || u.role === 'admin') return { ok: false, msg: '管理员账号不可注销' };
    d.users = d.users.filter(x => x.id !== userId);
    if (d.session && d.session.userId === userId) d.session.userId = null;
    save();
    return { ok: true };
  }
  function changePassword(userId, oldPw, newPw) {
    const d = load();
    const u = d.users.find(x => x.id === userId);
    if (!u) return { ok: false, msg: '用户不存在' };
    if (u.password !== Utils.hashPassword(oldPw)) return { ok: false, msg: '原密码错误' };
    u.password = Utils.hashPassword(newPw);
    save();
    return { ok: true };
  }
  function listUsers() {
    return load().users;
  }
  function resetUserPassword(userId, newPw) {
    const d = load();
    const u = d.users.find(x => x.id === userId);
    if (!u) return { ok: false, msg: '用户不存在' };
    u.password = Utils.hashPassword(newPw);
    save();
    return { ok: true };
  }
  function deleteUser(userId) {
    const d = load();
    d.users = d.users.filter(x => x.id !== userId);
    save();
    return { ok: true };
  }

  /* ---------- 人员 ---------- */
  function listPersonnel() {
    return load().personnel;
  }
  function addPerson(person) {
    const d = load();
    const p = { id: Utils.uid(), name: '', phone: '', shortPhone: '', team: '', department: '', ...person };
    d.personnel.push(p);
    save();
    return p;
  }
  function updatePerson(id, patch) {
    const d = load();
    const p = d.personnel.find(x => x.id === id);
    if (p) { Object.assign(p, patch); save(); }
    return p;
  }
  function removePerson(id) {
    const d = load();
    d.personnel = d.personnel.filter(x => x.id !== id);
    // 同时从所有编组中移除
    for (const uid in d.groups) {
      d.groups[uid] = (d.groups[uid] || []).map(g => ({ ...g, personIds: g.personIds.filter(pid => pid !== id) }));
    }
    save();
  }
  function importPersonnel(rows) {
    // rows: [{name, phone, shortPhone, team, department}]
    const d = load();
    let added = 0;
    for (const r of rows) {
      const name = (r.name || '').trim();
      const phone = (r.phone || '').trim();
      const shortPhone = (r.shortPhone || '').trim();
      if (!name && !phone && !shortPhone) continue;
      d.personnel.push({
        id: Utils.uid(), name, phone, shortPhone,
        team: (r.team || '').trim(), department: (r.department || '').trim(),
      });
      added++;
    }
    save();
    return added;
  }

  /* ---------- 编组（普通用户自定义备选人员栏） ---------- */
  function listGroups(userId) {
    return (load().groups || {})[userId] || [];
  }
  function addGroup(userId, name, personIds) {
    const d = load();
    d.groups = d.groups || {};
    d.groups[userId] = d.groups[userId] || [];
    const g = { id: Utils.uid(), name: name || '未命名编组', personIds: personIds || [] };
    d.groups[userId].push(g);
    save();
    return g;
  }
  function updateGroup(userId, groupId, patch) {
    const d = load();
    const g = ((d.groups || {})[userId] || []).find(x => x.id === groupId);
    if (g) { Object.assign(g, patch); save(); }
    return g;
  }
  function removeGroup(userId, groupId) {
    const d = load();
    if (d.groups && d.groups[userId]) {
      d.groups[userId] = d.groups[userId].filter(x => x.id !== groupId);
    }
    save();
  }
  /** 按编组 id 取人员列表 */
  function groupPersons(userId, groupId) {
    const g = listGroups(userId).find(x => x.id === groupId);
    if (!g) return [];
    const all = load().personnel;
    return g.personIds.map(id => all.find(p => p.id === id)).filter(Boolean);
  }

  /* ---------- 组合/捆绑（有序，可一起拖入） ---------- */
  function listBundles(userId) {
    return (load().bundles || {})[userId] || [];
  }
  function addBundle(userId, name, personIds) {
    const d = load();
    d.bundles = d.bundles || {};
    d.bundles[userId] = d.bundles[userId] || [];
    const b = { id: Utils.uid(), name: name || '组合', personIds: personIds || [] };
    d.bundles[userId].push(b);
    save();
    return b;
  }
  function updateBundle(userId, bundleId, patch) {
    const d = load();
    const b = ((d.bundles || {})[userId] || []).find(x => x.id === bundleId);
    if (b) { Object.assign(b, patch); save(); }
    return b;
  }
  function removeBundle(userId, bundleId) {
    const d = load();
    if (d.bundles && d.bundles[userId]) {
      d.bundles[userId] = d.bundles[userId].filter(x => x.id !== bundleId);
    }
    save();
  }
  function bundlePersons(userId, bundleId) {
    const b = listBundles(userId).find(x => x.id === bundleId);
    if (!b) return [];
    const all = load().personnel;
    return b.personIds.map(id => all.find(p => p.id === id)).filter(Boolean);
  }

  /* ---------- 相邻人员共现记忆 ---------- */
  /** 记录一组相邻值班人员（按日期顺序），用于智能记忆 */
  function recordCoMemory(orderedPersons) {
    const d = load();
    d.coMemory = d.coMemory || {};
    const ids = orderedPersons.filter(p => p && p.id).map(p => p.id);
    for (let i = 0; i < ids.length - 1; i++) {
      const key = [ids[i], ids[i + 1]].sort().join('|');
      d.coMemory[key] = (d.coMemory[key] || 0) + 1;
    }
    save();
  }

  /* ---------- 同一格子多人组合频次（右侧智能组合推荐） ---------- */
  /** 记录一个格子（同天同班组多人）的组合 */
  function recordCellCoMemory(cellPersons) {
    const ids = (cellPersons || []).filter(p => p && p.id).map(p => p.id);
    if (ids.length < 2) return;
    const d = load();
    d.cellCoMemory = d.cellCoMemory || {};
    const key = ids.slice().sort().join('|');
    d.cellCoMemory[key] = (d.cellCoMemory[key] || 0) + 1;
    save();
  }
  /** 返回同一格子多人组合的推荐（top N） */
  function suggestCellBundles(departmentName, topN) {
    const d = load();
    const all = load().personnel;
    const entries = Object.entries(d.cellCoMemory || {})
      .map(([k, c]) => ({ ids: k.split('|'), c }))
      .filter(e => e.ids.length >= 2)
      .sort((a, b) => b.c - a.c)
      .slice(0, topN || 9);
    const result = [];
    for (const e of entries) {
      const persons = e.ids.map(id => all.find(p => p.id === id)).filter(Boolean);
      if (persons.length < 2) continue;
      if (departmentName && persons.some(p => p.department !== departmentName)) continue;
      result.push({ name: persons.map(p => p.name).join('+'), personIds: e.ids, count: e.c });
    }
    return result;
  }

  /* ---------- 人员使用频次（备选人员排序） ---------- */
  /** 记录一次人员被拖入排班 */
  function recordUseCount(personId) {
    if (!personId) return;
    const d = load();
    d.useCounts = d.useCounts || {};
    d.useCounts[personId] = (d.useCounts[personId] || 0) + 1;
    save();
  }
  /** 取某人员被使用次数 */
  function useCountOf(personId) {
    const d = load();
    return (d.useCounts || {})[personId] || 0;
  }

  /* ---------- 节假日数据（万年历刷新） ---------- */
  /** 取某年节假日数据：优先用刷新过的自定义数据，否则用 CONFIG 内置 */
  function getHolidayData(year) {
    const d = load();
    const custom = (d.holidayData || {})[year];
    if (custom && custom.holidays && custom.holidays.length) return custom;
    return CONFIG.HOLIDAYS[year] || { holidays: [], makeupWorkdays: [] };
  }
  /** 保存某年从万年历刷新来的节假日数据 */
  function setHolidayData(year, data) {
    const d = load();
    d.holidayData = d.holidayData || {};
    d.holidayData[year] = data;
    save();
  }
  /** 根据共现记忆，返回频繁组合的建议（top N 对） */
  function suggestBundles(userId, departmentName, topN) {
    const d = load();
    const all = load().personnel;
    const entries = Object.entries(d.coMemory || {})
      .map(([k, c]) => ({ ids: k.split('|'), c }))
      .filter(e => e.c >= 2)
      .sort((a, b) => b.c - a.c)
      .slice(0, topN || 5);
    const result = [];
    for (const e of entries) {
      const persons = e.ids.map(id => all.find(p => p.id === id)).filter(Boolean);
      if (persons.length < 2) continue;
      if (departmentName && persons.some(p => p.department !== departmentName)) continue;
      result.push({ name: persons.map(p => p.name).join('+'), personIds: e.ids, count: e.c });
    }
    return result;
  }

  /* ---------- 设置 ---------- */
  function getSettings() {
    return load().settings || {};
  }
  function updateSettings(patch) {
    const d = load();
    d.settings = { ...(d.settings || {}), ...patch };
    save();
    return d.settings;
  }

  /* ---------- 一级值班候选人员（干部/领导，管理员维护） ---------- */
  function getLeaderIds() {
    return load().leaderIds || [];
  }
  function setLeaderIds(ids) {
    const d = load();
    d.leaderIds = ids || [];
    save();
  }
  function leaderPersons() {
    const ids = getLeaderIds();
    const all = load().personnel;
    return ids.map(id => all.find(p => p.id === id)).filter(Boolean);
  }

  /* ---------- 提交状态 ---------- */
  function getSubmit(section, deptId) {
    const s = load().submit || {};
    if (section === 's1') return s.s1 || null;
    if (section === 's2') return (s.s2 || {})[deptId || ''] || null;
    if (section === 's3') return (s.s3 || {})[deptId || ''] || null;
    if (section === 's4') return s.s4 || null;
    return null;
  }
  function setSubmit(section, deptId, submitted) {
    const d = load();
    d.submit = d.submit || {};
    const rec = { submitted: !!submitted, at: submitted ? Date.now() : null };
    if (section === 's1') d.submit.s1 = rec;
    else if (section === 's2') { d.submit.s2 = d.submit.s2 || {}; d.submit.s2[deptId || ''] = rec; }
    else if (section === 's3') { d.submit.s3 = d.submit.s3 || {}; d.submit.s3[deptId || ''] = rec; }
    else if (section === 's4') d.submit.s4 = rec;
    save();
    return rec;
  }

  /* ---------- 班组 ---------- */
  // 返回某部门的班组列表（合并种子 + 人员中出现的班组）
  function teamsOf(deptName) {
    const seed = (window.__TEAMS_SEED__ && window.__TEAMS_SEED__[deptName]) || [];
    const custom = new Set();
    for (const p of load().personnel) {
      if (p.department === deptName && p.team) custom.add(p.team);
    }
    const list = [];
    for (const t of seed) list.push({ name: t.name, phone: t.phone, area: t.area || '', zone: t.zone || '' });
    for (const c of custom) {
      if (!list.some(t => t.name === c)) list.push({ name: c, phone: '', area: '', zone: '' });
    }
    return list;
  }
  // 全部部门名（用于下拉等）
  function allDepartmentNames() {
    return CONFIG.DEPARTMENTS.map(d => d.name);
  }

  /* ---------- 排班 ---------- */
  function getS1() { return load().schedules.s1; }
  function setS1(s1) { const d = load(); d.schedules.s1 = s1; save(); }
  function getS2(deptId) { return (load().schedules.s2 || {})[deptId] || null; }
  function setS2(deptId, data) { const d = load(); d.schedules.s2 = d.schedules.s2 || {}; d.schedules.s2[deptId] = data; save(); }
  function getS3(deptId) { return (load().schedules.s3 || {})[deptId] || null; }
  function setS3(deptId, data) { const d = load(); d.schedules.s3 = d.schedules.s3 || {}; d.schedules.s3[deptId] = data; save(); }
  function getS4() { return load().schedules.s4; }
  function setS4(s4) { const d = load(); d.schedules.s4 = s4; save(); }

  function getLastInput(section, deptId) {
    const li = load().lastInput || {};
    if (section === 's1') return li.s1 || {};
    if (section === 's2') return (li.s2 || {})[deptId || ''] || {};
    return {};
  }
  function setLastInput(section, deptId, patch) {
    const d = load();
    d.lastInput = d.lastInput || {};
    if (section === 's1') {
      d.lastInput.s1 = { ...(d.lastInput.s1 || {}), ...patch };
    } else if (section === 's2') {
      d.lastInput.s2 = d.lastInput.s2 || {};
      d.lastInput.s2[deptId || ''] = { ...(d.lastInput.s2[deptId || ''] || {}), ...patch };
    }
    save();
  }

  /* ---------- 数据导出/导入（全量备份） ---------- */
  function exportAll() {
    return JSON.stringify(load(), null, 2);
  }
  function importAll(json) {
    const obj = JSON.parse(json);
    _data = obj;
    save();
    return true;
  }
  function clearAll() {
    _data = defaultData();
    save();
  }

  return {
    load, save, get, set,
    currentUser, login, logout, register, deleteAccount, changePassword,
    listUsers, resetUserPassword, deleteUser,
    listPersonnel, addPerson, updatePerson, removePerson, importPersonnel,
    teamsOf, allDepartmentNames,
    listGroups, addGroup, updateGroup, removeGroup, groupPersons,
    listBundles, addBundle, updateBundle, removeBundle, bundlePersons,
    recordCoMemory, suggestBundles,
    recordCellCoMemory, suggestCellBundles,
    recordUseCount, useCountOf,
    getHolidayData, setHolidayData,
    getSettings, updateSettings,
    getLeaderIds, setLeaderIds, leaderPersons,
    getSubmit, setSubmit,
    getS1, setS1, getS2, setS2, getS3, setS3, getS4, setS4,
    getLastInput, setLastInput,
    exportAll, importAll, clearAll, loadFromCloud,
  };
})();
