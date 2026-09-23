/* ============================================================
 * 主应用：初始化、路由、导航、登录注册、仪表盘
 * ============================================================ */
window.App = (function () {

  const views = {}; // name -> { title, icon, render, adminOnly }

  function register(name, cfg) { views[name] = cfg; }

  let _current = 'dashboard';

  function currentUser() { return Store.currentUser(); }
  function isAdmin() { const u = currentUser(); return u && u.role === 'admin'; }

  /* ---------- 导航 ---------- */
  function navigate(name) {
    _current = name;
    renderShell();
  }

  /* ---------- 根渲染 ---------- */
  function renderRoot() {
    const u = currentUser();
    const root = document.getElementById('app');
    if (!u) {
      root.innerHTML = '';
      root.appendChild(renderAuthScreen());
    } else {
      renderShell();
    }
  }

  /* ============================================================
   * 登录 / 注册
   * ============================================================ */
  function renderAuthScreen() {
    const wrap = document.createElement('div');
    wrap.className = 'auth-wrap';

    const card = document.createElement('div');
    card.className = 'auth-card';

    const logo = document.createElement('div');
    logo.className = 'auth-logo';
    logo.textContent = CONFIG.COMPANY.fullName;

    const sub = document.createElement('div');
    sub.className = 'auth-sub';
    sub.textContent = '排班管理系统';

    card.appendChild(logo);
    card.appendChild(sub);

    // 登录表单
    const form = document.createElement('div');
    form.className = 'auth-form';
    form.innerHTML = `
      <div class="field"><label>账号</label><input id="login-user" type="text" autocomplete="username" placeholder="请输入用户名"></div>
      <div class="field"><label>密码</label><input id="login-pass" type="password" autocomplete="current-password" placeholder="请输入密码"></div>
      <div id="login-err" class="auth-err"></div>
      <button id="login-btn" class="btn btn-primary btn-block">登 录</button>
      <div class="auth-links">
        <a id="go-register" href="javascript:;">注册普通用户</a>
        <span class="dot">·</span>
        <a id="show-hint" href="javascript:;">首次使用？</a>
      </div>
    `;
    card.appendChild(form);

    const hint = document.createElement('div');
    hint.className = 'auth-hint hidden';
    hint.innerHTML = `默认管理员账号：<b>admin</b>　密码：<b>admin123</b>（登录后请尽快修改）`;
    card.appendChild(hint);

    wrap.appendChild(card);

    // 事件
    setTimeout(() => {
      const doLogin = () => {
        const username = document.getElementById('login-user').value;
        const password = document.getElementById('login-pass').value;
        const r = Store.login(username, password);
        if (!r.ok) {
          document.getElementById('login-err').textContent = r.msg;
        } else {
          renderRoot();
        }
      };
      document.getElementById('login-btn').addEventListener('click', doLogin);
      document.getElementById('login-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
      document.getElementById('login-user').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('login-pass').focus(); });
      document.getElementById('go-register').addEventListener('click', () => { showRegister(card); });
      document.getElementById('show-hint').addEventListener('click', () => hint.classList.toggle('hidden'));
    }, 0);

    return wrap;
  }

  function showRegister(card) {
    // 替换为注册表单
    card.querySelector('.auth-sub').textContent = '注册普通用户账号';
    const form = card.querySelector('.auth-form');
    form.innerHTML = `
      <div class="field"><label>用户名</label><input id="reg-user" type="text" placeholder="登录账号（不可用 admin）"></div>
      <div class="field"><label>密码</label><input id="reg-pass" type="password" placeholder="设置密码"></div>
      <div class="field"><label>确认密码</label><input id="reg-pass2" type="password" placeholder="再次输入密码"></div>
      <div class="field"><label>姓名</label><input id="reg-name" type="text" placeholder="真实姓名"></div>
      <div class="field"><label>所属部门</label><select id="reg-dept">${deptOptions()}</select></div>
      <div id="login-err" class="auth-err"></div>
      <button id="reg-btn" class="btn btn-primary btn-block">注 册</button>
      <div class="auth-links"><a id="back-login" href="javascript:;">返回登录</a></div>
    `;
    setTimeout(() => {
      document.getElementById('reg-btn').addEventListener('click', () => {
        const username = document.getElementById('reg-user').value;
        const password = document.getElementById('reg-pass').value;
        const password2 = document.getElementById('reg-pass2').value;
        const name = document.getElementById('reg-name').value;
        const department = document.getElementById('reg-dept').value;
        const errEl = document.getElementById('login-err');
        if (password !== password2) { errEl.textContent = '两次密码不一致'; return; }
        const r = Store.register(username, password, name, department);
        if (!r.ok) { errEl.textContent = r.msg; return; }
        // 注册成功直接登录
        Store.login(username, password);
        renderRoot();
      });
      document.getElementById('back-login').addEventListener('click', () => renderRoot());
    }, 0);
  }

  function deptOptions(selected) {
    const opts = CONFIG.DEPARTMENTS.map(d => `<option value="${d.name}" ${selected === d.name ? 'selected' : ''}>${d.name}</option>`).join('');
    return `<option value="">请选择部门</option>` + opts;
  }

  /* ============================================================
   * 主界面框架
   * ============================================================ */
  function renderShell() {
    const root = document.getElementById('app');
    root.innerHTML = '';

    const u = currentUser();
    const admin = u.role === 'admin';

    // 顶栏
    const topbar = document.createElement('div');
    topbar.className = 'topbar';
    topbar.innerHTML = `
      <div class="topbar-left">
        <span class="brand">${CONFIG.COMPANY.shortName}排班系统</span>
      </div>
      <nav class="topnav" id="topnav"></nav>
      <div class="topbar-right">
        <span class="user-chip">${u.name || u.username}（${admin ? '管理员' : '普通用户' + (u.department ? '·' + u.department : '')}）</span>
        <button id="btn-account" class="btn btn-ghost">账号</button>
        <button id="btn-logout" class="btn btn-ghost">退出</button>
      </div>
    `;
    root.appendChild(topbar);

    // 导航项
    const nav = topbar.querySelector('#topnav');
    const navItems = [];
    if (admin) {
      navItems.push({ key: 'dashboard', label: '首页' });
      navItems.push({ key: 'personnel', label: '人员管理' });
      navItems.push({ key: 'users', label: '用户管理' });
      navItems.push({ key: 's1', label: '一级值班' });
      navItems.push({ key: 's2', label: '二级值班' });
      navItems.push({ key: 's3', label: '班组值班' });
      navItems.push({ key: 's4', label: '节假日值班' });
      navItems.push({ key: 'backup', label: '数据备份' });
    } else {
      navItems.push({ key: 'dashboard', label: '首页' });
      navItems.push({ key: 's2', label: '二级值班' });
      navItems.push({ key: 's3', label: '班组值班' });
      navItems.push({ key: 's4', label: '节假日值班' });
    }
    navItems.forEach(item => {
      const a = document.createElement('a');
      a.href = 'javascript:;';
      a.className = 'nav-link' + (_current === item.key ? ' active' : '');
      a.textContent = item.label;
      a.addEventListener('click', () => navigate(item.key));
      nav.appendChild(a);
    });

    // 内容区
    const main = document.createElement('main');
    main.className = 'main';
    main.id = 'main';
    root.appendChild(main);

    // 事件
    topbar.querySelector('#btn-logout').addEventListener('click', () => {
      // 登出为无损操作（数据均在本地），直接退出，避免 confirm 在 iframe 预览环境被拦截
      Store.logout();
      _current = 'dashboard';
      renderRoot();
    });
    topbar.querySelector('#btn-account').addEventListener('click', () => navigate('account'));

    // 渲染当前视图
    renderView(_current, main);
  }

  function renderView(name, main) {
    if (name === 'account') { renderAccount(main); return; }
    const v = views[name];
    if (!v) { renderDashboard(main); return; }
    if (v.adminOnly && !isAdmin()) { renderDashboard(main); return; }
    try {
      v.render(main);
    } catch (e) {
      console.error(e);
      main.innerHTML = `<div class="error-box">视图加载出错：${e.message}</div>`;
    }
  }

  /* ---------- 账号设置 ---------- */
  function renderAccount(main) {
    const u = currentUser();
    main.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-title">账号设置</div>
      <div class="account-info">
        <div><span>用户名：</span><b>${u.username}</b></div>
        <div><span>姓名：</span><b>${u.name || '-'}</b></div>
        <div><span>角色：</span><b>${u.role === 'admin' ? '管理员' : '普通用户'}</b></div>
        ${u.role !== 'admin' ? `<div><span>所属部门：</span><b>${u.department || '-'}</b></div>` : ''}
      </div>
      <div class="card-subtitle">修改密码</div>
      <div class="field-row">
        <input id="acc-old" type="password" placeholder="原密码">
        <input id="acc-new" type="password" placeholder="新密码">
        <button id="acc-save" class="btn btn-primary">修改密码</button>
      </div>
      ${u.role === 'admin' ? `
      <div class="card-subtitle">人员编辑确认密码（人员管理二次确认用，初始 admin123）</div>
      <div class="field-row">
        <input id="acc-epw" type="password" placeholder="新确认密码" value="${Store.getSettings().editPassword || ''}">
        <button id="acc-epw-save" class="btn">保存确认密码</button>
      </div>` : ''}
      ${u.role !== 'admin' ? `<div class="card-subtitle">注销账号</div><button id="acc-del" class="btn btn-danger">注销我的账号</button>` : ''}
    `;
    main.appendChild(card);

    card.querySelector('#acc-save').addEventListener('click', () => {
      const oldP = card.querySelector('#acc-old').value;
      const newP = card.querySelector('#acc-new').value;
      if (!newP) { alert('新密码不能为空'); return; }
      const r = Store.changePassword(u.id, oldP, newP);
      alert(r.ok ? '密码修改成功' : r.msg);
    });
    const epwBtn = card.querySelector('#acc-epw-save');
    if (epwBtn) {
      epwBtn.addEventListener('click', () => {
        const pw = card.querySelector('#acc-epw').value.trim();
        if (!pw) { alert('确认密码不能为空'); return; }
        Store.updateSettings({ editPassword: pw });
        alert('确认密码已更新');
      });
    }
    const delBtn = card.querySelector('#acc-del');
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        if (!confirm('确定注销账号？注销后无法登录，且不可恢复。')) return;
        const r = Store.deleteAccount(u.id);
        alert(r.msg || '已注销');
        renderRoot();
      });
    }
  }

  /* ---------- 仪表盘 ---------- */
  function renderDashboard(main) {
    const u = currentUser();
    const admin = u.role === 'admin';
    main.innerHTML = '';
    const h = document.createElement('div');
    h.className = 'dash-hero';
    h.innerHTML = `
      <div class="dash-title">欢迎使用 ${CONFIG.COMPANY.shortName}排班系统</div>
      <div class="dash-sub">今天是 ${new Date().getFullYear()} 年 ${new Date().getMonth() + 1} 月 ${new Date().getDate()} 日（${'星期' + CONFIG.WEEK_CN[new Date().getDay()]}）</div>
    `;
    main.appendChild(h);

    const grid = document.createElement('div');
    grid.className = 'dash-grid';
    const cards = [];
    if (admin) {
      cards.push({ key: 'personnel', title: '人员管理', desc: '导入/导出人员信息，维护班组与部门', icon: '👥' });
      cards.push({ key: 's1', title: '一级值班（干部值班表）', desc: '公司级干部值班 Word 排版', icon: '📋' });
    }
    cards.push({ key: 's2', title: '二级值班', desc: '各部门二级值班 Word 排版', icon: '📄' });
    cards.push({ key: 's3', title: '班组值班', desc: '班组夜间值班 Excel 排版', icon: '📊' });
    cards.push({ key: 's4', title: '节假日值班', desc: '法定节假日值班自动填充', icon: '🎉' });
    if (admin) {
      cards.push({ key: 'users', title: '用户管理', desc: '管理普通用户账号', icon: '🔑' });
      cards.push({ key: 'backup', title: '数据备份', desc: '全量数据导入/导出', icon: '💾' });
    }

    cards.forEach(c => {
      const el = document.createElement('div');
      el.className = 'dash-card';
      el.innerHTML = `<div class="dash-icon">${c.icon}</div><div class="dash-card-title">${c.title}</div><div class="dash-card-desc">${c.desc}</div>`;
      el.addEventListener('click', () => navigate(c.key));
      grid.appendChild(el);
    });
    main.appendChild(grid);
  }

  /* ---------- 初始化 ---------- */
  function init() {
    Store.load();
    renderRoot();
  }

  return {
    init, navigate, register, currentUser, isAdmin,
    renderRoot, deptOptions,
  };
})();
