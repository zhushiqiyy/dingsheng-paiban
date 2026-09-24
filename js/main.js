/* ============================================================
 * 主入口：注册视图 + 启动
 * ============================================================ */
(function () {
  App.register('personnel', { title: '人员管理', adminOnly: true, render: VPersonnel.render });
  App.register('users', { title: '用户管理', adminOnly: true, render: VPersonnel.renderUsers });
  App.register('s1', { title: '一级值班', adminOnly: true, render: VS1.render });
  App.register('s2', { title: '二级值班', adminOnly: false, render: VS2.render });
  App.register('s3', { title: '班组值班', adminOnly: false, render: VS3.render });
  App.register('s4', { title: '节假日值班', adminOnly: false, render: VS4.render });
  App.register('backup', { title: '数据备份', adminOnly: true, render: VBackup.render });

  document.addEventListener('DOMContentLoaded', () => {
    App.init();
    // 云同步：检查连接状态，若已连接则自动从云端拉取数据（保留本地登录态）
    if (window.CloudSync && CloudSync.isAvailable()) {
      CloudSync.refreshState().then((enabled) => {
        if (!enabled) return;
        CloudSync.download().then((res) => {
          if (res.ok && res.data) {
            const data = res.data;
            // 登录态（session）不跨设备同步，保留本地
            const localSession = (Store.get() && Store.get().session) || { userId: null };
            data.session = localSession;
            Store.loadFromCloud(data);
            App.renderRoot();
          }
        });
      });
    }
  });
})();
