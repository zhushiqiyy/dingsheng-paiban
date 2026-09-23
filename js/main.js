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

  document.addEventListener('DOMContentLoaded', () => App.init());
})();
