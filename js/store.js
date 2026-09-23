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
      personnel: [],        // {id, name, phone, team, department}
      // 排班数据
      schedules: {
        s1: null,   // 一级值班：{year, month, assignments:{day:{name,phone}}, tags:{day:'全天'|'晚'}, note, maker, reviewer, approver, publishDept, publisher, publishDate}
        s2: {},     // 二级值班：{ deptId: {year, month, assignments, tags, note, approver, maker, publishDate} }
        s3: {},     // 班组值班：{ deptId: {year, month, cells: {date: {teamName: {name,phone}}} } }
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
    const p = { id: Utils.uid(), name: '', phone: '', team: '', department: '', ...person };
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
    save();
  }
  function importPersonnel(rows) {
    // rows: [{name, phone, team, department}]
    const d = load();
    let added = 0;
    for (const r of rows) {
      const name = (r.name || '').trim();
      const phone = (r.phone || '').trim();
      if (!name && !phone) continue;
      d.personnel.push({ id: Utils.uid(), name, phone, team: (r.team || '').trim(), department: (r.department || '').trim() });
      added++;
    }
    save();
    return added;
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
    for (const t of seed) list.push({ name: t.name, phone: t.phone, area: t.area || '' });
    for (const c of custom) {
      if (!list.some(t => t.name === c)) list.push({ name: c, phone: '', area: '' });
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
    getS1, setS1, getS2, setS2, getS3, setS3, getS4, setS4,
    getLastInput, setLastInput,
    exportAll, importAll, clearAll,
  };
})();
