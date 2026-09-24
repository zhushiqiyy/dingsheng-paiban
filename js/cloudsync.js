/* ============================================================
 * 云同步模块：把整个应用数据同步到云端 team_state 表，实现跨设备共享
 * 团队主账号模式：一个邮箱账号做底层授权，应用内保留用户名登录
 * ============================================================ */
window.CloudSync = (function () {

  let _cloud = null;
  let _timer = null;
  let _busy = false;

  function init() {
    if (_cloud) return _cloud;
    if (window.WorkBuddyCloud && window.WorkBuddyCloud.createWorkBuddyCloud) {
      try {
        _cloud = window.WorkBuddyCloud.createWorkBuddyCloud({
          endpoint: CONFIG.CLOUD.endpoint,
          publishableKey: CONFIG.CLOUD.publishableKey,
        });
      } catch (e) {
        _cloud = null;
      }
    }
    return _cloud;
  }

  /** SDK 是否可用 */
  function isAvailable() {
    return !!init();
  }

  /** 当前云会话（null 表示未登录云） */
  async function getSession() {
    const c = init();
    if (!c) return null;
    try {
      const { data, error } = await c.auth.getSession();
      return error ? null : (data || null);
    } catch (e) {
      return null;
    }
  }

  /** 是否已连接云（有会话） */
  function isEnabled() {
    return !!_enabled;
  }
  let _enabled = false;

  /** 检查并更新连接状态 */
  async function refreshState() {
    const s = await getSession();
    _enabled = !!s;
    return _enabled;
  }

  /** 用团队主账号（邮箱+密码）登录云 */
  async function connect(email, password) {
    const c = init();
    if (!c) return { ok: false, msg: '云服务未初始化（SDK 未加载）' };
    try {
      const { data, error } = await c.auth.signInWithPassword({ email, password });
      if (error) return { ok: false, msg: (error && error.message) || '邮箱或密码错误' };
      _enabled = true;
      return { ok: true, session: data };
    } catch (e) {
      return { ok: false, msg: (e && e.message) || '网络错误' };
    }
  }

  /** 发送邮箱验证码（注册团队账号第一步），返回 verificationId */
  async function sendOtp(email) {
    const c = init();
    if (!c) return { ok: false, msg: '云服务未初始化' };
    try {
      const { data, error } = await c.auth.sendOtp({ email });
      if (error) return { ok: false, msg: (error && error.message) || '发送验证码失败' };
      return { ok: true, verificationId: data && data.verificationId, isExistingUser: data && data.isExistingUser };
    } catch (e) {
      return { ok: false, msg: (e && e.message) || '网络错误' };
    }
  }

  /** 验证验证码并注册/登录团队账号 */
  async function verifyRegister(verificationId, token, email, password) {
    const c = init();
    if (!c) return { ok: false, msg: '云服务未初始化' };
    try {
      const { data, error } = await c.auth.verifyOtp({
        verificationId, token, email,
        isExistingUser: false,
        password,
      });
      if (error) return { ok: false, msg: (error && error.message) || '验证码错误或已过期' };
      _enabled = true;
      return { ok: true };
    } catch (e) {
      return { ok: false, msg: (e && e.message) || '网络错误' };
    }
  }

  /** 登出云 */
  async function disconnect() {
    const c = init();
    if (c) { try { await c.auth.signOut(); } catch (e) {} }
    _enabled = false;
  }

  /** 上传整份数据到云端 */
  async function upload(obj) {
    const c = init();
    if (!c) return { ok: false, msg: '云服务未初始化' };
    try {
      const { error } = await c.database
        .from('team_state')
        .upsert({ key: CONFIG.CLOUD.stateKey, data: obj, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) return { ok: false, msg: (error && error.message) || '上传失败' };
      return { ok: true };
    } catch (e) {
      return { ok: false, msg: (e && e.message) || '网络错误' };
    }
  }

  /** 从云端下载整份数据 */
  async function download() {
    const c = init();
    if (!c) return { ok: false, msg: '云服务未初始化' };
    try {
      const { data, error } = await c.database
        .from('team_state')
        .select('data, updated_at')
        .eq('key', CONFIG.CLOUD.stateKey)
        .maybeSingle();
      if (error) return { ok: false, msg: (error && error.message) || '下载失败' };
      if (!data) return { ok: true, data: null };
      return { ok: true, data: data.data, updatedAt: data.updated_at };
    } catch (e) {
      return { ok: false, msg: (e && e.message) || '网络错误' };
    }
  }

  /** 取人员数量（对象里的 personnel 数组长度） */
  function _personnelCount(obj) {
    return (obj && Array.isArray(obj.personnel)) ? obj.personnel.length : 0;
  }

  /**
   * 安全上传：若本机人员为空但云端已有人员，则阻止覆盖，避免误清空云端。
   * @returns {ok, guarded?, cloudCount?, msg}
   */
  async function uploadGuarded(obj) {
    const localCount = _personnelCount(obj);
    // 只有本机人员为空时，才需要担心"空数据覆盖"问题
    if (localCount === 0) {
      const d = await download();
      const cloudCount = d.ok ? _personnelCount(d.data) : -1;
      if (cloudCount > 0) {
        return { ok: false, guarded: true, cloudCount, msg: `本机人员信息为空，但云端已有 ${cloudCount} 人。为防止误清空，本次上传已阻止。请先「下载云端数据」，或确认要覆盖后再操作。` };
      }
    }
    return await upload(obj);
  }

  /** 本地数据变更通知：防抖后自动上传（fire-and-forget） */
  function notifyLocalChange() {
    if (!_enabled || _busy) { if (!_enabled) return; }
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(() => { _doUpload(); }, 1500);
  }

  async function _doUpload() {
    if (_busy || !_enabled) return;
    _busy = true;
    try {
      if (window.Store && typeof Store.exportAll === 'function') {
        const obj = JSON.parse(Store.exportAll());
        obj.session = { userId: null };  // 登录态（session）不跨设备同步
        // 自动上传用受保护版本：本机人员为空时不覆盖云端已有人数据
        await uploadGuarded(obj);
      }
    } catch (e) {
      /* 静默：下次保存再试 */
    } finally {
      _busy = false;
    }
  }

  return {
    init, isAvailable, getSession, isEnabled, refreshState,
    connect, sendOtp, verifyRegister, disconnect, upload, uploadGuarded, download, notifyLocalChange,
  };
})();
