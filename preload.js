const { contextBridge, ipcRenderer } = require('electron');

// 统一的错误处理函数
function handleIPCError(error) {
  console.error('IPC Error:', error);
  if (error.code && error.message) {
    return { success: false, code: error.code, message: error.message };
  }
  return { success: false, code: 'UNKNOWN_ERROR', message: '发生未知错误' };
}

contextBridge.exposeInMainWorld('electronAPI', {
  // 用户认证
  login: (credentials) => ipcRenderer.invoke('login', credentials).catch(handleIPCError),
  logout: () => ipcRenderer.invoke('logout').catch(handleIPCError),
  getCurrentUser: () => ipcRenderer.invoke('get-current-user').catch(handleIPCError),
  changePassword: (data) => ipcRenderer.invoke('change-password', data).catch(handleIPCError),
  saveLoginInfo: (loginInfo) => ipcRenderer.invoke('save-login-info', loginInfo).catch(handleIPCError),
  loadLoginInfo: () => ipcRenderer.invoke('load-login-info').catch(handleIPCError),
  
  // 用户管理
  createUser: (userData) => ipcRenderer.invoke('create-user', userData).catch(handleIPCError),
  getUsers: (filters) => ipcRenderer.invoke('get-users', filters).catch(handleIPCError),
  checkStoreLimit: (userId) => ipcRenderer.invoke('check-store-limit', userId).catch(handleIPCError),
  deleteUser: (userId) => ipcRenderer.invoke('delete-user', userId).catch(handleIPCError),
  toggleUserStatus: (userId) => ipcRenderer.invoke('toggle-user-status', userId).catch(handleIPCError),
  updateUser: (userData) => ipcRenderer.invoke('update-user', userData).catch(handleIPCError),
  
  // 门店管理
  saveStore: (store) => ipcRenderer.invoke('save-store', store).catch(handleIPCError),
  loadStores: (filters) => ipcRenderer.invoke('load-stores', filters).catch(handleIPCError),
  deleteStore: (id) => ipcRenderer.invoke('delete-store', id).catch(handleIPCError),
  batchDeleteStores: (ids) => ipcRenderer.invoke('batch-delete-stores', ids).catch(handleIPCError),
  transferStore: (data) => ipcRenderer.invoke('transfer-store', data).catch(handleIPCError),
  batchTransferStores: (data) => ipcRenderer.invoke('batch-transfer-stores', data).catch(handleIPCError),
  clearCurrentUserCache: () => ipcRenderer.invoke('clear-current-user-cache'),
  // 门店共享
  shareStore: (data) => ipcRenderer.invoke('share-store', data).catch(handleIPCError),
  batchShareStores: (data) => ipcRenderer.invoke('batch-share-stores', data).catch(handleIPCError),
  
  // 窗口管理
  openStore: (store) => ipcRenderer.invoke('open-store', store).catch(handleIPCError),
  getOpenWindows: () => ipcRenderer.invoke('get-open-windows').catch(handleIPCError),
  getStoreWindow: (id) => ipcRenderer.invoke('get-store-window', id).catch(handleIPCError),
  closeStoreWindow: (id) => ipcRenderer.invoke('close-store-window', id).catch(handleIPCError),
 // 复制门店窗口
duplicateStoreWindow: (storeData) => ipcRenderer.invoke('duplicate-store-window', storeData),
 // 驾驶舱功能
  openDashboard: () => ipcRenderer.invoke('open-dashboard').catch(handleIPCError),
  getDashboardData: () => ipcRenderer.invoke('get-dashboard-data').catch(handleIPCError),
  // 数据导入导出
  exportData: () => ipcRenderer.invoke('export-data').catch(handleIPCError),
  importData: (data) => ipcRenderer.invoke('import-data', data).catch(handleIPCError),
  
  // 登录成功通知
  loginSuccess: () => ipcRenderer.send('login-success'),
  
  // 会话管理
  saveSessionData: (storeId, sessionData) => ipcRenderer.invoke('save-session-data', { storeId, sessionData }).catch(handleIPCError),
  loadSessionData: (storeId) => ipcRenderer.invoke('load-session-data', storeId).catch(handleIPCError),
  getCookies: (partition) => ipcRenderer.invoke('get-cookies', partition).catch(handleIPCError),
  setCookies: (partition, cookies) => ipcRenderer.invoke('set-cookies', partition, cookies).catch(handleIPCError),
  
  // 共享和所有权检查方法
  checkStoreShared: (data) => ipcRenderer.invoke('check-store-shared', data).catch(handleIPCError),
  checkStoreOwnership: (data) => ipcRenderer.invoke('check-store-ownership', data).catch(handleIPCError),
  checkStoresShared: (data) => ipcRenderer.invoke('check-stores-shared', data).catch(handleIPCError),
  checkStoresOwnership: (data) => ipcRenderer.invoke('check-stores-ownership', data).catch(handleIPCError),
  batchImportStores: (filePath) => ipcRenderer.invoke('batch-import-stores', filePath).catch(handleIPCError),
batchAutoLogin: (data) => ipcRenderer.invoke('batch-auto-login', data).catch(handleIPCError),
downloadExcelTemplate: () => ipcRenderer.invoke('download-excel-template').catch(handleIPCError),
onLoginProgressUpdate: (callback) => ipcRenderer.on('login-progress-update', callback),
removeLoginProgressListener: () => ipcRenderer.removeAllListeners('login-progress-update'),
  // localStorage 操作
  getLocalStorageData: () => {
    return new Promise((resolve) => {
      const allData = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        allData[key] = localStorage.getItem(key);
      }
      resolve(allData);
    });
  },
  setLocalStorageData: (data) => {
    return new Promise((resolve) => {
      // 清空当前 localStorage
      localStorage.clear();
      
      // 设置新的数据
      for (const [key, value] of Object.entries(data)) {
        localStorage.setItem(key, value);
      }
      resolve({ success: true });
    });
  }
});

// 添加全局错误处理
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});