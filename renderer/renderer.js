document.addEventListener('DOMContentLoaded', async () => {
    // 初始化变量
    let currentUser = null;
    let stores = [];
    let users = [];
    let openWindows = [];
    let selectedPlatform = null;
    let currentFilter = 'all';
    let searchQuery = '';
    let isBatchMode = false;
    let selectedEmployeeId = '';
    let selectedCategory = '';

    // DOM元素
    const storesContainer = document.getElementById('storesContainer');
    const addStoreBtn = document.getElementById('addStoreBtn');
    const addStoreModal = document.getElementById('addStoreModal');
    const importModal = document.getElementById('importModal');
    const closeModalBtn = document.querySelector('.close');
    const closeImportBtn = document.querySelector('.close-import');
    const cancelAddBtn = document.getElementById('cancelAddBtn');
    const confirmAddBtn = document.getElementById('confirmAddBtn');
    const cancelImportBtn = document.getElementById('cancelImportBtn');
    const confirmImportBtn = document.getElementById('confirmImportBtn');
    const storeNameInput = document.getElementById('storeName');
    const contactPersonInput = document.getElementById('contactPerson');
    const contactPhoneInput = document.getElementById('contactPhone');
    const importDataTextarea = document.getElementById('importData');
    const platformOptions = document.querySelectorAll('.platform-option');
    const platformTabs = document.getElementById('platformTabs');
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const importBtn = document.getElementById('importBtn');
    const exportBtn = document.getElementById('exportBtn');
    const batchImportBtn = document.getElementById('batchImportBtn');
const batchImportModal = document.getElementById('batchImportModal');
const closeBatchImportBtn = document.querySelector('.close-batch-import');
const downloadTemplateBtn = document.getElementById('downloadTemplateBtn');
const excelFileInput = document.getElementById('excelFileInput');
const importExcelBtn = document.getElementById('importExcelBtn');
const autoLoginBtn = document.getElementById('autoLoginBtn');
const loginProgress = document.getElementById('loginProgress');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const loginResults = document.getElementById('loginResults');
    // 实用工具相关DOM元素
    const utilityToolsBtn = document.getElementById('utilityToolsBtn');
    const utilityToolsModal = document.getElementById('utilityToolsModal');
    const closeUtilityBtn = document.querySelector('.close-utility');
    const toolsContainer = document.getElementById('toolsContainer');
    const addCustomToolBtn = document.getElementById('addCustomToolBtn');
    const addToolModal = document.getElementById('addToolModal');
    const closeAddToolBtn = document.querySelector('.close-add-tool');
    const cancelAddToolBtn = document.getElementById('cancelAddToolBtn');
    const confirmAddToolBtn = document.getElementById('confirmAddToolBtn');

        // 预设工具列表
    const presetTools = [
        {
            id: 'image-editor',
            name: '在线图片编辑器',
            url: 'https://www.canva.cn',
            description: '功能强大的在线Photoshop替代工具',
            isPreset: true
        },
         {
            id: 'image-editor',
            name: '在线图片编辑器',
            url: 'https://ps.pic.net',
            description: '在线图片编辑工具',
            isPreset: true
        },
        {
            id: 'image-editor',
            name: '在线实用工具箱',
            url: 'https://www.elespaces.com/',
            description: '在线实用工具箱',
            isPreset: true
        },
        {
            id: 'video-editor',
            name: '在线视频编辑器',
            url: 'https://shipindashi.cn',
            description: '简单易用的在线视频编辑工具',
            isPreset: true
        }    
    ];

    // 全局错误处理
    window.addEventListener('error', (event) => {
        console.error('全局错误:', event.error);
        utils.showGlobalNotification('发生未知错误: ' + event.error.message, 'error');
    });

    window.addEventListener('unhandledrejection', (event) => {
        console.error('未处理的Promise拒绝:', event.reason);
        utils.showGlobalNotification('操作失败: ' + (event.reason.message || '未知错误'), 'error');
    });

    // 检查登录状态
    await checkAuth();

    // 检查登录状态
    async function checkAuth() {
        const user = await window.electronAPI.getCurrentUser();
        if (!user) {
            window.location.reload();
        } else {
            currentUser = user;
            // 添加批量操作功能
            setupBatchOperations();
            updateUIForUserRole();
            await loadInitialData();
            setupEventListeners();
            setupUtilityToolEventListeners();
            initTools();
        }
    }

    // 根据用户角色更新UI
    // 在 renderer.js 的 updateUIForUserRole 函数中添加
function updateUIForUserRole() {
  const userInfoContainer = document.getElementById('userInfoContainer');
  
  userInfoContainer.innerHTML = `
    <div class="user-profile">
      <div class="user-details">
        <div class="user-info-row">
        
          <div class="user-role">${utils.getRoleName(currentUser.role)}</div>
          <div class="user-avatar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
           <button id="logoutBtn" class="btn-icon-text" title="退出登录">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span>退出登录</span>
          </button>
        </div>
        <div class="user-actions">
        ${(currentUser.role === 'super_admin' || currentUser.role === 'admin') ? `
            <button id="dashboardBtn" class="btn-icon-text" title="数据驾驶舱">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                <line x1="12" y1="22.08" x2="12" y2="12"></line>
              </svg>
              <span>数据驾驶舱</span>
            </button>
          ` : ''}
          <button id="changePasswordBtn" class="btn-icon-text" title="修改密码">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M15 7a2 2 0 0 1 2 2m-4 0h4a2 2 0 0 1 0 4h-4m0 0v2m0-6V5a2 2 0 1 0-4 0v1m4 0h-4"></path>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            </svg>
            <span>修改密码</span>
          </button>
         
        </div>
      </div>
    </div>
  `;
  
  // 添加驾驶舱按钮事件监听
  if (currentUser.role === 'super_admin' || currentUser.role === 'admin') {
    document.getElementById('dashboardBtn').addEventListener('click', openDashboard);
  }
        
        // 修改密码功能
        document.getElementById('changePasswordBtn').addEventListener('click', showChangePasswordModal);
        
        // 退出功能
        document.getElementById('logoutBtn').addEventListener('click', async () => {
            if (confirm('确定要退出登录吗？')) {
                utils.setButtonLoading(document.getElementById('logoutBtn'), true);
                const result = await window.electronAPI.logout();
                if (result && result.success) {
                    utils.showGlobalNotification('退出登录成功', 'success');
                } else {
                    utils.showGlobalNotification('退出登录失败: ' + (result?.message || '未知错误'), 'error');
                }
                utils.setButtonLoading(document.getElementById('logoutBtn'), false);
            }
        });
        
        // 根据角色显示管理按钮
        if (currentUser.role === 'super_admin' || currentUser.role === 'admin') {
            addUserManagementButton();
        }
    }
// 添加打开驾驶舱的函数
async function openDashboard() {
  try {
    const result = await window.electronAPI.openDashboard();
    if (result.success) {
      console.log('驾驶舱打开成功');
    } else {
      utils.showGlobalNotification('打开驾驶舱失败: ' + result.message, 'error');
    }
  } catch (error) {
    console.error('打开驾驶舱错误:', error);
    utils.showGlobalNotification('打开驾驶舱失败', 'error');
  }
}
    // 添加用户管理按钮
    function addUserManagementButton() {
        const headerActions = document.querySelector('.header-actions');
        
        // 移除可能已存在的按钮
        const oldBtn = document.getElementById('userManagementBtn');
        if (oldBtn) oldBtn.remove();
        
        const userManagementBtn = document.createElement('button');
        userManagementBtn.className = 'btn-secondary user-management-btn';
        userManagementBtn.id = 'userManagementBtn';
        userManagementBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="8.5" cy="7" r="4"></circle>
                <line x1="20" y1="8" x2="20" y2="14"></line>
                <line x1="23" y1="11" x2="17" y2="11"></line>
            </svg>
            <span>用户管理</span>
        `;
        userManagementBtn.addEventListener('click', showUserManagementModal);
        
        // 插入到添加门店按钮之后
        addStoreBtn.insertAdjacentElement('beforebegin', userManagementBtn);
    }

    // 加载初始数据
   // 加载初始数据
async function loadInitialData() {
  await loadStores();
  // 添加刷新按钮
  addRefreshButton();
  
  // 关键修改：所有用户都加载用户列表（包括员工）
  if (currentUser) {
    const result = await window.electronAPI.getUsers();
    if (result.success) {
      users = result.data;
      console.log(`[loadInitialData] 前端接收用户数量: ${users.length}`);
      
      // 关键修改：所有用户都更新员工筛选下拉框
      updateEmployeeFilter(users);
    } else {
      console.error('[loadInitialData] 获取用户列表失败:', result.message);
    }
  }
  
  // 添加平台筛选下拉框
  addPlatformFilter();  
  
}
    // 添加刷新按钮
    function addRefreshButton() {
        const platformTabsContainer = document.querySelector('.platform-tabs-container');
        
        // 检查是否已存在刷新按钮
        if (document.getElementById('refreshBtn')) return;
        
        const refreshBtn = document.createElement('button');
        refreshBtn.id = 'refreshBtn';
        refreshBtn.className = 'employee-filter';
        refreshBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M23 4v6h-6M1 20v-6h6"></path>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            <span>刷新</span>
        `;
        
        // 插入到平台选项卡容器
        platformTabsContainer.appendChild(refreshBtn);
        
        // 添加点击事件
        refreshBtn.addEventListener('click', async () => {
    utils.setButtonLoading(refreshBtn, true);
    try {
        // 清理缓存并重新加载
        await window.electronAPI.clearCurrentUserCache();
        await loadStores();
        utils.showGlobalNotification('数据已刷新', 'success');
    } catch (error) {
        console.error('刷新失败:', error);
        utils.showGlobalNotification('刷新失败', 'error');
    } finally {
        utils.setButtonLoading(refreshBtn, false);
    }
});
    }

    // 添加平台筛选下拉框
    function addPlatformFilter() {
        const platformTabsContainer = document.querySelector('.platform-tabs-container');
        
        // 检查是否已存在平台筛选框
        if (document.getElementById('platformFilter')) return;
        
        // 创建平台筛选下拉框
        const platformFilter = document.createElement('select');
        platformFilter.id = 'platformFilter';
        platformFilter.className = 'employee-filter';
        platformFilter.innerHTML = `
            <option value="all">所有平台</option>
            <option value="美团">美团</option>
            <option value="饿了么">饿了么</option>
            <option value="饿了么零售">饿了么零售</option>
            <option value="京东">京东</option>
            
            <option value="淘宝">淘宝</option>
            <option value="天猫">天猫</option>
            <option value="拼多多">拼多多</option>
            <option value="抖音电商">抖音电商</option>
            
            <option value="小红书">小红书</option>
        `;
        
        // 插入到平台选项卡容器
        platformTabsContainer.appendChild(platformFilter);
        
        // 事件监听
        platformFilter.addEventListener('change', (e) => {
            currentFilter = e.target.value;
            loadStores();
        });
    }
     // 添加分类筛选下拉框
function addCategoryFilter() {
    const platformTabsContainer = document.querySelector('.platform-tabs-container');
    
    // 检查是否已存在分类筛选框
    if (document.getElementById('categoryFilter')) return;
    
    // 创建分类筛选下拉框
    const categoryFilter = document.createElement('select');
    categoryFilter.id = 'categoryFilter';
    categoryFilter.className = 'employee-filter';
    categoryFilter.innerHTML = `
        <option value="">所有分类</option>
        <option value="快餐简餐">快餐简餐</option>
        <option value="小吃">小吃</option>
        <option value="地方菜">地方菜</option>
        <option value="火锅">火锅</option>
        <option value="烧烤">烧烤</option>
        <option value="海鲜">海鲜</option>
        <option value="全球美食">全球美食</option>
        <option value="零售">零售</option>
    `;
    
    // 插入到平台选项卡容器
    platformTabsContainer.appendChild(categoryFilter);
    
    // 事件监听
    categoryFilter.addEventListener('change', (e) => {
        selectedCategory = e.target.value;
        loadStores();
    });
}
    
    // 更新员工筛选下拉框
// 更新员工筛选下拉框
function updateEmployeeFilter(usersList) {
    const platformTabsContainer = document.querySelector('.platform-tabs-container');
    
    // 移除旧的员工筛选框
    const oldFilter = document.getElementById('employeeFilter');
    if (oldFilter) oldFilter.remove();
    
    // 创建员工筛选下拉框
    const employeeFilter = document.createElement('select');
    employeeFilter.id = 'employeeFilter';
    employeeFilter.className = 'employee-filter';
    
    // 根据用户角色显示不同的选项
    if (currentUser.role === 'super_admin') {
        employeeFilter.innerHTML = `
            <option value="">所有用户</option>
        `;
        
        // 添加具体用户选项（显示姓名和角色）
        usersList.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = `${user.name} (${utils.getRoleName(user.role)})`;
            employeeFilter.appendChild(option);
        });
    } else if (currentUser.role === 'admin') {
        // 管理员：显示自己和名下员工
        employeeFilter.innerHTML = '<option value="">所有员工</option>';
        
        usersList.forEach(user => {
            if (user.id === currentUser.id || user.admin_id === currentUser.id) {
                const option = document.createElement('option');
                option.value = user.id;
                const roleText = user.id === currentUser.id ? '（我）' : `（${utils.getRoleName(user.role)}）`;
                option.textContent = `${user.name} ${roleText}`;
                employeeFilter.appendChild(option);
            }
        });
    } else {
        // 员工：只显示"我的门店"和"共享给我的门店"
        employeeFilter.innerHTML = `
            <option value="">所有门店</option>
            <option value="my_stores">我的门店</option>
            <option value="shared_stores">共享给我的门店</option>
        `;
    }
    
    // 插入到平台选项卡容器
    platformTabsContainer.appendChild(employeeFilter);
    
    // 事件监听
    employeeFilter.addEventListener('change', (e) => {
        selectedEmployeeId = e.target.value;
        loadStores();
    });
}

    
    // 添加分类筛选下拉框
    addCategoryFilter();

    // 设置批量操作功能
    function setupBatchOperations() {
        const toolButtonsContainer = document.querySelector('.tool-buttons');
        
        // 移除旧的批量操作按钮
        const oldBtn = document.getElementById('batchOperationBtn');
        if (oldBtn) oldBtn.remove();
        
        // 移除旧的批量操作容器
        const oldContainer = document.querySelector('.batch-operations');
        if (oldContainer) oldContainer.remove();
        
        // 创建批量操作按钮
        const batchBtn = document.createElement('button');
        batchBtn.id = 'batchOperationBtn';
        batchBtn.className = 'btn-secondary';
        batchBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <path d="M9 9h6v6H9z"></path>
            </svg>
            <span>批量管理</span>
        `;
        
        // 插入到平台选项卡容器
        toolButtonsContainer.appendChild(batchBtn);
        
        // 创建批量操作容器
        const batchContainer = document.createElement('div');
        batchContainer.className = 'batch-operations';
        batchContainer.style.display = 'none';
        batchContainer.innerHTML = `
            <div class="batch-actions">
                <span id="selectedCount">已选择 0 个门店</span>
                <button id="batchShareBtn" class="share-store">批量共享</button>
                <button id="batchTransferBtn" class="transfer-store">批量转移</button>
                <button id="batchDeleteBtn" class="btn-danger">批量删除</button>
                <button id="cancelBatchBtn" class="btn-quxiao">取消</button>
            </div>
        `;
        
        document.querySelector('.main-content').prepend(batchContainer);
        
        // 批量共享功能
        document.getElementById('batchShareBtn').addEventListener('click', () => {
            showShareStoreModal(null, true);
        });
        
        // 批量转移功能
        document.getElementById('batchTransferBtn').addEventListener('click', () => {
            showTransferStoreModal(null, true);
        });
        
        // 批量删除功能
        document.getElementById('batchDeleteBtn').addEventListener('click', async () => {
            const selectedIds = Array.from(document.querySelectorAll('.store-checkbox:checked'))
                .map(checkbox => checkbox.dataset.id);
            
            if (selectedIds.length === 0) {
                utils.showGlobalNotification('请选择要删除的门店', 'warning');
                return;
            }
            
            if (confirm(`确定要删除这 ${selectedIds.length} 个门店吗？`)) {
                const btn = document.getElementById('batchDeleteBtn');
                utils.setButtonLoading(btn, true);
                
                try {
                    const result = await window.electronAPI.batchDeleteStores(selectedIds);
                    if (result.success) {
                        utils.showGlobalNotification(`成功删除 ${selectedIds.length} 个门店`, 'success');
                        await loadStores();
                        toggleBatchMode(false);
                    } else {
                        utils.showGlobalNotification('批量删除失败: ' + result.message, 'error');
                    }
                } catch (error) {
                    utils.showGlobalNotification('批量删除失败: ' + error.message, 'error');
                } finally {
                    utils.setButtonLoading(btn, false);
                }
            }
        });
        
        // 取消批量操作
        document.getElementById('cancelBatchBtn').addEventListener('click', () => {
            toggleBatchMode(false);
        });
        
        // 批量操作按钮点击事件
        batchBtn.addEventListener('click', () => {
            toggleBatchMode(true);
        });
    }

    // 切换批量模式
    function toggleBatchMode(enable) {
        isBatchMode = enable;
        const batchContainer = document.querySelector('.batch-operations');
        const checkboxes = document.querySelectorAll('.store-checkbox');
        const storeCards = document.querySelectorAll('.store-card');
        
        if (enable) {
            batchContainer.style.display = 'block';
            checkboxes.forEach(checkbox => checkbox.style.display = 'block');
            storeCards.forEach(card => {
                card.style.cursor = 'default';
                card.addEventListener('click', preventCardClick);
            });
        } else {
            batchContainer.style.display = 'none';
            checkboxes.forEach(checkbox => {
                checkbox.style.display = 'none';
                checkbox.checked = false;
            });
            storeCards.forEach(card => {
                card.style.cursor = 'pointer';
                card.removeEventListener('click', preventCardClick);
            });
            updateSelectedCount();
        }
    }

    // 阻止卡片点击事件
    function preventCardClick(e) {
        if (!e.target.classList.contains('store-checkbox')) {
            e.preventDefault();
            e.stopPropagation();
        }
    }

    // 更新选中数量
    function updateSelectedCount() {
        const selectedCount = document.querySelectorAll('.store-checkbox:checked').length;
        document.getElementById('selectedCount').textContent = `已选择 ${selectedCount} 个门店`;
    }

    // 加载门店数据
  // 加载门店数据
async function loadStores() {
    try {
        const filters = {};
        if (currentFilter !== 'all') {
            filters.platform = currentFilter;
        }
        if (searchQuery) {
            filters.search = searchQuery;
        }
        if (selectedCategory) {
            filters.category = selectedCategory;
        }
        
        console.log('发送筛选条件:', filters);
        
        // 处理员工筛选 - 关键修改
        if (selectedEmployeeId) {
            if (currentUser.role === 'super_admin') {
                // 超级管理员可以按任意用户筛选
                filters.ownerId = selectedEmployeeId;
            } else if (currentUser.role === 'admin') {
                // 管理员只能筛选自己有权限查看的用户
                filters.ownerId = selectedEmployeeId;
            } else {
                // 员工特殊筛选逻辑
                if (selectedEmployeeId === 'my_stores') {
                    // 只看自己的门店
                    filters.ownerId = currentUser.id;
                } else if (selectedEmployeeId === 'shared_stores') {
                    // 只看共享给我的门店 - 这里需要特殊处理
                    // 我们会在渲染时过滤，因为后端API可能不支持直接筛选共享门店
                }
                // 如果 selectedEmployeeId 是具体的用户ID，按正常逻辑处理
                else if (selectedEmployeeId !== '') {
                    filters.ownerId = selectedEmployeeId;
                }
            }
        }
        
        // 确保用户数据已加载
        if (users.length === 0 && currentUser) {
            const userResult = await window.electronAPI.getUsers();
            if (userResult.success) {
                users = userResult.data;
                console.log('用户数据加载成功，数量:', users.length);
            }
        }
        
        const result = await window.electronAPI.loadStores(filters);
        console.log('加载门店结果:', result);
        
        if (result.success) {
            let filteredStores = result.data;
            
            // 员工特殊筛选：共享门店
            if (currentUser.role === 'employee' && selectedEmployeeId === 'shared_stores') {
                filteredStores = filteredStores.filter(store => store.owner_id !== currentUser.id);
            }
            
            // 关键修改：按添加时间排序（最新的在前）
            filteredStores.sort((a, b) => {
                const timeA = new Date(a.created_at || a.updated_at || 0);
                const timeB = new Date(b.created_at || b.updated_at || 0);
                return timeB - timeA; // 降序排列，最新的在前
            });
            
            stores = filteredStores;
            console.log(`收到 ${stores.length} 个门店，已按添加时间排序`);
            
            // 确保 openWindows 是数组
            try {
                const result = await window.electronAPI.getOpenWindows();
                if (result.success && Array.isArray(result.data)) {
                    openWindows = result.data;
                } else {
                    openWindows = [];
                }
            } catch (error) {
                console.error('获取打开窗口异常:', error);
                openWindows = [];
            }
            
            renderStores();
        } else {
            console.error('加载门店失败:', result.message);
            utils.showGlobalNotification('加载门店失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('加载门店数据失败:', error);
        utils.showGlobalNotification('加载门店数据失败', 'error');
    }
}
    // 渲染门店列表
  // 渲染门店列表
function renderStores() {
    storesContainer.innerHTML = '';
    
    // 添加筛选状态提示
    let filterHint = '';
    if (currentUser.role === 'employee') {
        if (selectedEmployeeId === 'my_stores') {
            filterHint = '（仅显示我的门店）';
        } else if (selectedEmployeeId === 'shared_stores') {
            filterHint = '（仅显示共享给我的门店）';
        }
    }
    
    if (!Array.isArray(stores) || stores.length === 0) {
        const filterText = searchQuery || currentFilter !== 'all' || selectedEmployeeId || selectedCategory ? 
            `没有找到匹配的门店${filterHint}` : `暂无门店${filterHint}，请添加第一个门店`;
        
        storesContainer.innerHTML = `
            <div class="empty-state">
                <p>${filterText}</p>
                ${selectedCategory ? `<p>当前筛选: <strong>${selectedCategory}</strong></p>` : ''}
            </div>
        `;
        return;
    }
    
    // 确保 openWindows 是数组
    const currentOpenWindows = Array.isArray(openWindows) ? openWindows : [];
    
    // 渲染门店卡片
    stores.forEach(store => {
        const isOpen = Array.isArray(openWindows) && openWindows.includes(store.id);
        const platformClass = utils.getPlatformClass(store.platform);
        
        // 判断是否是共享门店（当前用户不是所有者）
        const isShared = store.owner_id !== currentUser.id;
        
        // 获取所有者名称
        const ownerName = users.find(user => user.id === store.owner_id)?.name || '未知用户';
        
        const storeCard = document.createElement('div');
        storeCard.className = `store-card ${isOpen ? 'open' : ''}`;
        storeCard.dataset.id = store.id;
        
        storeCard.innerHTML = `
            <input type="checkbox" class="store-checkbox" data-id="${store.id}" style="display: ${isBatchMode ? 'block' : 'none'}; position: absolute; top: 10px; left: 10px;">
            <div class="store-header">
                <div class="store-name">${store.name}</div>
                <span class="store-platform ${platformClass}">${store.platform}</span>
            </div>
            <div class="store-tags">
                ${store.category ? `<span class="store-tag category-tag">${store.category}</span>` : ''}            
                <span class="store-tag owner-tag">所属员工: ${ownerName}</span>
                ${isShared ? '<span class="store-tag shared-tag">共享门店</span>' : ''}
            </div>
            <div class="store-info">
                ${store.contact_person ? `<div class="store-contact">联系人: ${store.contact_person}</div>` : ''}
                ${store.contact_phone ? `<div class="store-phone">电话: ${store.contact_phone}</div>` : ''}
                ${store.province && store.city ? `<div class="store-address">地址: ${store.province} ${store.city}</div>` : ''}
            </div>
            <div class="store-actions">
                <button class="btn-primary open-store" data-id="${store.id}">${isOpen ? '查看门店' : '打开后台'}</button>
                ${isOpen ? '<button class="btn-secondary close-store" data-id="${store.id}">关闭窗口</button>' : ''}
                ${!isShared ? `
                    <button class="btn-edit edit-store" data-id="${store.id}" title="编辑门店">编辑</button>
                    <button class="btn-danger delete-store" data-id="${store.id}">删除</button>
                    <button class="share-store" data-id="${store.id}" title="共享门店">共享</button>
                    <button class="transfer-store" data-id="${store.id}" title="转移门店">转移</button>
                ` : `
                    <button class="btn-edit edit-store" data-id="${store.id}" title="编辑门店" disabled>编辑</button>
                    <button class="btn-danger delete-store" data-id="${store.id}" disabled>删除</button>
                    <button class="share-store" data-id="${store.id}" title="共享门店" disabled>共享</button>
                    <button class="transfer-store" data-id="${store.id}" title="转移门店" disabled>转移</button>
                `}
            </div>
            ${isOpen ? '<div class="status-badge">已打开</div>' : '<div class="status-badge closed">已关闭</div>'}
        `;
        
        storesContainer.appendChild(storeCard);
    });
    
    // 添加事件监听器
    addStoreCardEventListeners();
    
    // 添加复选框事件监听
    document.querySelectorAll('.store-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', updateSelectedCount);
    });
}

    // 添加门店卡片事件监听
    function addStoreCardEventListeners() {
              
        document.querySelectorAll('.open-store').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                utils.setButtonLoading(btn, true);
                
                const storeId = e.target.dataset.id;
                const store = stores.find(s => s.id === storeId);
                if (store) {
                    try {
                        const windowResult = await window.electronAPI.getStoreWindow(storeId);
                        
                        // 添加空值检查
                        if (windowResult.success && windowResult.data && !windowResult.data.isDestroyed) {
                            await window.electronAPI.openStore(store);
                        } else {
                            const result = await window.electronAPI.openStore(store);
                            if (result.success && result.data && result.data.action === 'focused') {
                                console.log('窗口已存在，已聚焦');
                            } else if (result.success) {
                                console.log('新窗口已打开');
                            }
                        }
                        
                        await loadStores();
                    } catch (error) {
                        console.error('打开门店错误:', error);
                        utils.showGlobalNotification('打开门店失败: ' + error.message, 'error');
                    } finally {
                        utils.setButtonLoading(btn, false);
                    }
                }
            });
        });
        
        document.querySelectorAll('.close-store').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                utils.setButtonLoading(btn, true);
                
                const storeId = e.target.dataset.id;
                await window.electronAPI.closeStoreWindow(storeId);
                await loadStores();
                utils.setButtonLoading(btn, false);
            });
        });
        
        document.querySelectorAll('.edit-store').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                utils.setButtonLoading(btn, true);
                
                const storeId = e.target.dataset.id;
                const store = stores.find(s => s.id === storeId);
                if (store) {
                    showEditStoreModal(store);
                }
                
                utils.setButtonLoading(btn, false);
            });
        });
        
        document.querySelectorAll('.delete-store').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                utils.setButtonLoading(btn, true);
                
                const storeId = e.target.dataset.id;
                if (confirm('确定要删除这个门店吗？')) {
                    try {
                        await window.electronAPI.closeStoreWindow(storeId);
                        const result = await window.electronAPI.deleteStore(storeId);
                        if (result.success) {
                            utils.showGlobalNotification('门店删除成功', 'success');
                            await loadStores();
                        } else {
                            utils.showGlobalNotification('删除失败: ' + result.message, 'error');
                        }
                    } catch (error) {
                        console.error('删除错误:', error);
                        utils.showGlobalNotification('删除过程中发生错误: ' + error.message, 'error');
                    }
                }
                
                utils.setButtonLoading(btn, false);
            });
        });
        
        // 共享门店功能
        document.querySelectorAll('.share-store').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                utils.setButtonLoading(btn, true);
                
                const storeId = e.target.dataset.id;
                showShareStoreModal(storeId, false);
                
                utils.setButtonLoading(btn, false);
            });
        });
        
        // 转移门店功能
        document.querySelectorAll('.transfer-store').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                utils.setButtonLoading(btn, true);
                
                const storeId = e.target.dataset.id;
                showTransferStoreModal(storeId, false);
                
                utils.setButtonLoading(btn, false);
            });
        });
    }

    // 显示编辑门店模态框
    function showEditStoreModal(store) {
    // 先关闭添加门店模态框（如果打开）
    closeAddStoreModal();
    
    // 设置表单值
    storeNameInput.value = store.name || '';
    contactPersonInput.value = store.contact_person || '';
    contactPhoneInput.value = store.contact_phone || '';
    document.getElementById('storeProvince').value = store.province || '';
    document.getElementById('storeCity').value = store.city || '';
    document.getElementById('storeCategory').value = store.category || '';
    selectedPlatform = store.platform;
    
    // 清除所有错误提示
    utils.clearFieldError('storeNameError');
    utils.clearFieldError('contactPersonError');
    utils.clearFieldError('contactPhoneError');
    utils.clearFieldError('storeProvinceError');
    utils.clearFieldError('storeCityError');
    
    // 选择正确的平台
    platformOptions.forEach(option => {
        option.classList.remove('active');
        if (option.dataset.platform === store.platform) {
            option.classList.add('active');
        }
    });
    
    // 更改模态框标题和按钮文本
    document.querySelector('#addStoreModal .modal-header h2').textContent = '编辑门店';
    confirmAddBtn.textContent = '保存';
    confirmAddBtn.dataset.mode = 'edit';
    confirmAddBtn.dataset.storeId = store.id;
    
    // 打开模态框
    addStoreModal.style.display = 'block';
}

    // 打开或聚焦门店窗口
    async function openOrFocusStore(store) {
        const button = document.querySelector(`.open-store[data-id="${store.id}"]`);
        if (!button) {
            console.error('找不到打开按钮');
            return;
        }
        
        utils.setButtonLoading(button, true);
        
        try {
            // 先检查窗口是否已存在
            const windowResult = await window.electronAPI.getStoreWindow(store.id);
            
            if (windowResult.success && windowResult.data && !windowResult.data.isDestroyed) {
                // 窗口已存在，聚焦它
                const result = await window.electronAPI.openStore(store);
                if (result.success) {
                    console.log('聚焦已存在的窗口');
                }
            } else {
                // 创建新窗口
                const result = await window.electronAPI.openStore(store);
                if (result.success) {
                    console.log('创建新窗口成功');
                } else {
                    console.error('创建新窗口失败:', result.message);
                    utils.showGlobalNotification('打开门店失败: ' + result.message, 'error');
                }
            }
            
            // 更新门店状态
            await loadStores();
        } catch (error) {
            console.error('打开门店异常:', error);
            utils.showGlobalNotification('打开门店异常: ' + error.message, 'error');
        } finally {
            // 确保无论如何都重置按钮状态
            utils.setButtonLoading(button, false);
        }
    }

    // 打开添加门店模态框
    function openAddStoreModal() {
    if (!currentUser) {
        utils.showGlobalNotification('请先登录', 'error');
        return;
    }
        // 先隐藏模态框，等待检查结果
    addStoreModal.style.display = 'none';
    
    
    // 清除所有错误提示
    utils.clearFieldError('storeNameError');
    utils.clearFieldError('contactPersonError');
    utils.clearFieldError('contactPhoneError');
    utils.clearFieldError('storeProvinceError');
    utils.clearFieldError('storeCityError');
    
    // 检查门店数量限制
    window.electronAPI.checkStoreLimit(currentUser.id).then(result => {
        if (result.success && !result.data.canAdd) {
            utils.showGlobalNotification(`已达到门店数量限制 (${result.data.current}/${result.data.limit})，无法添加新门店`, 'error');
            return;
        }
        
        // 重置表单
        storeNameInput.value = '';
        contactPersonInput.value = '';
        contactPhoneInput.value = '';
        document.getElementById('storeProvince').value = '';
        document.getElementById('storeCity').value = '';
        document.getElementById('storeCategory').value = '';
        selectedPlatform = null;
        platformOptions.forEach(option => option.classList.remove('active'));
        
        // 更改模态框标题和按钮文本
        document.querySelector('#addStoreModal .modal-header h2').textContent = '添加门店';
        confirmAddBtn.textContent = '保存并打开';
        confirmAddBtn.dataset.mode = 'add';
        delete confirmAddBtn.dataset.storeId;
        
        addStoreModal.style.display = 'block';
    });
}

    // 关闭添加门店模态框
    function closeAddStoreModal() {
        addStoreModal.style.display = 'none';
    }

    // 打开导入数据模态框
    function openImportModal() {
        importDataTextarea.value = '';
        // 清除错误提示
        utils.clearFieldError('importDataError');
        importModal.style.display = 'block';
    }

    // 关闭导入数据模态框
    function closeImportModal() {
        importModal.style.display = 'none';
    }

    // 添加或编辑门店
    async function saveStore() {
    const name = storeNameInput.value.trim();
    const contactPerson = contactPersonInput.value.trim();
    const contactPhone = contactPhoneInput.value.trim();
    const province = document.getElementById('storeProvince').value.trim();
    const city = document.getElementById('storeCity').value.trim();
    const category = document.getElementById('storeCategory').value;
    
    // 清除之前的错误提示
    utils.clearFieldError('storeNameError');
    utils.clearFieldError('contactPersonError');
    utils.clearFieldError('contactPhoneError');
    utils.clearFieldError('storeProvinceError');
    utils.clearFieldError('storeCityError');
    
    if (!name) {
        utils.showFieldError('storeNameError', '请输入门店名称');
        return;
    }
    
    if (!selectedPlatform) {
        utils.showGlobalNotification('请选择平台', 'error');
        return;
    }
    
    // 验证联系电话格式
    if (contactPhone && !utils.validatePhone(contactPhone)) {
        utils.showFieldError('contactPhoneError', '请输入有效的手机号码');
        return;
    }
    
    // 验证地址信息
    if (province && !city) {
        utils.showFieldError('storeCityError', '请填写城市信息');
        return;
    }
    
    if (city && !province) {
        utils.showFieldError('storeProvinceError', '请填写省份信息');
        return;
    }
    
    const storeData = {
        name: name,
        platform: selectedPlatform,
        contact_person: contactPerson,
        contact_phone: contactPhone,
        province: province,
        city: city,
        category: category
    };
    
    // 如果是编辑模式，添加ID
    // 如果是编辑模式，添加ID和原所属者ID
    if (confirmAddBtn.dataset.mode === 'edit' && confirmAddBtn.dataset.storeId) {
        const storeId = confirmAddBtn.dataset.storeId;
        // 从门店列表中找到原门店数据
        const originalStore = stores.find(store => store.id === storeId);
        if (originalStore) {
            storeData.id = storeId;
            // 添加原所属者ID
            storeData.owner_id = originalStore.owner_id;
        } else {
            utils.showGlobalNotification('未找到门店原始数据', 'error');
            utils.setButtonLoading(confirmAddBtn, false);
            return;
        }
    }
    utils.setButtonLoading(confirmAddBtn, true);
    
    try {
        const result = await window.electronAPI.saveStore(storeData);
        
        if (result.success) {
            utils.showGlobalNotification('门店保存成功', 'success');
            closeAddStoreModal();
            await loadStores();
            
            // 如果是添加模式，打开门店
            if (confirmAddBtn.dataset.mode === 'add') {
                await openOrFocusStore(result.data);
            }
        } else {
            // 处理特定错误
            if (result.message && result.message.includes('contact_phone')) {
                utils.showFieldError('contactPhoneError', '联系电话格式不正确');
            } else {
                utils.showGlobalNotification('保存失败: ' + (result.message || '未知错误'), 'error');
            }
        }
    } catch (error) {
        console.error('保存错误:', error);
        utils.showGlobalNotification('保存过程中发生错误: ' + error.message, 'error');
    } finally {
        utils.setButtonLoading(confirmAddBtn, false);
    }
}
    // 导出数据
    async function exportData() {
        utils.setButtonLoading(exportBtn, true);
        
        try {
            const result = await window.electronAPI.exportData();
            
            if (result.success) {
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(result.data);
                const downloadAnchorNode = document.createElement('a');
                downloadAnchorNode.setAttribute("href", dataStr);
                downloadAnchorNode.setAttribute("download", "stores_backup.json");
                document.body.appendChild(downloadAnchorNode);
                downloadAnchorNode.click();
                downloadAnchorNode.remove();
                
                utils.showGlobalNotification('数据导出成功！', 'success');
            } else {
                utils.showGlobalNotification('导出失败: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('导出错误:', error);
            utils.showGlobalNotification('导出过程中发生错误', 'error');
        } finally {
            utils.setButtonLoading(exportBtn, false);
        }
    }

    // 导入数据
    async function importData() {
        const data = importDataTextarea.value.trim();
        
        // 清除错误提示
        utils.clearFieldError('importDataError');
        
        if (!data) {
            utils.showFieldError('importDataError', '请输入要导入的数据');
            return;
        }
        
        if (confirm('导入数据将覆盖现有数据，确定要继续吗？')) {
            utils.setButtonLoading(confirmImportBtn, true);
            
            try {
                const result = await window.electronAPI.importData(data);
                
                if (result.success) {
                    utils.showGlobalNotification('数据导入成功！', 'success');
                    closeImportModal();
                    await loadStores();
                } else {
                    utils.showGlobalNotification('导入失败: ' + result.message, 'error');
                }
            } catch (error) {
                console.error('导入错误:', error);
                utils.showGlobalNotification('导入过程中发生错误', 'error');
            } finally {
                utils.setButtonLoading(confirmImportBtn, false);
            }
        }
    }

    // 显示修改密码模态框
    function showChangePasswordModal() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>修改密码</h2>
                    <span class="close">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="currentPassword">当前密码</label>
                        <input type="password" id="currentPassword" placeholder="请输入当前密码" data-field="currentPassword">
                        <div class="input-error" id="currentPasswordError"></div>
                    </div>
                    <div class="form-group">
                        <label for="newPassword">新密码</label>
                        <input type="password" id="newPassword" placeholder="请输入新密码（至少6位）" data-field="newPassword">
                        <div class="input-error" id="newPasswordError"></div>
                    </div>
                    <div class="form-group">
                        <label for="confirmPassword">确认新密码</label>
                        <input type="password" id="confirmPassword" placeholder="请再次输入新密码" data-field="confirmPassword">
                        <div class="input-error" id="confirmPasswordError"></div>
                    </div>
                    <div class="form-actions">
                        <button class="btn-quxiao" id="cancelChangePasswordBtn">取消</button>
                        <button class="btn-primary" id="confirmChangePasswordBtn">确认修改</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const closeModal = () => {
            // 重置按钮状态
            const confirmBtn = modal.querySelector('#confirmChangePasswordBtn');
            utils.setButtonLoading(confirmBtn, false);
            modal.remove();
        };
        
        modal.querySelector('.close').addEventListener('click', closeModal);
        modal.querySelector('#cancelChangePasswordBtn').addEventListener('click', closeModal);
        
        // 添加输入事件监听以清除错误
        modal.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => {
                const fieldName = input.id.replace('Error', '');
                utils.clearFieldError(fieldName + 'Error');
            });
        });
        
        modal.querySelector('#confirmChangePasswordBtn').addEventListener('click', async () => {
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            
            // 清除所有错误提示
            utils.clearFieldError('currentPasswordError');
            utils.clearFieldError('newPasswordError');
            utils.clearFieldError('confirmPasswordError');
            
            if (!currentPassword || !newPassword || !confirmPassword) {
                utils.showFieldError('currentPasswordError', '请填写完整信息');
                return;
            }
            
            if (newPassword.length < 6) {
                utils.showFieldError('newPasswordError', '新密码长度至少6位');
                return;
            }
            
            if (newPassword !== confirmPassword) {
                utils.showFieldError('confirmPasswordError', '两次输入的新密码不一致');
                return;
            }

            utils.setButtonLoading(modal.querySelector('#confirmChangePasswordBtn'), true);
            
            try {
                const result = await window.electronAPI.changePassword({ currentPassword, newPassword });
                
                if (result.success) {
                    utils.showGlobalNotification('密码修改成功', 'success');
                    closeModal();
                } else {
                    utils.showGlobalNotification('密码修改失败: ' + (result.message || '未知错误'), 'error');
                }
            } catch (error) {
                console.error('修改密码错误:', error);
                utils.showGlobalNotification('修改密码过程中发生错误', 'error');
            } finally {
                utils.setButtonLoading(modal.querySelector('#confirmChangePasswordBtn'), false);
            }
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }

    // 显示用户管理模态框
    async function showUserManagementModal() {
        utils.setButtonLoading(document.getElementById('userManagementBtn'), true);
        
        const result = await window.electronAPI.getUsers();
        if (!result.success) {
            utils.showGlobalNotification('加载用户列表失败: ' + result.message, 'error');
            utils.setButtonLoading(document.getElementById('userManagementBtn'), false);
            return;
        }

        users = result.data;
        
        const modal = document.createElement('div');
        modal.id = 'userManagementModal';
        modal.className = 'modal';
        modal.style.display = 'block';
        
        modal.innerHTML = `
<div class="modal-content" style="max-width: 900px;">
    <div class="modal-header">
        <h2>用户管理</h2>
        <span class="close">&times;</span>
    </div>
    <div class="modal-body">
        <div class="management-actions">
            ${currentUser.role === 'super_admin' ? 
            '<button id="createAdminBtn" class="btn-primary">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">' +
            '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>' +
            '<circle cx="8.5" cy="7" r="4"></circle>' +
            '<line x1="20" y1="8" x2="20" y2="14"></line>' +
            '<line x1="23" y1="11" x2="17" y2="11"></line>' +
            '</svg>' +
            '<span>创建管理员</span>' +
            '</button>' : ''}
            <button id="createEmployeeBtn" class="btn-primary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="8.5" cy="7" r="4"></circle>
                    <line x1="20" y1="8" x2="20" y2="14"></line>
                    <line x1="23" y1="11" x2="17" y2="11"></line>
                </svg>
                <span>创建员工</span>
            </button>
        </div>
        
        <div class="user-list">
            <h3>用户列表 (${users.length})</h3>
            
            <div class="user-table-container">
                <table class="user-table">
                    <thead>
                        <tr>
                            <th>姓名</th>
                            <th>邮箱</th>
                            <th>角色</th>
                            <th>门店限制</th>
                            <th>状态</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${users.length > 0 ? users.map(user => `
                            <tr>
                                <td>${user.name}</td>
                                <td>${user.email}</td>
                                <td>${utils.getRoleName(user.role)}</td>
                                <td class="limit-info-cell">
                                    ${user.store_limit === 10000 ? 
                                    '<span class="limit-unlimited">无限制</span>' : 
                                    user.store_limit || '10'}
                                </td>
                                <td>
                                   <span class="status-badgd ${(user.is_active !== false) ? 'status-active' : 'status-inactive'}">
                                    ${(user.is_active !== false) ? '激活' : '禁用'}
                                     </span>
                                </td>
                                <td>
                                    <div class="action-buttons">
                                        ${((currentUser.role === 'super_admin' && user.id !== currentUser.id) || 
                                        (currentUser.role === 'admin' && user.role === 'employee')) ? `
                                            <button class="edit-user-btn" data-userid="${user.id}" title="编辑用户">
                                                <svg class="table-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                                </svg>
                                                编辑
                                            </button>
                                                        <button class="toggle-user-btn" data-userid="${user.id}" title="${user.is_active ? '禁用用户' : '启用用户'}">
                                                       <svg class="table-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                     ${user.is_active ? `
                                                    <!-- 禁用图标 -->                                                        
                                               <path d="M18.364 5.636a9 9 0 0 1 0 12.728M5.636 5.636a9 9 0 0 0 0 12.728M12 2v20"/>
                                               </svg>
                                              禁用
                                              ` : `
                                         <!-- 启用图标 -->
                                      <circle cx="12" cy="12" r="5"/>                                          
                                        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                                         </svg>
                                        启用
                                        ` }
                                     </button>
        <button class="delete-user-btn" data-userid="${user.id}" title="删除用户">
            <svg class="table-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            删除
        </button>
                                            ` : ''}
                                    </div>
                                </td>
                            </tr>
                        `).join('') : `
                            <tr>
                                <td colspan="6" style="text-align: center; padding: 40px; color: #6c757d;">
                                    暂无用户数据
                                </td>
                            </tr>
                        `}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>
`;
        document.body.appendChild(modal);

        // 事件监听
        modal.querySelector('.close').addEventListener('click', () => {
            // 重置按钮状态
            utils.setButtonLoading(document.getElementById('userManagementBtn'), false);
            modal.remove();
        });
        
        if (modal.querySelector('#createAdminBtn')) {
            modal.querySelector('#createAdminBtn').addEventListener('click', () => showCreateUserModal('admin'));
        }
        
        modal.querySelector('#createEmployeeBtn').addEventListener('click', () => showCreateUserModal('employee'));
        
        modal.querySelectorAll('.edit-user-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const userId = e.target.closest('.edit-user-btn').dataset.userid;
                const user = users.find(u => u.id === userId);
                showEditUserModal(user);
            });
        });
        
        // 切换用户状态
        modal.querySelectorAll('.toggle-user-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const userId = e.target.closest('.toggle-user-btn').dataset.userid;
            const user = users.find(u => u.id === userId);
            
            if (confirm(`确定要${user.is_active ? '禁用' : '启用'}用户 "${user.name}" 吗？`)) {
              utils.setButtonLoading(btn, true);
              const result = await window.electronAPI.toggleUserStatus(userId);
              utils.setButtonLoading(btn, false);
              
              if (result.success) {
                utils.showGlobalNotification('操作成功', 'success');
                document.getElementById('userManagementModal')?.remove();
                showUserManagementModal();
              } else {
                utils.showGlobalNotification('操作失败: ' + result.message, 'error');
              }
            }
          });
        });

        // 删除用户
        modal.querySelectorAll('.delete-user-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const userId = e.target.closest('.delete-user-btn').dataset.userid;
            const user = users.find(u => u.id === userId);
            
            if (confirm(`确定要删除用户 "${user.name}" 吗？此操作不可恢复！`)) {
              utils.setButtonLoading(btn, true);
              const result = await window.electronAPI.deleteUser(userId);
              utils.setButtonLoading(btn, false);
              
              if (result.success) {
                utils.showGlobalNotification('删除成功', 'success');
                document.getElementById('userManagementModal')?.remove();
                showUserManagementModal();
              } else {
                utils.showGlobalNotification('删除失败: ' + result.message, 'error');
              }
            }
          });
        });

        // 点击外部关闭
       modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                utils.setButtonLoading(document.getElementById('userManagementBtn'), false);
                modal.remove();
            }
        });

        utils.setButtonLoading(document.getElementById('userManagementBtn'), false);
    }

    // 显示创建用户模态框
    function showCreateUserModal(role) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>创建${utils.getRoleName(role)}</h2>
                    <span class="close">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>姓名</label>
                        <input type="text" id="userName" placeholder="请输入姓名" autocomplete="off" data-field="userName">
                        <div class="input-error" id="userNameError"></div>
                    </div>
                    <div class="form-group">
                        <label>邮箱</label>
                        <input type="email" id="userEmail" placeholder="请输入邮箱" autocomplete="off" data-field="userEmail">
                        <div class="input-error" id="userEmailError"></div>
                    </div>
                    <div class="form-group">
                        <label>密码</label>
                        <input type="password" id="userPassword" placeholder="请输入密码（至少6位）" autocomplete="new-password" data-field="userPassword">
                        <div class="input-error" id="userPasswordError"></div>
                    </div>
                    <div class="form-group">
                        <label>门店数量限制</label>
                        <input type="number" id="storeLimit" placeholder="请输入门店数量限制" value="10" min="1" data-field="storeLimit">
                        <div class="input-error" id="storeLimitError"></div>
                    </div>
                    <div class="form-actions">
                        <button class="btn-quxiao" id="cancelCreateUserBtn">取消</button>
                        <button class="btn-primary" id="confirmCreateUserBtn">创建</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);

        const closeModal = () => {
            // 重置按钮状态
            const confirmBtn = modal.querySelector('#confirmCreateUserBtn');
            utils.setButtonLoading(confirmBtn, false);
            modal.remove();
        };
        
        modal.querySelector('.close').addEventListener('click', closeModal);
        modal.querySelector('#cancelCreateUserBtn').addEventListener('click', closeModal);
        
        // 添加输入事件监听以清除错误
        modal.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => {
                const fieldName = input.id.replace('Error', '');
                utils.clearFieldError(fieldName + 'Error');
            });
        });
        
        modal.querySelector('#confirmCreateUserBtn').addEventListener('click', async () => {
            const userName = document.getElementById('userName').value.trim();
            const userEmail = document.getElementById('userEmail').value.trim();
            const userPassword = document.getElementById('userPassword').value;
            const storeLimit = parseInt(document.getElementById('storeLimit').value) || 10;
            
            // 清除所有错误提示
            utils.clearFieldError('userNameError');
            utils.clearFieldError('userEmailError');
            utils.clearFieldError('userPasswordError');
            utils.clearFieldError('storeLimitError');
            
            // 验证所有字段
            let hasError = false;
            
            if (!userName || userName.length < 2) {
                utils.showFieldError('userNameError', '姓名至少需要2个字符');
                hasError = true;
            }
            
            if (!userEmail || !utils.validateEmail(userEmail)) {
                utils.showFieldError('userEmailError', '请输入有效的邮箱地址');
                hasError = true;
            }
            
            if (!userPassword || userPassword.length < 6) {
                utils.showFieldError('userPasswordError', '密码长度至少6位');
                hasError = true;
            }
            
            if (isNaN(storeLimit) || storeLimit < 1) {
                utils.showFieldError('storeLimitError', '门店数量限制必须大于0');
                hasError = true;
            }
            
            if (hasError) {
                return;
            }

            const userData = {
                name: userName,
                email: userEmail,
                password: userPassword,
                role: role,
                store_limit: storeLimit
            };

            utils.setButtonLoading(modal.querySelector('#confirmCreateUserBtn'), true);
            
            try {
                const result = await window.electronAPI.createUser(userData);
                
                if (result.success) {
                    utils.showGlobalNotification('创建成功', 'success');
                    closeModal();
                    loadInitialData(); // 重新加载用户数据（含缓存清理后的数据）
                    updateEmployeeFilter(users); // 强制刷新下拉框
                    // 刷新用户管理界面
                    const userManagementModal = document.getElementById('userManagementModal');
                    if (userManagementModal) {
                        userManagementModal.remove();
                        showUserManagementModal();
                    }
                } else {
                    utils.showGlobalNotification('创建失败: ' + (result.message || '未知错误'), 'error');
                }
            } catch (error) {
                console.error('创建用户错误:', error);
                utils.showGlobalNotification('创建用户过程中发生错误', 'error');
            } finally {
                utils.setButtonLoading(modal.querySelector('#confirmCreateUserBtn'), false);
            }
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
        
        // 辅助聚焦到第一个输入框
        setTimeout(() => {
            document.getElementById('userName').focus();
        }, 100);
    }

    // 显示编辑用户模态框
    function showEditUserModal(user) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>编辑用户</h2>
                    <span class="close">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>姓名</label>
                        <input type="text" id="editUserName" value="${user.name}" placeholder="请输入姓名" data-field="editUserName">
                        <div class="input-error" id="editUserNameError"></div>
                    </div>
                    <div class="form-group">
                        <label>邮箱</label>
                        <input type="email" id="editUserEmail" value="${user.email}" placeholder="请输入邮箱" readonly data-field="editUserEmail">
                    </div>
                    <div class="form-group">
                        <label>新密码 (留空则不修改)</label>
                        <input type="password" id="editUserPassword" placeholder="请输入新密码（至少6位）" data-field="editUserPassword">
                        <div class="input-error" id="editUserPasswordError"></div>
                    </div>
                    <div class="form-group">
                        <label>门店数量限制</label>
                        <input type="number" id="editStoreLimit" value="${user.store_limit || 10}" placeholder="请输入门店数量限制" min="1" data-field="editStoreLimit">
                        <div class="input-error" id="editStoreLimitError"></div>
                    </div>
                    <div class="form-actions">
                        <button class="btn-quxiao" id="cancelEditUserBtn">取消</button>
                        <button class="btn-primary" id="confirmEditUserBtn">保存</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);

        const closeModal = () => {
            // 重置按钮状态
            const confirmBtn = modal.querySelector('#confirmEditUserBtn');
            utils.setButtonLoading(confirmBtn, false);
            modal.remove();
        };
        
        modal.querySelector('.close').addEventListener('click', closeModal);
        modal.querySelector('#cancelEditUserBtn').addEventListener('click', closeModal);
        
        // 添加输入事件监听以清除错误
        modal.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => {
                const fieldName = input.id.replace('Error', '');
                utils.clearFieldError(fieldName + 'Error');
            });
        });
        
        modal.querySelector('#confirmEditUserBtn').addEventListener('click', async () => {
            const name = document.getElementById('editUserName').value.trim();
            const password = document.getElementById('editUserPassword').value;
            const storeLimit = parseInt(document.getElementById('editStoreLimit').value) || 10;
            const email = document.getElementById('editUserEmail').value; // 获取邮箱
            // 清除所有错误提示
            utils.clearFieldError('editUserNameError');
            utils.clearFieldError('editUserPasswordError');
            utils.clearFieldError('editStoreLimitError');
            
            if (!name) {
                utils.showFieldError('editUserNameError', '请填写姓名');
                return;
            }
            
           // 只有在提供了密码时才验证密码长度
    if (password && password.length < 6) {
        utils.showFieldError('editUserPasswordError', '密码长度至少6位');
        return;
    }

            utils.setButtonLoading(modal.querySelector('#confirmEditUserBtn'), true);
            
            try {
                const userData = {
                    id: user.id,
                    name: name,
                    email: email, // 确保包含邮箱
                    store_limit: storeLimit
                };
                
                  // 只有在用户输入了新密码时才包含密码字段
        if (password && password.trim() !== '') {
            userData.password = password;
        }
                
                const result = await window.electronAPI.updateUser(userData);
                
                if (result.success) {
                    utils.showGlobalNotification('用户信息更新成功', 'success');
                    closeModal();
                    loadInitialData();
                    updateEmployeeFilter(users);
                    document.getElementById('userManagementModal')?.remove();
                    showUserManagementModal();
                } else {
                    utils.showGlobalNotification('更新失败: ' + result.message, 'error');
                }
            } catch (error) {
                console.error('更新错误:', error);
                utils.showGlobalNotification('更新过程中发生错误', 'error');
            } finally {
                utils.setButtonLoading(modal.querySelector('#confirmEditUserBtn'), false);
            }
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }

    // 显示转移门店模态框
    function showTransferStoreModal(storeId, isBatch = false) { 
    // 先关闭所有可能打开的模态框
    document.querySelectorAll('.modal').forEach(modal => {
        if (modal.style.display === 'block' && modal.id !== 'userManagementModal') {
            modal.style.display = 'none';
        }
    }); 
    
    // 获取目标用户列表
    let targetUsers = [];
    
    // 所有用户都可以转移，但员工只能转移给所属管理员及管理员名下的其他员工
    if (currentUser.role === 'super_admin') {
        // 超级管理员可以转移给所有用户
        targetUsers = users.filter(u => u.id !== currentUser.id && u.is_active !== false);
    } else if (currentUser.role === 'admin') {
        // 管理员可以转移给自己或名下员工
        targetUsers = users.filter(u => 
            (u.id === currentUser.id || u.admin_id === currentUser.id) && 
            u.is_active !== false
        );
    } else if (currentUser.role === 'employee') {
        // 员工只能转移给所属管理员及管理员名下的其他员工
        const adminId = currentUser.admin_id;
        if (adminId) {
            targetUsers = users.filter(u => 
                (u.id === adminId || u.admin_id === adminId) && 
                u.id !== currentUser.id && // 不能转移给自己
                u.is_active !== false
            );
        }
    }
    
    if (targetUsers.length === 0) {
        utils.showGlobalNotification('没有可转移的目标用户', 'warning');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>${isBatch ? '批量转移' : '转移'}门店</h2>
                <span class="close">&times;</span>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>选择目标用户</label>
                    <select id="targetUser" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                        ${targetUsers.map(user => `
                            <option value="${user.id}">${user.name} (${utils.getRoleName(user.role)})</option>
                        `).join('')}
                    </select>
                </div>
                <div class="form-actions">
                    <button class="btn-quxiao" id="cancelTransferBtn">取消</button>
                    <button class="btn-primary" id="confirmTransferBtn">确认转移</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => {
        // 重置按钮状态
        const confirmBtn = modal.querySelector('#confirmTransferBtn');
        utils.setButtonLoading(confirmBtn, false);
        modal.remove();
    };
    
    modal.querySelector('.close').addEventListener('click', closeModal);
    modal.querySelector('#cancelTransferBtn').addEventListener('click', closeModal);
    
    modal.querySelector('#confirmTransferBtn').addEventListener('click', async () => {
        const targetUserId = document.getElementById('targetUser').value;
        
        utils.setButtonLoading(modal.querySelector('#confirmTransferBtn'), true);
        
        try {
            if (isBatch) {
                const selectedIds = Array.from(document.querySelectorAll('.store-checkbox:checked'))
                    .map(checkbox => checkbox.dataset.id);
                
                if (selectedIds.length === 0) {
                    utils.showGlobalNotification('请选择要转移的门店', 'warning');
                    utils.setButtonLoading(modal.querySelector('#confirmTransferBtn'), false);
                    return;
                }
                
                // 检查目标用户是否已有这些门店
                const checkResult = await window.electronAPI.checkStoresOwnership({
                    storeIds: selectedIds,
                    targetUserId: targetUserId
                });
                
                if (checkResult.success && checkResult.data.hasOwnership) {
                    utils.showGlobalNotification(`目标用户已拥有 ${checkResult.data.count} 个选中的门店，请重新选择`, 'warning');
                    utils.setButtonLoading(modal.querySelector('#confirmTransferBtn'), false);
                    return;
                }
                
                const result = await window.electronAPI.batchTransferStores({
                    storeIds: selectedIds,
                    targetUserId: targetUserId
                });
                
                if (result.success) {
                    utils.showGlobalNotification(`成功转移 ${selectedIds.length} 个门店`, 'success');
                    closeModal();
                    toggleBatchMode(false);
                    await loadStores();
                } else {
                    utils.showGlobalNotification('批量转移失败: ' + result.message, 'error');
                }
            } else {
                // 检查目标用户是否已有此门店
                const checkResult = await window.electronAPI.checkStoreOwnership({
                    storeId,
                    targetUserId: targetUserId
                });
                
                if (checkResult.success && checkResult.data.hasOwnership) {
                    utils.showGlobalNotification('目标用户已拥有此门店', 'warning');
                    utils.setButtonLoading(modal.querySelector('#confirmTransferBtn'), false);
                    return;
                }
                
                const result = await window.electronAPI.transferStore({
                    storeId,
                    newOwnerId: targetUserId
                });
                
                if (result.success) {
                    utils.showGlobalNotification('转移成功', 'success');
                    closeModal();
                    await loadStores();
                } else {
                    utils.showGlobalNotification('转移失败: ' + result.message, 'error');
                }
            }
        } catch (error) {
            console.error('转移错误:', error);
            utils.showGlobalNotification('转移失败: ' + error.message, 'error');
        } finally {
            utils.setButtonLoading(modal.querySelector('#confirmTransferBtn'), false);
        }
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
}

    // 显示共享门店模态框
// 显示共享门店模态框
function showShareStoreModal(storeId, isBatch = false) {
    // 先关闭所有可能打开的模态框
    document.querySelectorAll('.modal').forEach(modal => {
        if (modal.style.display === 'block' && modal.id !== 'userManagementModal') {
            modal.style.display = 'none';
        }
    });
    
    // 获取目标用户列表
    let targetUsers = [];
    
    // 所有用户都可以共享，但员工只能共享给所属管理员及管理员名下的其他员工
    if (currentUser.role === 'super_admin') {
        // 超级管理员可以共享给所有用户
        targetUsers = users.filter(u => u.id !== currentUser.id && u.is_active !== false);
    } else if (currentUser.role === 'admin') {
        // 管理员可以共享给自己或名下员工
        targetUsers = users.filter(u => 
            (u.id === currentUser.id || u.admin_id === currentUser.id) && 
            u.is_active !== false
        );
    } else if (currentUser.role === 'employee') {
        // 员工只能共享给所属管理员及管理员名下的其他员工
        const adminId = currentUser.admin_id;
        if (adminId) {
            targetUsers = users.filter(u => 
                (u.id === adminId || u.admin_id === adminId) && 
                u.id !== currentUser.id && // 不能共享给自己
                u.is_active !== false
            );
        }
    }
    
    if (targetUsers.length === 0) {
        utils.showGlobalNotification('没有可共享的目标用户', 'warning');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>${isBatch ? '批量共享' : '共享'}门店</h2>
                <span class="close">&times;</span>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>选择目标用户</label>
                    <select id="targetUser" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                        ${targetUsers.map(user => `
                            <option value="${user.id}">${user.name} (${utils.getRoleName(user.role)})</option>
                        `).join('')}
                    </select>
                </div>
              
                <div class="form-actions">
                    <button class="btn-quxiao" id="cancelShareBtn">取消</button>
                    <button class="share-store" id="confirmShareBtn">确认共享</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => {
        // 重置按钮状态
        const confirmBtn = modal.querySelector('#confirmShareBtn');
        utils.setButtonLoading(confirmBtn, false);
        modal.remove();
    };
    
    modal.querySelector('.close').addEventListener('click', closeModal);
    modal.querySelector('#cancelShareBtn').addEventListener('click', closeModal);
    
    modal.querySelector('#confirmShareBtn').addEventListener('click', async () => {
    const targetUserId = modal.querySelector('#targetUser').value;
    
    // 安全地获取复选框状态
    const canEditCheckbox = modal.querySelector('#canEditCheckbox');
    let canEdit = false;
    
    if (canEditCheckbox) {
        canEdit = canEditCheckbox.checked;
    } else {
        console.warn('复选框元素未找到，使用默认值 false');
        canEdit = false;
    }
    
    // 根据用户角色强制设置权限
    if (currentUser.role !== 'super_admin') {
        canEdit = false; // 非超级管理员强制不允许编辑
    }
    
    utils.setButtonLoading(modal.querySelector('#confirmShareBtn'), true);
    
    try {
        if (isBatch) {
            const selectedIds = Array.from(document.querySelectorAll('.store-checkbox:checked'))
                .map(checkbox => checkbox.dataset.id);
            
            if (selectedIds.length === 0) {
                utils.showGlobalNotification('请选择要共享的门店', 'warning');
                utils.setButtonLoading(modal.querySelector('#confirmShareBtn'), false);
                return;
            }
            
            // 检查目标用户是否已有这些门店的共享权限
            const checkResult = await window.electronAPI.checkStoresShared({
                storeIds: selectedIds,
                targetUserId: targetUserId
            });
            
            if (checkResult.success && checkResult.data.isShared) {
                utils.showGlobalNotification(`目标用户已拥有 ${checkResult.data.count} 个选中门店的共享权限，请重新选择`, 'warning');
                utils.setButtonLoading(modal.querySelector('#confirmShareBtn'), false);
                return;
            }
            
            const result = await window.electronAPI.batchShareStores({
                storeIds: selectedIds,
                targetUserId: targetUserId,
                canEdit: canEdit
            });
            
            if (result.success) {
                utils.showGlobalNotification(`成功共享 ${selectedIds.length} 个门店`, 'success');
                closeModal();
                toggleBatchMode(false);
                
                // 关键修改：立即刷新门店列表
                await loadStores();
            } else {
                utils.showGlobalNotification('批量共享失败: ' + result.message, 'error');
            }
        } else {
            // 检查目标用户是否已有此门店的共享权限
            const checkResult = await window.electronAPI.checkStoreShared({
                storeId,
                targetUserId: targetUserId
            });
            
            if (checkResult.success && checkResult.data.isShared) {
                utils.showGlobalNotification('目标用户已拥有此门店的共享权限', 'warning');
                utils.setButtonLoading(modal.querySelector('#confirmShareBtn'), false);
                return;
            }
            
            const result = await window.electronAPI.shareStore({
                storeId,
                targetUserId: targetUserId,
                canEdit: canEdit
            });
            
            if (result.success) {
                utils.showGlobalNotification('共享成功', 'success');
                closeModal();
                
                // 关键修改：立即刷新门店列表
                await loadStores();
            } else {
                utils.showGlobalNotification('共享失败: ' + result.message, 'error');
            }
        }
    } catch (error) {
        console.error('共享错误:', error);
        utils.showGlobalNotification('共享失败: ' + error.message, 'error');
    } finally {
        utils.setButtonLoading(modal.querySelector('#confirmShareBtn'), false);
    }
});
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
}
    
    // 设置事件监听器
    function setupEventListeners() {
    document.querySelector('[data-platform="all"]').addEventListener('click', () => {
        currentFilter = 'all';
        searchQuery = ''; // 同时重置搜索查询
        searchInput.value = ''; // 清空搜索输入框
        clearSearchBtn.style.display = 'none'; // 隐藏清除搜索按钮
        
        // 重置平台筛选下拉框
        const platformFilter = document.getElementById('platformFilter');
        if (platformFilter) {
            platformFilter.value = 'all';
        }
        
        // 重置员工筛选下拉框
        const employeeFilter = document.getElementById('employeeFilter');
        if (employeeFilter) {
            employeeFilter.value = '';
        }
        selectedEmployeeId = ''; // 重置员工筛选变量
        
        // 重置分类筛选下拉框
        const categoryFilter = document.getElementById('categoryFilter');
        if (categoryFilter) {
            categoryFilter.value = '';
        }
        selectedCategory = ''; // 重置分类筛选变量
        
        loadStores();
    });
        addStoreBtn.addEventListener('click', () => {
            utils.setButtonLoading(addStoreBtn, true);
            openAddStoreModal();
            utils.setButtonLoading(addStoreBtn, false);
        });

        closeModalBtn.addEventListener('click', closeAddStoreModal);
        closeImportBtn.addEventListener('click', closeImportModal);
        cancelAddBtn.addEventListener('click', closeAddStoreModal);
        cancelImportBtn.addEventListener('click', closeImportModal);

        confirmAddBtn.addEventListener('click', saveStore);
        confirmImportBtn.addEventListener('click', importData);

        importBtn.addEventListener('click', () => {
            utils.setButtonLoading(importBtn, true);
            openImportModal();
            utils.setButtonLoading(importBtn, false);
        });

        exportBtn.addEventListener('click', exportData);

        // 平台选择
        platformOptions.forEach(option => {
            option.addEventListener('click', () => {
                platformOptions.forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');
                selectedPlatform = option.dataset.platform;
            });
        });

         // 初始化清除按钮的显示状态
        clearSearchBtn.style.display = searchInput.value ? 'block' : 'none';

        // 搜索功能
        searchBtn.addEventListener('click', () => {
            utils.setButtonLoading(searchBtn, true);
            searchQuery = searchInput.value.trim();
            loadStores();
            utils.setButtonLoading(searchBtn, false);
        });

        searchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                utils.setButtonLoading(searchBtn, true);
                searchQuery = searchInput.value.trim();
                loadStores();
                utils.setButtonLoading(searchBtn, false);
            }
        });

        // 清除搜索
        searchInput.addEventListener('input', () => {
            clearSearchBtn.style.display = searchInput.value ? 'block' : 'none';
        });

        clearSearchBtn.addEventListener('click', () => {
            searchQuery = '';
            searchInput.value = '';
            clearSearchBtn.style.display = 'none';
            loadStores();
        });

        // 点击模态框外部关闭
        window.addEventListener('click', (e) => {
            if (e.target === addStoreModal) {
                closeAddStoreModal();
            }
            if (e.target === importModal) {
                closeImportModal();
            }
        });

        // 定期检查窗口状态
        setInterval(async () => {
            if (currentUser) {
                await updateStoreStatusOnly();
            }
        }, 3000);
        
        // 添加输入框事件监听器以清除错误
        setupInputErrorClearing();
    }
    
    // 设置输入框错误清除
    function setupInputErrorClearing() {
    // 门店表单
    if (storeNameInput) {
        storeNameInput.addEventListener('input', () => {
            utils.clearFieldError('storeNameError');
            storeNameInput.classList.remove('error');
        });
    }
    
    if (contactPersonInput) {
        contactPersonInput.addEventListener('input', () => {
            utils.clearFieldError('contactPersonError');
            contactPersonInput.classList.remove('error');
        });
    }
    
    if (contactPhoneInput) {
        contactPhoneInput.addEventListener('input', () => {
            utils.clearFieldError('contactPhoneError');
            contactPhoneInput.classList.remove('error');
        });
    }
    
    // 新增地址和分类字段
    const storeProvinceInput = document.getElementById('storeProvince');
    const storeCityInput = document.getElementById('storeCity');
    const storeCategoryInput = document.getElementById('storeCategory');
    
    if (storeProvinceInput) {
        storeProvinceInput.addEventListener('input', () => {
            utils.clearFieldError('storeProvinceError');
            storeProvinceInput.classList.remove('error');
        });
    }
    
    if (storeCityInput) {
        storeCityInput.addEventListener('input', () => {
            utils.clearFieldError('storeCityError');
            storeCityInput.classList.remove('error');
        });
    }
    
    // 导入表单
    if (importDataTextarea) {
        importDataTextarea.addEventListener('input', () => {
            utils.clearFieldError('importDataError');
            importDataTextarea.classList.remove('error');
        });
    }
 // 批量导入功能
  batchImportBtn.addEventListener('click', openBatchImportModal);
  closeBatchImportBtn.addEventListener('click', closeBatchImportModal);
  downloadTemplateBtn.addEventListener('click', downloadExcelTemplate);
  importExcelBtn.addEventListener('click', importExcelFile);
  autoLoginBtn.addEventListener('click', startAutoLogin);
  
  // 监听登录进度更新
  window.electronAPI.onLoginProgressUpdate((event, progress) => {
    updateLoginProgress(progress);
  });
}
// 打开批量导入模态框
function openBatchImportModal() {
  resetBatchImportModal();
  batchImportModal.style.display = 'block';
}

// 关闭批量导入模态框
function closeBatchImportModal() {
  batchImportModal.style.display = 'none';
  window.electronAPI.removeLoginProgressListener();
}

// 重置批量导入模态框
function resetBatchImportModal() {
  excelFileInput.value = '';
  loginProgress.style.display = 'none';
  loginResults.innerHTML = '';
  importExcelBtn.disabled = true;
  autoLoginBtn.disabled = true;
}

// 下载Excel模板
async function downloadExcelTemplate() {
    utils.setButtonLoading(downloadTemplateBtn, true);

    try {
        const result = await window.electronAPI.downloadExcelTemplate();
        if (result.success) {
            // 显示完整的文件路径信息
            const fileInfo = result.data;
            const message = `
                <div style="text-align: left;">
                    <strong>模板下载成功！</strong><br>
                    文件名: ${fileInfo.fileName}<br>
                    保存位置: ${fileInfo.directory}<br>
                    完整路径: <span style="color: #666; font-size: 12px;">${fileInfo.fullPath}</span>
                </div>
            `;
            
            // 使用更详细的通知
            utils.showGlobalNotification(message, 'success', 5000); // 显示5秒
            
            // 同时在控制台打印路径，方便调试
            console.log('模板下载路径:', fileInfo.fullPath);
        } else {
            utils.showGlobalNotification('下载失败：' + result.message, 'error');
        }
    } catch (error) {
        utils.showGlobalNotification('下载模板失败：' + error.message, 'error');
    } finally {
        utils.setButtonLoading(downloadTemplateBtn, false);
    }
}

// 导入Excel文件
// 导入Excel文件
async function importExcelFile() {
  const file = excelFileInput.files[0];
  if (!file) {
    utils.showGlobalNotification('请选择Excel文件', 'warning');
    return;
  }

  utils.setButtonLoading(importExcelBtn, true);

  try {
    const result = await window.electronAPI.batchImportStores(file.path);
    if (result.success) {
      // 更新显示信息，包含新增和更新数量
      utils.showGlobalNotification(
        `导入完成: 新增 ${result.data.success} 个, 更新 ${result.data.updated} 个, 失败 ${result.data.failed} 个`, 
        'success'
      );
      
      // 显示失败详情
      if (result.data.errors.length > 0) {
        loginResults.innerHTML = `
          <div class="login-results">
            <h4>导入失败详情:</h4>
            <ul>
              ${result.data.errors.map(error => `<li>${error}</li>`).join('')}
            </ul>
          </div>
        `;
      }
      
      // 刷新门店列表
      await loadStores();
      autoLoginBtn.disabled = false;
    } else {
      utils.showGlobalNotification('导入失败: ' + result.message, 'error');
    }
  } catch (error) {
    utils.showGlobalNotification('导入失败: ' + error.message, 'error');
  } finally {
    utils.setButtonLoading(importExcelBtn, false);
  }
}

// 开始一键登录
async function startAutoLogin() {
  // 获取待登录的门店（login_status为pending）
  const pendingStores = stores.filter(store => store.login_status === 'pending');
  
  if (pendingStores.length === 0) {
    utils.showGlobalNotification('没有需要登录的门店', 'warning');
    return;
  }

  utils.setButtonLoading(autoLoginBtn, true);
  loginProgress.style.display = 'block';
  progressBar.style.width = '0%';
  progressText.textContent = '开始登录...';

  try {
    const storeIds = pendingStores.map(store => store.id);
    const result = await window.electronAPI.batchAutoLogin({
      storeIds: storeIds,
      batchSize: 3 // 每次处理3个门店
    });

    if (result.success) {
      utils.showGlobalNotification(`一键登录完成: 成功 ${result.data.success} 个, 失败 ${result.data.failed} 个`, 'success');
      
      // 显示详细结果
      displayLoginResults(result.data.details);
    } else {
      utils.showGlobalNotification('一键登录失败: ' + result.message, 'error');
    }
  } catch (error) {
    utils.showGlobalNotification('一键登录失败: ' + error.message, 'error');
  } finally {
    utils.setButtonLoading(autoLoginBtn, false);
  }
}

// 更新登录进度
function updateLoginProgress(progress) {
  const percent = Math.round((progress.completed / progress.total) * 100);
  progressBar.style.width = percent + '%';
  progressText.textContent = `已完成 ${progress.completed}/${progress.total} 个门店登录`;
  
  // 显示批次结果
  if (progress.batchResults) {
    displayBatchResults(progress.batchResults);
  }
}

// 显示批次结果
function displayBatchResults(batchResults) {
  let html = '<div class="batch-results">';
  
  batchResults.forEach(result => {
    if (result) {
      const statusClass = result.success ? 'success' : 'error';
      html += `
        <div class="login-result ${statusClass}">
          <span class="store-name">${result.storeName}</span>
          <span class="status">${result.success ? '成功' : '失败'}</span>
          <span class="message">${result.message || result.error}</span>
        </div>
      `;
    }
  });
  
  html += '</div>';
  loginResults.innerHTML = html;
}

// 显示最终登录结果
function displayLoginResults(details) {
  let html = '<div class="final-results">';
  html += '<h4>登录结果详情:</h4>';
  
  const successResults = details.filter(d => d.success);
  const failedResults = details.filter(d => !d.success);
  
  if (successResults.length > 0) {
    html += '<div class="success-section">';
    html += '<h5>登录成功:</h5>';
    successResults.forEach(result => {
      html += `<div class="result-item success">${result.storeName} - ${result.platform}</div>`;
    });
    html += '</div>';
  }
  
  if (failedResults.length > 0) {
    html += '<div class="failed-section">';
    html += '<h5>登录失败:</h5>';
    failedResults.forEach(result => {
      html += `<div class="result-item error">${result.storeName} - ${result.platform}: ${result.error}</div>`;
    });
    html += '</div>';
  }
  
  html += '</div>';
  loginResults.innerHTML = html;
}

// 在文件选择时启用导入按钮
excelFileInput.addEventListener('change', () => {
  importExcelBtn.disabled = !excelFileInput.files[0];
});
    // 只更新门店状态，不重新渲染整个列表
    async function updateStoreStatusOnly() {
        try {
            const previousOpenWindows = Array.isArray(openWindows) ? [...openWindows] : [];
            const result = await window.electronAPI.getOpenWindows();
            
            if (result.success && Array.isArray(result.data)) {
                openWindows = result.data;
                
                // 检查状态是否有变化
                const hasChanged = JSON.stringify(previousOpenWindows) !== JSON.stringify(openWindows);
                
                if (hasChanged) {
                    document.querySelectorAll('.store-card').forEach(card => {
                        const storeId = card.dataset.id;
                        const isOpen = Array.isArray(openWindows) && openWindows.includes(storeId);
                        
                        // 更新状态徽章
                        const statusBadge = card.querySelector('.status-badge');
                        if (statusBadge) {
                            statusBadge.textContent = isOpen ? '已打开' : '已关闭';
                            statusBadge.className = `status-badge ${isOpen ? '' : 'closed'}`;
                        }
                        
                        // 更新按钮文本
                        const openBtn = card.querySelector('.open-store');
                        if (openBtn) {
                            openBtn.textContent = isOpen ? '查看门店' : '打开后台';
                        }
                        
                        // 更新关闭按钮显示
                        const closeBtn = card.querySelector('.close-store');
                        if (closeBtn) {
                            closeBtn.style.display = isOpen ? 'block' : 'none';
                        }
                        
                        // 更新卡片样式
                        card.classList.toggle('open', isOpen);
                    });
                }
            }
        } catch (error) {
            console.error('更新门店状态失败:', error);
        }
    }

    // 实用工具相关函数
    // 初始化工具
    function initTools() {
        loadTools();
    }

    // 加载工具
    function loadTools() {
        let customTools = [];
        try {
            const storedTools = localStorage.getItem('customTools');
            if (storedTools) {
                customTools = JSON.parse(storedTools);
            }
        } catch (error) {
            console.error('加载自定义工具失败:', error);
        }
        
        renderTools([...presetTools, ...customTools]);
    }

    // 渲染工具卡片
    function renderTools(tools) {
    toolsContainer.innerHTML = '';
    
    if (tools.length === 0) {
        toolsContainer.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <p>暂无工具，点击"添加自定义工具"按钮添加第一个工具</p>
            </div>
        `;
        return;
    }
    
    tools.forEach(tool => {
        const toolCard = document.createElement('div');
        toolCard.className = 'tool-card';
        toolCard.innerHTML = `
            ${tool.isPreset ? '<span class="preset-badge">预设</span>' : ''}
            ${!tool.isPreset ? `
                <button class="delete-tool" data-id="${tool.id}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            ` : ''}
            <div class="tool-header">
                <div class="tool-name">${tool.name}</div>
            </div>
            <div class="tool-description">${tool.description || '暂无描述'}</div>
            <div class="translation-hint">
                <small>提示: 打开后右键选择"翻译成中文"</small>
            </div>
            <div class="tool-actions">
                <button class="btn-primary open-tool" data-url="${tool.url}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                    <span>打开工具</span>
                </button>
            </div>
        `;
        
        toolsContainer.appendChild(toolCard);
    });
    
    // 添加事件监听
    addToolEventListeners();
}

    // 添加工具事件监听
    function addToolEventListeners() {
        // 打开工具
        document.querySelectorAll('.open-tool').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const url = e.target.closest('.open-tool').dataset.url;
                openTool(url);
            });
        });
        
        // 删除自定义工具
        document.querySelectorAll('.delete-tool').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const toolId = e.target.closest('.delete-tool').dataset.id;
                deleteCustomTool(toolId);
            });
        });
    }

function openTool(url) {
  // 直接在新标签页中打开工具网址
  window.open(url, '_blank');
}

    // 打开添加工具模态框
    function openAddToolModal() {
        // 清空表单
        document.getElementById('toolName').value = '';
        document.getElementById('toolUrl').value = '';
        document.getElementById('toolDescription').value = '';
        
        // 清除错误提示
        utils.clearFieldError('toolNameError');
        utils.clearFieldError('toolUrlError');
        
        addToolModal.style.display = 'block';
    }

    // 关闭添加工具模态框
    function closeAddToolModal() {
        addToolModal.style.display = 'none';
    }

    // 保存自定义工具
    function saveCustomTool() {
        const name = document.getElementById('toolName').value.trim();
        const url = document.getElementById('toolUrl').value.trim();
        const description = document.getElementById('toolDescription').value.trim();
        
        // 清除错误提示
        utils.clearFieldError('toolNameError');
        utils.clearFieldError('toolUrlError');
        
        // 验证
        let hasError = false;
        
        if (!name) {
            utils.showFieldError('toolNameError', '请输入工具名称');
            hasError = true;
        }
        
        if (!url) {
            utils.showFieldError('toolUrlError', '请输入工具网址');
            hasError = true;
        } else if (!isValidUrl(url)) {
            utils.showFieldError('toolUrlError', '请输入有效的网址');
            hasError = true;
        }
        
        if (hasError) return;
        
        // 获取现有工具
        let customTools = [];
        try {
            const storedTools = localStorage.getItem('customTools');
            if (storedTools) {
                customTools = JSON.parse(storedTools);
            }
        } catch (error) {
            console.error('读取自定义工具失败:', error);
        }
        
        // 添加新工具
        const newTool = {
            id: 'custom-' + Date.now(),
            name,
            url,
            description,
            isPreset: false
        };
        
        customTools.push(newTool);
        
        // 保存到本地存储
        try {
            localStorage.setItem('customTools', JSON.stringify(customTools));
            utils.showGlobalNotification('工具添加成功', 'success');
            closeAddToolModal();
            loadTools();
        } catch (error) {
            console.error('保存自定义工具失败:', error);
            utils.showGlobalNotification('保存失败，请重试', 'error');
        }
    }

    // 删除自定义工具
    function deleteCustomTool(toolId) {
        if (confirm('确定要删除这个工具吗？')) {
            try {
                const storedTools = localStorage.getItem('customTools');
                if (storedTools) {
                    let customTools = JSON.parse(storedTools);
                    customTools = customTools.filter(tool => tool.id !== toolId);
                    localStorage.setItem('customTools', JSON.stringify(customTools));
                    utils.showGlobalNotification('工具删除成功', 'success');
                    loadTools();
                }
            } catch (error) {
                console.error('删除自定义工具失败:', error);
            }
        }
    }

    // 验证URL格式
    function isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    // 在setupEventListeners函数中添加事件监听
    function setupUtilityToolEventListeners() {
        // 打开实用工具模态框
        utilityToolsBtn.addEventListener('click', () => {
            utilityToolsModal.style.display = 'block';
            loadTools();
        });
        
        // 关闭实用工具模态框
        closeUtilityBtn.addEventListener('click', () => {
            utilityToolsModal.style.display = 'none';
        });
        
        // 打开添加工具模态框
        addCustomToolBtn.addEventListener('click', openAddToolModal);
        
        // 关闭添加工具模态框
        closeAddToolBtn.addEventListener('click', closeAddToolModal);
        cancelAddToolBtn.addEventListener('click', closeAddToolModal);
        
        // 保存工具
        confirmAddToolBtn.addEventListener('click', saveCustomTool);
        
        // 点击模态框外部关闭
        window.addEventListener('click', (e) => {
            if (e.target === utilityToolsModal) {
                utilityToolsModal.style.display = 'none';
            }
            if (e.target === addToolModal) {
                closeAddToolModal();
            }
        });
    }

    // 初始化
    setupEventListeners();
});