const { app, BrowserWindow, ipcMain, Menu, dialog, session } = require('electron');
// 在 main.js 开头
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const Joi = require('joi');
const bcrypt = require('bcryptjs');
const NodeCache = require('node-cache');
const XLSX = require('xlsx');
const { createWindow, createContextMenu } = require('@electron-toolkit/utils');
globalThis.Headers = require('node-fetch').Headers;

// 设置process.env
process.env.SUPABASE_URL = "https://pwsmicdepzjqsodpedlw.supabase.co";
process.env.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3c21pY2RlcHpqcXNvZHBlZGx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwMTY3MDIsImV4cCI6MjA3MzU5MjcwMn0.GCvgIDRunf6U9SFK8affQr13y9nWmxr3IKbzCb-HPbA";
process.env.SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3c21pY2RlcHpqcXNvZHBlZGx3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODAxNjcwMiwiZXhwIjoyMDczNTkyNzAyfQ.5zOCusteMrUK8x0-LTAmWG1m63WpMWdS7KBsBtYUP88"; // 新增
process.env.ENCRYPTION_KEY = "54b4706bd3ed19acb74318dfd1652a5b7216d63410abfc98d8464820d358fb4e";
process.env.NODE_ENV = "development";



// 只在开发环境加载dotenv
if (process.env.NODE_ENV === 'development') {
  require('dotenv').config();
}

// 环境变量验证
const envVarsSchema = Joi.object({
  SUPABASE_URL: Joi.string().uri().required(),
  SUPABASE_ANON_KEY: Joi.string().required(),
  SUPABASE_SERVICE_KEY: Joi.string().required(), // 新增
  ENCRYPTION_KEY: Joi.string().min(32).required(),
  NODE_ENV: Joi.string().valid('development', 'production').default('production')
}).unknown(true);

const { error: envError, value: envVars } = envVarsSchema.validate(process.env);
if (envError) {
  console.error('环境变量验证失败:', envError.message);
  
  // 应用未就绪时使用同步对话框
  if (app.isReady()) {
    dialog.showErrorBox('配置错误', '环境变量配置不正确，请检查配置');
  } else {
    // 延迟显示错误
    app.whenReady().then(() => {
      dialog.showErrorBox('配置错误', '环境变量配置不正确，请检查配置');
      app.quit();
    });
  }
}

// 初始化Supabase客户端
let supabase; // 常规客户端（使用ANON_KEY）
let supabaseService; // 服务端客户端（使用SERVICE_KEY，可绕过RLS）
let isSupabaseInitialized = false;

// 将初始化代码移到异步函数中
async function initializeSupabase() {
  try {
    const supabaseUrl = envVars.SUPABASE_URL;
    const supabaseKey = envVars.SUPABASE_ANON_KEY;
    const supabaseServiceKey = envVars.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey || !supabaseServiceKey) {
      throw new Error('数据库配置错误，请联系开发者');
    }
    
    // 初始化客户端（代码不变）
    supabase = createClient(supabaseUrl, supabaseKey, {
      db: { schema: 'public' },
      global: { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' } }
    });
    
    supabaseService = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
      db: { schema: 'public' },
      global: { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' } }
    });
    
    // 测试连接
    try {
      const { data, error } = await supabaseService.from('users').select('count').limit(1);
      if (error) throw error;
      
      console.log('Supabase客户端初始化成功');
      isSupabaseInitialized = true;
      return true;
    } catch (error) {
      // 所有数据库错误都显示统一的用户友好提示
      throw new Error('数据库连接失败，请联系开发者');
    }
    
  } catch (error) {
    console.error('Supabase初始化失败:', error);
    
    // 显示统一的错误提示
    const userFriendlyError = '数据库连接失败，请联系开发者';
    
    if (app.isReady()) {
      dialog.showErrorBox('初始化失败', userFriendlyError);
    } else {
      app.whenReady().then(() => {
        dialog.showErrorBox('初始化失败', userFriendlyError);
        app.quit();
      });
    }
    
    app.quit();
    return false;
  }
}
// ==================== 全局变量 ====================
let currentUser = null;
const storeWindows = new Map();
const userDataPath = app.getPath('userData');
const cache = new NodeCache({ 
  stdTTL: 600,
  checkperiod: 120,
  useClones: false
});
const pendingRequests = new Map();
let loginWindow = null;
let mainWindow = null;
let isQuitting = false;
let dashboardWindow = null;

// ==================== 工具函数 ====================
// 修改加密函数
function encryptData(data) {
    try {
        // 确保密钥是32字节
        const keyBuffer = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
        if (keyBuffer.length !== 32) {
            throw new Error('加密密钥必须是64位十六进制字符串(32字节)');
        }
        
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
        let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
        console.error('加密失败:', error);
        return null;
    }
}

// 修改解密函数
function decryptData(encryptedData) {
    try {
        const keyBuffer = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
        if (keyBuffer.length !== 32) {
            throw new Error('加密密钥必须是64位十六进制字符串(32字节)');
        }
        
        const parts = encryptedData.split(':');
        if (parts.length !== 2) {
            throw new Error('无效的加密数据格式');
        }
        
        const iv = Buffer.from(parts[0], 'hex');
        const encryptedText = parts[1];
        
        const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    } catch (error) {
        console.error('解密失败:', error);
        return null;
    }
}
// UUID生成函数
function generateUUID() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return generateUUIDFallback();
}

function generateUUIDFallback() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// UUID验证函数
function isValidUUID(uuid) {
  if (!uuid || typeof uuid !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// 数据校验函数
function validateStore(store) {
  const schema = Joi.object({
    name: Joi.string().min(2).max(50).required(),
    platform: Joi.string().valid('美团', '饿了么', '京东', '淘宝', '天猫', '拼多多', '抖音电商', '饿了么零售', '小红书').required(),
    contact_person: Joi.string().allow('').max(20),
    contact_phone: Joi.string().allow('').pattern(/^1[3-9]\d{9}$/),
    province: Joi.string().allow('').max(20),
    city: Joi.string().allow('').max(20),
    category: Joi.string().valid('快餐简餐', '小吃', '地方菜', '火锅', '烧烤', '海鲜', '全球美食', '零售').allow(''),
    owner_id: Joi.string().required(),
    created_by: Joi.string().required()
  });

  const { error } = schema.validate(store);
  return error ? error.details[0].message : null;
}

// 修改 validateUser 函数，为更新操作创建单独的验证规则
function validateUser(user, isUpdate = false) {
  const schema = Joi.object({
    name: Joi.string().min(2).max(20).required(),
    email: Joi.string().email().required(),
    password: isUpdate ? 
      Joi.string().min(6).optional().allow('') : // 更新时密码可选
      Joi.string().min(6).required(), // 创建时密码必填
    role: Joi.string().valid('super_admin', 'admin', 'employee').required(),
    store_limit: Joi.number().min(1).max(1000).default(10)
  });

  const { error } = schema.validate(user);
  return error ? error.details[0].message : null;
}

// 或者在 update-user 处理器中创建专门的验证函数
function validateUserUpdate(user) {
  const schema = Joi.object({
    id: Joi.string().required(),
    name: Joi.string().min(2).max(20).required(),
    email: Joi.string().email().optional(), // 邮箱改为可选
    password: Joi.string().min(6).optional().allow(''), // 密码可选且允许空字符串
    store_limit: Joi.number().min(1).max(1000).optional()
  });

  const { error } = schema.validate(user);
  return error ? error.details[0].message : null;
}

// 规范化过滤器
function normalizeFilters(filters) {
  const normalized = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value !== null && value !== undefined && value !== '') {
      normalized[key] = value;
    }
  }
  return normalized;
}
// 添加缓存版本控制
const CACHE_VERSION = 'v1';

function generateCacheKey(prefix, id, filters = {}) {
    const normalizedFilters = normalizeFilters(filters);
    return `${CACHE_VERSION}:${prefix}:${id}:${JSON.stringify(normalizedFilters)}`;
}

// 在数据修改操作后清除相关缓存
function clearRelatedCaches(prefix, id) {
    const keys = cache.keys();
    keys.forEach(key => {
        if (key.startsWith(`${CACHE_VERSION}:${prefix}:`) && key.includes(id)) {
            cache.del(key);
        }
    });
}

// 统一错误响应格式
function createErrorResponse(code, message, details = null) {
  return {
    success: false,
    code,
    message,
    details
  };
}

// 统一成功响应格式
function createSuccessResponse(data = null, message = '操作成功') {
  return {
    success: true,
    data,
    message
  };
}

// 通用缓存查询函数
async function cachedQuery(cacheKey, queryFn, ttl = 600) {
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  const result = await queryFn();
  
  if (result.success && result.data) {
    cache.set(cacheKey, result, ttl);
  }
  
  return result;
}


// 清除用户缓存函数（修复：匹配带版本号的缓存键前缀）
function clearUsersCache() {
  const keys = cache.keys(); // 获取所有缓存键
  keys.forEach(key => {
    // 匹配格式："v1:users:xxx"（与 generateCacheKey 生成的用户缓存键一致）
    if (key.startsWith(`${CACHE_VERSION}:users:`)) {
      cache.del(key); // 删除匹配的用户缓存
    }
  });
  console.log('用户相关缓存已清理'); // 可选：调试日志，可删除
}

// 清除门店缓存函数（修复：匹配带版本号的缓存键前缀）
function clearStoresCache() {
  const keys = cache.keys(); // 获取所有缓存键
  keys.forEach(key => {
    // 匹配格式："v1:stores:xxx"（与 generateCacheKey 生成的门店缓存键一致）
    if (key.startsWith(`${CACHE_VERSION}:stores:`)) {
      cache.del(key); // 删除匹配的门店缓存
    }
  });
  console.log('门店相关缓存已清理'); // 可选：调试日志，可删除
}

// 获取管理员创建的所有员工ID
async function getAdminTotalStoreCount(adminId) {
  try {
    const { data: employees, error: empError } = await supabaseService // 使用服务端客户端
      .from('users')
      .select('id')
      .eq('admin_id', adminId)
      .eq('is_active', true);

    if (empError) throw empError;

    const employeeIds = employees ? employees.map(e => e.id) : [];
    employeeIds.push(adminId);

    const { data: stores, error: storeError } = await supabaseService // 使用服务端客户端
      .from('stores')
      .select('id')
      .in('owner_id', employeeIds);

    if (storeError) throw storeError;
    return stores ? stores.length : 0;
  } catch (error) {
    console.error('获取管理员门店总数错误:', error);
    return 0;
  }
}
// ==================== UA管理工具函数 ====================

// 应用默认UA（用于我们的界面窗口）
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';// UA列表（按平台分组）
const platformUserAgents = {
  '美团': [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',

  ],
  '饿了么': [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  

  ],
  '京东': [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',

  ],
  '淘宝': [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
  ],
  '天猫': [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
  ],
  '拼多多': [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
  ],
  '抖音电商': [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
  ],
  '饿了么零售': [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
  ],
  '小红书': [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
  ]
};

// 根据门店ID生成固定UA（确定性算法）
function getStoreSpecificUserAgent(storeId, platform) {
  // 使用更复杂的哈希算法，确保更好的分布
  const crypto = require('crypto');
  const hash = crypto.createHash('md5').update(storeId).digest('hex');
  
  // 将哈希转换为数字
  const numericHash = parseInt(hash.substring(0, 8), 16);
  
  const uaList = platformUserAgents[platform] || platformUserAgents['美团'];
  const index = numericHash % uaList.length;
  
  return uaList[index];
}


// ==================== 窗口管理 ====================
// 创建登录窗口
function createLoginWindow() {
  const loginWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, '../assets/icon.ico'),
    resizable: false,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      disableBlinkFeatures: 'GPU',
      // devTools: isDev ? true : false, // 生产环境禁用开发者工具
      disableBlinkFeatures: 'RemoteDebuggingProtocol', // 禁用远程调试协议
      sandbox: true // 启用沙箱，限制渲染进程权限
    },
    title: '登录 - 荣诚多门店智能管理工具'
  });
// 设置默认UA
  loginWindow.webContents.setUserAgent(DEFAULT_USER_AGENT);
  // 添加CSP安全策略
  loginWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
 "default-src 'self' 'unsafe-inline' data: https: blob:; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob:; " +
            "style-src 'self' 'unsafe-inline' https: blob:; " +
            "img-src 'self' data: https: blob:; " +  // 添加blob:
            "connect-src 'self' https: wss: blob:; " +
            "worker-src 'self' blob:;"+
  "frame-src 'self' https: blob:;"  // 新增这一行
]
      }
    });
  });
  const loginHtmlPath = path.join(__dirname, 'renderer', 'login.html');
  loginWindow.loadFile(loginHtmlPath).catch(error => {
    console.error('加载登录页面失败:', error);
    loginWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
      '<h1>加载失败</h1><p>请重新安装应用或联系支持</p>'
    )}`);
  });

  loginWindow.once('ready-to-show', () => {
    loginWindow.show();
    // if (isDev) loginWindow.webContents.openDevTools();
  });

  loginWindow.on('closed', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      app.quit();
    }
  });

  return loginWindow;
}

// 创建主窗口
function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1500,
    height: 1000,
    icon: path.join(__dirname, '../assets/icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      disableBlinkFeatures: 'GPU',
      // devTools: isDev ? true : false, // 生产环境禁用开发者工具
      disableBlinkFeatures: 'RemoteDebuggingProtocol', // 禁用远程调试协议
      sandbox: true // 启用沙箱，限制渲染进程权限
    },
    title: '荣诚多门店智能管理工具',
    show: false
  });
/// 设置默认UA
  mainWindow.webContents.setUserAgent(DEFAULT_USER_AGENT);
  // 添加CSP安全策略
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
 "default-src 'self' 'unsafe-inline' data: https: blob:; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob:; " +
            "style-src 'self' 'unsafe-inline' https: blob:; " +
            "img-src 'self' data: https: blob:; " +  // 添加blob:
            "connect-src 'self' https: wss: blob:; " +
            "worker-src 'self' blob:;"+
  "frame-src 'self' https: blob:;"  // 新增这一行
]
      }
    });
  });
  const htmlPath = path.join(__dirname, 'renderer', 'index.html');
  mainWindow.loadFile(htmlPath).catch(error => {
    console.error('加载主页面失败:', error);
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
      '<h1>加载失败</h1><p>请重新安装应用或联系支持</p>'
    )}`);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.setMenuBarVisibility(false);
    mainWindow.show();
  // mainWindow.webContents.openDevTools();
  });

  return mainWindow;
}

async function createStoreWindow(store, user) {
  try {
    // 如果是复制窗口，使用不同的会话分区，避免会话冲突
    
    const partition = `persist:store${store.id}`;
    const cachedSession = session.fromPartition(partition);
    // 1. 先恢复会话数据（在加载URL之前）
    const { data: sessionRecord } = await supabaseService
      .from('sessions')
      .select('session_data')
      .eq('store_id', store.id)
      .single();

    let storeUA = null;

    if (sessionRecord && sessionRecord.session_data) {
      const sessionData = decryptData(sessionRecord.session_data);
      
      // 恢复UA一致性
      if (sessionData.userAgent) {
        storeUA = sessionData.userAgent;
        console.log(`从会话数据恢复UA: ${storeUA.substring(0, 60)}...`);
      } else {
        // 如果没有保存的UA，使用固定算法生成
        storeUA = getStoreSpecificUserAgent(store.id, store.platform);
        console.log(`生成固定UA: ${storeUA.substring(0, 60)}...`);
      }
      
      // 恢复 Cookies - 使用正确的平台URL
      if (sessionData.cookies && Array.isArray(sessionData.cookies)) {
        const platformUrl = getPlatformUrl(store.platform);
        
        for (const cookie of sessionData.cookies) {
          try {
            await cachedSession.cookies.set({
              ...cookie,
              url: platformUrl,
              domain: cookie.domain || new URL(platformUrl).hostname
            });
          } catch (cookieError) {
            console.warn('设置cookie失败:', cookieError);
          }
        }
        console.log(`已恢复 ${sessionData.cookies.length} 个cookies`);
      }

      // 恢复 localStorage（在页面加载后执行）
      if (sessionData.localStorage) {
        setTimeout(async () => {
          try {
            await window.webContents.executeJavaScript(`
              if (window.electronAPI && window.electronAPI.setLocalStorageData) {
                window.electronAPI.setLocalStorageData(${JSON.stringify(sessionData.localStorage)})
                  .then(() => console.log('localStorage恢复成功'))
                  .catch(err => console.error('localStorage恢复失败:', err));
              }
            `);
          } catch (error) {
            console.error('执行localStorage恢复脚本失败:', error);
          }
        }, 1000);
      }
    } else {
      // 如果没有会话数据，使用固定算法生成UA
      storeUA = getStoreSpecificUserAgent(store.id, store.platform);
      console.log(`新门店生成固定UA: ${storeUA.substring(0, 60)}...`);
    }

    // 2. 创建窗口配置
    const windowConfig = {
      width: 1200,
      height: 850,
      icon: path.join(__dirname, '../assets/icon.ico'),
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        webSecurity: true,
        
        partition: partition,
        persistent: true,
        sandbox: true,
        preload: path.join(__dirname, 'preload.js'),
        allowRunningInsecureContent: false
      },
      title: `${store.platform} - ${store.name}`,
      show: true,
      backgroundColor: '#ffffff',
      minWidth: 800,
      minHeight: 650,
      acceptFirstMouse: true,
      titleBarStyle: 'default',
      focusable: true,
      alwaysOnTop: false,
      skipTaskbar: false,
      x: undefined,
      y: undefined,
      center: true
    };

    const window = new BrowserWindow(windowConfig);
      console.log(`创建窗口成功: ${store.name}`);

    // 设置固定UA
   
    if (storeUA) {
      await window.webContents.setUserAgent(storeUA);
      console.log(`窗口设置UA: ${storeUA.substring(0, 60)}...`);
    }
    await addNavigationButtons(window, store, user);
   // window.webContents.openDevTools();
 // 新增：锁定窗口标题，阻止页面修改
    const targetTitle = `${store.platform} - ${store.name}`;
    
    const lockWindowTitle = () => {
      if (!window.isDestroyed()) {
        window.setTitle(targetTitle);
      }
    };

    // 监听各种可能修改标题的事件
    window.webContents.on('page-title-updated', (event) => {
      event.preventDefault();
      lockWindowTitle();
    });

    window.webContents.on('dom-ready', () => {
      lockWindowTitle();
    });

    window.webContents.on('did-finish-load', () => {
      lockWindowTitle();
    });

    window.webContents.on('did-navigate', () => {
      lockWindowTitle();
    });

    window.webContents.on('did-navigate-in-page', () => {
      lockWindowTitle();
    });

    // 定时检查并恢复标题（备用方案）
    const titleCheckInterval = setInterval(() => {
      if (window.isDestroyed()) {
        clearInterval(titleCheckInterval);
        return;
      }
      const currentTitle = window.getTitle();
      if (currentTitle !== targetTitle) {
        window.setTitle(targetTitle);
      }
    }, 1000);
    // 添加CSP安全策略
    window.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
 "default-src 'self' 'unsafe-inline' data: https: blob:; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob:; " +
            "style-src 'self' 'unsafe-inline' https: blob:; " +
            "img-src 'self' data: https: blob:; " +  // 添加blob:
            "connect-src 'self' https: wss: blob:; " +
            "worker-src 'self' blob:;"+
  "frame-src 'self' https: blob:;"      
          ]
        }
      });
    });
  
    // 3. 设置权限请求处理
    cachedSession.setPermissionRequestHandler((webContents, permission, callback) => {
      const allowedPermissions = ['clipboard-read', 'clipboard-write', 'notifications'];
      callback(allowedPermissions.includes(permission));
    });

    // 4. 获取平台URL并加载页面
    const url = getPlatformUrl(store.platform);
    console.log(`正在为门店 ${store.name} 加载URL: ${url}`);
    
    // ========== 新增：手动登录会话保存机制 ==========
    
    // 4.1 页面导航完成时检测登录状态
    window.webContents.on('did-navigate', async (event, navigateUrl) => {
      try {
        console.log('页面导航完成，检查登录状态:', navigateUrl);
        
        // 等待页面稳定后检查登录状态
        setTimeout(async () => {
          if (window.isDestroyed()) return;
          
          const loginStatus = await checkRealLoginStatus(window, store.platform);
          if (loginStatus.success) {
            console.log(`检测到手动登录成功，保存会话: ${store.name}`);
            
            // 获取当前UA
            const currentUA = await window.webContents.getUserAgent();
            
            // 保存会话数据
            await saveAutoLoginSessionData(window, store.id, currentUA);
            
            // 更新门店状态
            await supabaseService
              .from('stores')
              .update({
                login_status: 'success',
                last_login_time: new Date().toISOString(),
                login_error_message: null,
                user_agent: currentUA
              })
              .eq('id', store.id);
              
            console.log(`手动登录会话保存完成: ${store.name}`);
          }
        }, 3000); // 3秒后检查
      } catch (error) {
        console.error('登录状态检测失败:', error);
      }
    });

    // 4.2 关键页面跳转时保存会话
    window.webContents.on('did-navigate-in-page', async (event, inPageUrl) => {
      try {
        // 检测是否跳转到商家后台主页（登录成功标志）
        const successUrls = {
          '美团': ['e.waimai.meituan.com/home', 'retail.meituan.com', 'waimai.meituan.com/console'],
          '饿了么': ['melody.shop.ele.me/home', 'shop.ele.me/merchant', 'melody.shop.ele.me/dashboard'],
          '京东': ['store.jddj.com/home', 'store.jddj.com/dashboard', 'jddj.com/merchant'],
          '淘宝': ['loginmyseller.taobao.com/home', 'seller.taobao.com'],
          '天猫': ['login.tmall.com/home', 'seller.tmall.com'],
          '拼多多': ['mms.pinduoduo.com/home', 'mms.pinduoduo.com/dashboard'],
          '抖音电商': ['fxg.jinritemai.com/home', 'fxg.jinritemai.com/dashboard'],
          '饿了么零售': ['nr.ele.me/home', 'nr.ele.me/dashboard', 'nr.ele.me/merchant'],
          '小红书': ['ark.xiaohongshu.com/home', 'ark.xiaohongshu.com/dashboard']
        };
        
        const platformUrls = successUrls[store.platform] || successUrls['美团'];
        const isSuccessPage = platformUrls.some(successUrl => inPageUrl.includes(successUrl));
        
        if (isSuccessPage) {
          console.log(`检测到跳转到成功页面，保存会话: ${store.name}`);
          const currentUA = await window.webContents.getUserAgent();
          await saveAutoLoginSessionData(window, store.id, currentUA);
          
          // 更新门店状态
          await supabaseService
            .from('stores')
            .update({
              login_status: 'success',
              last_login_time: new Date().toISOString(),
              login_error_message: null
            })
            .eq('id', store.id);
        }
      } catch (error) {
        console.error('页面跳转会话保存失败:', error);
      }
    });



    // ========== 原有的会话过期检测 ==========
    
    // 监听页面加载完成事件，进行会话过期检测
    window.webContents.once('did-finish-load', async () => {
      console.log('页面加载完成，等待5秒后开始会话过期检测');
      
      // 延长等待时间，确保页面完全稳定
      setTimeout(async () => {
        // 先检查页面是否正常加载
        const pageStatus = await window.webContents.executeJavaScript(`
          (function() {
            return {
              readyState: document.readyState,
              bodyLength: document.body.innerHTML.length,
              title: document.title,
              url: window.location.href
            };
          })();
        `);
        
        console.log('页面状态检查:', pageStatus);
        
        // 只有页面正常加载时才进行会话检测
        if (pageStatus.bodyLength > 100 && pageStatus.readyState === 'complete') {
          await checkAndHandleExpiredSession(window, store);
        } else {
          console.log('页面加载不完整，跳过会话检测');
        }
      }, 1000); // 增加到5秒延迟
    });

    // 加载URL
    window.loadURL(url).catch(error => {
      // 完全忽略所有页面加载错误
      console.log(`忽略页面加载错误: ${error.message}`);
    });

    // 5. 窗口显示逻辑
    if (!window.isDestroyed()) {
      window.show();
      window.focus();
      
      if (window.isMinimized()) {
        window.restore();
      }
      
      window.moveTop();
    }
    
    storeWindows.set(store.id, window);
    console.log(`门店窗口已创建并显示: ${store.id}`);

    // 6. 修改窗口关闭处理逻辑 - 直接保存数据并关闭，无需确认
    window.on('close', async (e) => {
      try {
        console.log(`正在保存门店 ${store.name} 的会话数据...`);
        // 保存当前会话数据
        await saveSessionData(window, store.id);
        console.log(`门店 ${store.name} 的会话数据保存完成`);
      } catch (error) {
        console.error('保存会话数据失败:', error);
      }
      // 不阻止关闭事件，直接关闭窗口
    });

    window.on('closed', () => {
      // 清理定期保存定时器
    
      storeWindows.delete(store.id);
      console.log(`窗口已关闭: ${store.id}`);
    });

    return window;
  } catch (error) {
    console.error('创建门店窗口失败:', error);
    throw error;
  }
}
// 辅助函数：获取平台URL
function getPlatformUrl(platform) {
  switch(platform) {
    case '美团': return 'https://e.waimai.meituan.com/';
    case '饿了么': return 'https://melody.shop.ele.me/';
    case '京东': return 'https://store.jddj.com/';
    case '饿了么零售': return 'https://nr.ele.me/';
    case '淘宝': return 'https://loginmyseller.taobao.com/';
    case '天猫': return 'https://login.tmall.com/';
    case '拼多多': return 'https://mms.pinduoduo.com/';
    case '抖音电商': return 'https://fxg.jinritemai.com/';
    
    case '小红书': return 'https://ark.xiaohongshu.com/';
    default: return 'https://www.baidu.com/';
  }
}
// 创建驾驶舱窗口函数
function createDashboardWindow() {
  dashboardWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: path.join(__dirname, '../assets/icon.ico'),
    resizable: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      sandbox: true
    },
    title: '荣诚外卖运营门店数据概况',
    backgroundColor: '#0f1421',
    minWidth: 1200,
    minHeight: 800,
    titleBarStyle: 'default',
    frame: true
  });
// 设置默认UA
  dashboardWindow.webContents.setUserAgent(DEFAULT_USER_AGENT);
  const dashboardHtmlPath = path.join(__dirname, 'renderer', 'dashboard.html');
  dashboardWindow.loadFile(dashboardHtmlPath).catch(error => {
    console.error('加载驾驶舱页面失败:', error);
    dashboardWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
      '<h1 style="color: white; text-align: center; margin-top: 50px;">加载驾驶舱失败</h1>'
    )}`);
  });

  dashboardWindow.once('ready-to-show', () => {
    dashboardWindow.show();
    dashboardWindow.focus();
  });

  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
  });

  return dashboardWindow;
}
async function saveSessionData(window, storeId) {
    try {
        // 检查窗口是否已销毁
        if (window.isDestroyed()) {
            console.log('窗口已销毁，跳过保存会话数据');
            return;
        }

        const session = window.webContents.session;
        
        console.log(`开始保存门店 ${storeId} 的会话数据...`);
        
        // 获取当前UA
        const userAgent = await window.webContents.getUserAgent();
        
        // 并行获取 cookies 和 localStorage 数据
        const [cookies, localStorageData] = await Promise.all([
            session.cookies.get({}).catch(error => {
                console.warn('获取cookies失败:', error);
                return [];
            }),
            
            Promise.race([
                window.webContents.executeJavaScript(`
                    (function() {
                        try {
                            const allData = {};
                            for (let i = 0; i < localStorage.length; i++) {
                                const key = localStorage.key(i);
                                allData[key] = localStorage.getItem(key);
                            }
                            return allData;
                        } catch (error) {
                            console.error('获取localStorage失败:', error);
                            return {};
                        }
                    })()
                `),
                new Promise(resolve => setTimeout(() => resolve({}), 2000))
            ]).catch(error => {
                console.warn('getlocalStorage失败:', error);
                return {};
            })
        ]);

        // 构建包含UA的会话数据
        const sessionData = {
            cookies: cookies,
            localStorage: localStorageData,
            userAgent: userAgent, // 保存当前UA
            savedAt: new Date().toISOString(),
            storeId: storeId
        };

        console.log(`获取到会话数据: ${cookies.length} 个cookies, ${Object.keys(localStorageData).length} 个localStorage项`);

        // 如果没有任何数据，跳过保存
        if (cookies.length === 0 && Object.keys(localStorageData).length === 0) {
            console.log('无会话数据需要保存');
            return;
        }

        // 加密数据
        const encryptedData = encryptData(sessionData);
        if (!encryptedData) {
            console.error('数据加密失败');
            return;
        }

        // 异步保存到 Supabase
        supabaseService
            .from('sessions')
            .upsert({
                store_id: storeId,
                session_data: encryptedData,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'store_id'
            })
            .then(({ error }) => {
                if (error) {
                    console.error('保存会话数据到Supabase失败:', error);
                } else {
                    console.log('会话数据保存成功（包含UA）');
                }
            })
            .catch(error => {
                console.error('保存会话数据异常:', error);
            });

    } catch (error) {
        console.error('保存会话数据过程中发生错误:', error);
    }
}
// 添加会话过期检测函数
async function checkAndHandleExpiredSession(window, store) {
  try {
    // 检查是否已经尝试过辅助登录
    if (window.autoLoginAttempted) {
      console.log('已经尝试过辅助登录，跳过检测');
      return;
    }
    
    const isSessionExpired = await checkSessionExpired(window, store.platform);
    
    if (isSessionExpired) {
      console.log(`检测到会话过期，门店: ${store.name}`);
      
      // 询问用户是否辅助登录
      const { response } = await dialog.showMessageBox(window, {
        type: 'question',
        buttons: ['辅助登录', '手动登录'],
        defaultId: 0,
        title: '会话过期',
        message: `检测到 ${store.platform} 会话已过期`,
        detail: `是否辅助重新登录门店: ${store.name}？`
      });
      
      if (response === 0) { // 辅助登录
        await autoLoginExpiredSession(window, store);
      }
      // 如果用户选择手动登录，什么都不做，让用户手动操作
    }
  } catch (error) {
    console.error('会话过期检测错误:', error);
  }
}

// 修正后的 checkSessionExpired 函数
async function checkSessionExpired(window, platform) {
  try {
    const result = await window.webContents.executeJavaScript(`
      (function() {
        try {
          const platform = '${platform}';
          const currentUrl = window.location.href;
          const pageTitle = document.title.toLowerCase();
          const bodyText = document.body.innerText.toLowerCase();
          const bodyHTML = document.body.innerHTML;
          
          console.log('=== 会话检测 ===');
          console.log('平台:', platform);
          console.log('URL:', currentUrl);
          console.log('标题:', pageTitle);
          console.log('页面文本长度:', bodyText.length);
          
          // ========== 针对不同平台的精确检测 ==========
          // 在 checkSessionExpired 函数中添加饿了么零售的检测
if (platform === '饿了么零售') {
  console.log('=== 饿了么零售专用检测 ===');
  
  // 成功页面标识
  const successIndicators = [
    currentUrl.includes('nr.ele.me/home'),
    currentUrl.includes('nr.ele.me/dashboard'),
    currentUrl.includes('nr.ele.me/merchant'),
    document.querySelector('.dashboard') !== null,
    document.querySelector('.merchant-info') !== null,
    document.querySelector('.ant-layout-sider') !== null,
    bodyText.includes('零售管理') && bodyText.includes('订单管理')
  ];
  
  if (successIndicators.some(indicator => indicator)) {
    console.log('饿了么零售：检测到成功登录页面');
    return false; // 未过期
  }
  
  // 登录页面标识
  const loginIndicators = [
    currentUrl.includes('/login'),
    currentUrl.includes('passport'),
    document.querySelector('input[placeholder*="账号"]') !== null,
    document.querySelector('input[placeholder*="手机"]') !== null,
    document.querySelector('input[type="password"]') !== null,
    document.querySelector('button[type="submit"]') !== null,
    pageTitle.includes('登录') || bodyText.includes('登录')
  ];
  
  if (loginIndicators.some(indicator => indicator)) {
    console.log('饿了么零售：检测到登录页面，会话可能过期');
    return true; // 已过期
  }
  
  console.log('饿了么零售：无法确定状态，默认未过期');
  return false;
}
          if (platform === '饿了么') {
            console.log('=== 饿了么专用检测 ===');
            
            // 1. 明确的成功页面标识
            const successIndicators = [
              // URL特征
              currentUrl.includes('melody.shop.ele.me/home'),
              currentUrl.includes('melody.shop.ele.me/dashboard'),
              currentUrl.includes('nav.shop.ele.me'),
              currentUrl.includes('shop.ele.me/merchant'),
              
              // 页面元素特征
              document.querySelector('.shop-info') !== null,
              document.querySelector('.merchant-dashboard') !== null,
              document.querySelector('.user-center') !== null,
              document.querySelector('nav') !== null,
              document.querySelector('aside') !== null,
              document.querySelector('.main-layout') !== null,
              
              // 文本特征 - 需要多个同时满足
              bodyText.includes('门店管理') && bodyText.includes('订单管理'),
              bodyText.includes('商家中心') && bodyText.includes('数据中心'),
              bodyText.includes('门店设置') && bodyText.includes('经营分析'),
              
              // 特定的饿了么商家后台标识
              bodyText.includes('饿了么商家中心'),
              bodyText.includes('饿了么商家版'),
              document.querySelector('[data-spm="merchant"]') !== null
            ];
            
            const successCount = successIndicators.filter(indicator => indicator).length;
            console.log('饿了么成功标记数量:', successCount);
            
            // 如果有足够多的成功标记，认为已登录
            if (successCount >= 2) {
              console.log('饿了么：检测到成功登录页面');
              return false; // 未过期
            }
            
            // 2. 明确的登录页面标识
            const loginIndicators = [
              // URL特征
              currentUrl.includes('account.ele.me'),
              currentUrl.includes('passport.ele.me'),
              currentUrl.includes('/login'),
              currentUrl.includes('/signin'),
              
              // 表单元素
              document.querySelector('input[name="username"]') !== null,
              document.querySelector('input[name="account"]') !== null,
              document.querySelector('input[type="password"]') !== null,
              document.querySelector('input[placeholder*="手机号"]') !== null,
              document.querySelector('input[placeholder*="账号"]') !== null,
              document.querySelector('input[placeholder*="密码"]') !== null,
              
              // 登录按钮和表单
              document.querySelector('.login-form') !== null,
              document.querySelector('.login-container') !== null,
              document.querySelector('.login-box') !== null,
              document.querySelector('button[type="submit"]') !== null,
              document.querySelector('.login-btn') !== null,
              
              // 文本特征
              pageTitle.includes('登录') || pageTitle.includes('login'),
              bodyText.includes('手机号登录'),
              bodyText.includes('账号登录'),
              bodyText.includes('密码登录'),
              bodyText.includes('验证码登录'),
              bodyText.includes('短信登录')
            ];
            
            const loginCount = loginIndicators.filter(indicator => indicator).length;
            console.log('饿了么登录标记数量:', loginCount);
            
            // 如果有足够多的登录标记，认为需要登录
            if (loginCount >= 3) {
              console.log('饿了么：检测到登录页面，会话可能过期');
              return true; // 已过期
            }
            
            // 3. 无法确定状态 - 默认未过期
            console.log('饿了么：无法确定状态，默认未过期');
            return false;
          }
          if (platform === '京东') {
            console.log('=== 京东专用检测 ===');
            
            // 1. 明确的成功页面标识 - 京东商家后台
            const successIndicators = [
              // URL特征 - 京东商家后台成功页面
              currentUrl.includes('store.jddj.com/home'),
              currentUrl.includes('store.jddj.com/dashboard'),
              currentUrl.includes('store.jddj.com/'),
              currentUrl.includes('jddj.com/merchant'),
              
              // 页面元素特征 - 京东商家后台特有元素
              document.querySelector('.store-info') !== null,
              document.querySelector('.user-panel') !== null,
              document.querySelector('[class*="merchant"]') !== null,
              document.querySelector('.dashboard') !== null,
              document.querySelector('nav') !== null,
              document.querySelector('aside') !== null,
              document.querySelector('.main-content') !== null,
              document.querySelector('.ant-layout') !== null,
              
              // 文本特征 - 京东商家后台特有文本
              bodyText.includes('店铺管理') && bodyText.includes('订单管理'),
              bodyText.includes('数据中心') && bodyText.includes('商家后台'),
              bodyText.includes('门店设置') && bodyText.includes('经营分析'),
              bodyText.includes('京东秒送商家端'),
              bodyText.includes('消息中心') && bodyText.includes('工作台'),
              
              // 特定的京东商家后台标识
              bodyText.includes('京东商家中心'),
              bodyText.includes('商家后台'),
              document.querySelector('[data-spm="merchant"]') !== null
            ];
            
            const successCount = successIndicators.filter(indicator => indicator).length;
            console.log('京东成功标记数量:', successCount);
            
            // 如果有足够多的成功标记，认为已登录
            if (successCount >= 2) {
              console.log('京东：检测到成功登录页面');
              return false; // 未过期
            }
            
            // 2. 明确的登录页面标识
            const loginIndicators = [
              // URL特征
              currentUrl.includes('passport.jd.com'),
              currentUrl.includes('plogin.jd.com'),
              currentUrl.includes('/login'),
              currentUrl.includes('/signin'),
              
              // 表单元素
              document.querySelector('input[type="text"]') !== null,
              document.querySelector('input[type="password"]') !== null,
              document.querySelector('input[name="username"]') !== null,
              document.querySelector('input[name="password"]') !== null,
              document.querySelector('input[placeholder*="账号"]') !== null,
              document.querySelector('input[placeholder*="用户名"]') !== null,
              document.querySelector('input[placeholder*="密码"]') !== null,
              
              // 登录按钮和表单
              document.querySelector('.login-form') !== null,
              document.querySelector('.login-container') !== null,
              document.querySelector('.login-box') !== null,
              document.querySelector('button[type="submit"]') !== null,
              document.querySelector('.login-btn') !== null,
              document.querySelector('.btn-login') !== null,
              
              // 文本特征
              pageTitle.includes('登录') || pageTitle.includes('login'),
              bodyText.includes('账号登录'),
              bodyText.includes('密码登录'),
              bodyText.includes('验证码登录'),
              bodyText.includes('短信登录'),
              bodyText.includes('京东账号')
            ];
            
            const loginCount = loginIndicators.filter(indicator => indicator).length;
            console.log('京东登录标记数量:', loginCount);
            
            // 如果有足够多的登录标记，认为需要登录
            if (loginCount >= 3) {
              console.log('京东：检测到登录页面，会话可能过期');
              return true; // 已过期
            }
            
            // 3. 无法确定状态 - 默认未过期（避免误判）
            console.log('京东：无法确定状态，默认未过期');
            return false;
          }
          // ========== 其他平台保持原有逻辑 ==========
          const loginIndicators = {
            '美团': [
              currentUrl.includes('login') || currentUrl.includes('signin'),
              document.querySelector('input#login.ep-input') !== null,
              document.querySelector('input[type="password"]') !== null,
              pageTitle.includes('登录') || pageTitle.includes('login'),
              bodyText.includes('账号登录') || bodyText.includes('密码登录')
            ],
           
          };
          
          const indicators = loginIndicators[platform] || loginIndicators['美团'];
          const isLoginPage = indicators.some(indicator => {
            if (typeof indicator === 'boolean') return indicator;
            return false;
          });
          
          console.log('其他平台是否是登录页面:', isLoginPage);
          return isLoginPage;
          
        } catch (error) {
          console.error('检测会话错误:', error);
          return false; // 出错时默认未过期，避免误判
        }
      })()
    `);
    
    return result;
  } catch (error) {
    console.error('执行会话检测脚本失败:', error);
    return false; // 出错时默认未过期
  }
}
// 辅助登录过期会话（只尝试一次）
async function autoLoginExpiredSession(window, store) {
  // 标记已尝试辅助登录
  window.autoLoginAttempted = true;
  
  try {
    console.log(`开始辅助登录过期会话: ${store.name}`);
    
    // 显示登录进度覆盖层
    await window.webContents.executeJavaScript(`
      (function() {
        // 创建登录提示层
        const overlay = document.createElement('div');
        overlay.id = 'auto-login-overlay';
        overlay.style.cssText = \`
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.8);
          color: white;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          z-index: 9999;
          font-family: Arial, sans-serif;
        \`;
        
        overlay.innerHTML = \`
          <div style="text-align: center; padding: 30px; background: #1a1a1a; border-radius: 8px; max-width: 400px;">
            <h2 style="margin-bottom: 20px; color: #4CAF50;">正在辅助登录...</h2>
            <div style="margin: 20px 0;">
              <div style="width: 200px; height: 4px; background: #333; border-radius: 2px;">
                <div id="loginProgressBar" style="width: 0%; height: 100%; background: #4CAF50; border-radius: 2px; transition: width 0.3s;"></div>
              </div>
            </div>
            <p id="loginStatus" style="margin: 10px 0;">初始化登录环境...</p>
            <p style="font-size: 12px; opacity: 0.7;">门店: ${store.name} | 平台: ${store.platform}</p>
          </div>
        \`;
        
        document.body.appendChild(overlay);
        return true;
      })();
    `);
    
    // 更新进度状态
    const updateProgress = async (progress, status) => {
      await window.webContents.executeJavaScript(`
        (function() {
          const bar = document.getElementById('loginProgressBar');
          const statusText = document.getElementById('loginStatus');
          if (bar) bar.style.width = '${progress}%';
          if (statusText) statusText.textContent = '${status}';
        })();
      `);
    };
    
    await updateProgress(10, '获取账号信息...');
    
    // 解密账号密码
    const password = store.password ? decryptData(store.password) : '';
    if (!store.username || !password) {
      throw new Error('账号或密码缺失，无法辅助登录');
    }
    
    await updateProgress(30, '准备登录表单...');
    
    // 根据平台执行登录（带超时限制）
    const loginWithTimeout = async () => {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('登录超时')), 30000); // 30秒超时
      });
      
      const loginPromise = (async () => {
        switch(store.platform) {
  case '美团':
    return await executeMeituanLogin(window, store.username, password);
  case '饿了么':
    return await executeElemeLogin(window, store.username, password);
   case '饿了么零售':
    return await executeElemeRetailLogin(window, store.username, password); // 使用专门的函数 // 使用同一个函数
  case '京东':
    return await executeJingdongLogin(window, store.username, password);
  default:
    throw new Error(`暂不支持 ${store.platform} 平台辅助登录`);
}
      })();
      
      return Promise.race([loginPromise, timeoutPromise]);
    };
    
    await updateProgress(50, '执行登录操作...');
    const loginResult = await loginWithTimeout();
    
    await updateProgress(70, '验证登录结果...');
    
    if (loginResult && loginResult.success) {
      await updateProgress(90, '登录成功，保存会话...');
      
      // 登录成功后的处理
      await handleLoginSuccess(window, store, await window.webContents.getUserAgent());
      
      await updateProgress(100, '登录完成！');
      
      // 延迟后移除提示层
      setTimeout(async () => {
        await window.webContents.executeJavaScript(`
          (function() {
            const overlay = document.getElementById('auto-login-overlay');
            if (overlay) overlay.remove();
          })();
        `);
      }, 2000);
      
      console.log(`门店 ${store.name} 辅助登录成功`);
      
    } else {
      throw new Error(loginResult?.error || '辅助登录失败');
    }
    
  } catch (error) {
    console.error('辅助登录过期会话失败:', error);
    
    // 显示错误信息（不提供重试选项）
    await window.webContents.executeJavaScript(`
      (function() {
        const overlay = document.getElementById('auto-login-overlay');
        if (overlay) {
          overlay.innerHTML = \`
            <div style="text-align: center; padding: 30px; background: #1a1a1a; border-radius: 8px; max-width: 450px;">
              <h2 style="color: #ff6b6b; margin-bottom: 15px;">❌ 辅助登录失败</h2>
              <div style="text-align: left; background: #2a2a2a; padding: 15px; border-radius: 4px; margin: 15px 0;">
                <p style="margin: 5px 0;"><strong>门店:</strong> ${store.name}</p>
                <p style="margin: 5px 0;"><strong>平台:</strong> ${store.platform}</p>
                <p style="margin: 5px 0;"><strong>错误原因:</strong> ${error.message}</p>
              </div>
              <p style="font-size: 14px; opacity: 0.8; margin-bottom: 20px;">
                请手动完成登录操作
              </p>
              <button onclick="this.parentElement.parentElement.remove()" 
                      style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">
                关闭
              </button>
            </div>
          \`;
        }
      })();
    `);
    
    // 记录登录失败到门店数据
    await supabaseService
      .from('stores')
      .update({
        login_status: 'failed',
        login_error_message: `辅助登录失败: ${error.message}`,
        last_login_attempt: new Date().toISOString()
      })
      .eq('id', store.id);
  }
}

// ==================== IPC 处理器 ====================
// 用户认证相关
ipcMain.handle('login', async (event, { email, password }) => {
  try {
    console.log('登录尝试:', email);   
    // 检查supabase是否已初始化
    if (!isSupabaseInitialized) {
      const initSuccess = await initializeSupabase();
      if (!initSuccess) {
        return createErrorResponse('SUPABASE_NOT_INITIALIZED', '数据库连接未初始化');
      }
    }
    
    // 使用服务端客户端绕过RLS查询用户
    const { data: user, error } = await supabaseService
      .from('users')
      .select('*')
      .eq('email', email)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !user) {
      console.error('登录错误：用户不存在', { email });
      return createErrorResponse('USER_NOT_FOUND', '用户不存在或已被禁用');
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      console.error('登录错误：密码不匹配', { email });
      return createErrorResponse('PASSWORD_MISMATCH', '密码错误');
    }

    currentUser = user;
    return createSuccessResponse(user, '登录成功');
  } catch (error) {
    console.error('登录错误:', error);
    return createErrorResponse('LOGIN_ERROR', '登录失败，请稍后重试');
  }
});

ipcMain.handle('get-current-user', async () => {
  return currentUser;
});

ipcMain.handle('logout', async () => {
  currentUser = null;
  
  for (const [id, window] of storeWindows) {
    if (!window.isDestroyed()) {
      window.close();
    }
  }
  storeWindows.clear();
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
    mainWindow = null;
  }
  
  loginWindow = createLoginWindow();
  
  return createSuccessResponse(null, '退出登录成功');
});

ipcMain.handle('change-password', async (event, { currentPassword, newPassword }) => {
  if (!currentUser) return createErrorResponse('NOT_LOGGED_IN', '未登录');
  
  try {
    const isMatch = await bcrypt.compare(currentPassword, currentUser.password_hash);
    if (!isMatch) {
      return createErrorResponse('PASSWORD_MISMATCH', '当前密码错误');
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    const { error } = await supabaseService // 使用服务端客户端
      .from('users')
      .update({ password_hash: hashedPassword })
      .eq('id', currentUser.id);
    
    if (error) throw error;
    
    return createSuccessResponse(null, '密码修改成功');
  } catch (error) {
    console.error('修改密码错误:', error);
    return createErrorResponse('CHANGE_PASSWORD_ERROR', '修改密码失败');
  }
});

ipcMain.handle('save-login-info', async (event, { email, password, remember }) => {
  try {
    const loginDataPath = path.join(userDataPath, 'login_data.json');
    let loginData = {};
    
    if (remember) {
      loginData = { email, password: encryptData(password), remember };
    } else {
      loginData = { email, remember: false };
    }
    
    fs.writeFileSync(loginDataPath, JSON.stringify(loginData));
    return createSuccessResponse(null, '登录信息保存成功');
  } catch (error) {
    console.error('保存登录信息失败:', error);
    return createErrorResponse('SAVE_LOGIN_INFO_ERROR', '保存登录信息失败');
  }
});

ipcMain.handle('load-login-info', async () => {
  try {
    const loginDataPath = path.join(userDataPath, 'login_data.json');
    
    if (fs.existsSync(loginDataPath)) {
      const data = fs.readFileSync(loginDataPath, 'utf8');
      const loginData = JSON.parse(data);
      
      if (loginData.remember && loginData.password) {
        loginData.password = decryptData(loginData.password);
      }
      
      return createSuccessResponse(loginData, '登录信息加载成功');
    }
    
    return createSuccessResponse(null, '无保存的登录信息');
  } catch (error) {
    console.error('读取登录信息失败:', error);
    return createErrorResponse('LOAD_LOGIN_INFO_ERROR', '读取登录信息失败');
  }
});

// 用户管理
ipcMain.handle('create-user', async (event, userData) => {
  if (!currentUser || (currentUser.role !== 'super_admin' && currentUser.role !== 'admin')) {
    return createErrorResponse('PERMISSION_DENIED', '权限不足');
  }

  try {
    const validationError = validateUser(userData);
    if (validationError) {
      return createErrorResponse('VALIDATION_ERROR', validationError);
    }

    const hashedPassword = await bcrypt.hash(userData.password, 10);

    const userToCreate = {
      name: userData.name,
      email: userData.email,
      password_hash: hashedPassword,
      role: userData.role,
      store_limit: userData.store_limit || 10,
      created_by: currentUser.id,
      is_active: true
    };

    if (currentUser.role === 'admin' && userData.role === 'employee') {
      userToCreate.admin_id = currentUser.id;
    }

    const { data, error } = await supabaseService // 使用服务端客户端
      .from('users')
      .insert([userToCreate])
      .select();

    if (error) throw error;

    clearUsersCache();
    
    return createSuccessResponse(data[0], '用户创建成功');
  } catch (error) {
    console.error('创建用户错误:', error);
    return createErrorResponse('CREATE_USER_ERROR', '创建用户失败');
  }
});

ipcMain.handle('get-users', async (event, filters = {}) => {
  if (!currentUser) return createErrorResponse('NOT_LOGGED_IN', '未登录');
  try {
    // 生成缓存键（含用户ID和筛选条件，确保不同用户/筛选的缓存隔离）
    const cacheKey = generateCacheKey('users', currentUser.id, filters);
    
    // 走缓存查询逻辑（命中缓存直接返回，未命中则执行数据库查询）
    return await cachedQuery(cacheKey, async () => {
      // 初始化查询：使用服务端客户端（supabaseService）绕过RLS，获取全量用户基础数据
      let query = supabaseService.from('users').select('*');

      // 按当前用户角色，过滤查询结果（核心逻辑修改处）
      if (currentUser.role === 'super_admin') {
        // 超级管理员：能查看所有激活状态的用户（可根据需求保留/移除is_active筛选）
        query = query.eq('is_active', true);
      } 
      else if (currentUser.role === 'admin') {
        // 管理员：能查看自己 + 自己名下所有激活的员工
        const { data: employees, error: empError } = await supabaseService
          .from('users')
          .select('id')
          .eq('admin_id', currentUser.id)
          .eq('is_active', true);
        if (empError) throw empError;
        
        // 收集“自己ID + 名下员工ID”，作为查询范围
        const accessibleIds = employees ? employees.map(e => e.id) : [];
        accessibleIds.push(currentUser.id);
        query = query.in('id', accessibleIds);
      } 
      else if (currentUser.role === 'employee') {
        // 员工：能查看“所属管理员 + 同管理员名下其他激活员工 + 自己”（核心修改）
        const adminId = currentUser.admin_id;
        if (adminId) {
          // 1. 获取所属管理员名下所有激活的员工ID（含自己）
          const { data: sameAdminEmployees, error: empError } = await supabaseService
            .from('users')
            .select('id')
            .eq('admin_id', adminId)
            .eq('is_active', true);
          if (empError) throw empError;
          
          // 2. 收集“所属管理员ID + 同管理员员工ID”，作为查询范围
          const accessibleIds = sameAdminEmployees ? sameAdminEmployees.map(e => e.id) : [];
          accessibleIds.push(adminId); // 加入管理员本人
          
          // 3. 限定查询范围（确保只返回有权查看的用户）
          query = query.in('id', accessibleIds);
        } else {
          // 降级处理：若admin_id缺失（异常情况），仅返回自己
          query = query.eq('id', currentUser.id);
        }
      }

      // 应用额外筛选条件（如前端传入的角色/状态筛选，可选）
      if (filters.role) {
        query = query.eq('role', filters.role);
      }
      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      // 执行最终查询，返回结果
      const { data, error } = await query;
      if (error) throw error;
      
      // 按统一格式返回成功响应（含用户列表数据）
      return createSuccessResponse(data, '用户列表获取成功');
    });
  } catch (error) {
    console.error('获取用户列表错误:', error);
    // 统一错误响应格式，便于前端处理
    return createErrorResponse('GET_USERS_ERROR', '获取用户列表失败: ' + error.message);
  }
});

ipcMain.handle('delete-user', async (event, userId) => {
  if (!currentUser || (currentUser.role !== 'super_admin' && currentUser.role !== 'admin')) {
    return createErrorResponse('PERMISSION_DENIED', '权限不足');
  }

  try {
    if (userId === currentUser.id) {
      return createErrorResponse('CANNOT_DELETE_SELF', '不能删除自己的账户');
    }

    const { data: userStores, error: storeError } = await supabaseService // 使用服务端客户端
      .from('stores')
      .select('id')
      .eq('owner_id', userId);

    if (storeError) throw storeError;

    if (userStores && userStores.length > 0) {
      return createErrorResponse('USER_HAS_STORES', '该用户有关联的门店，请先转移或删除这些门店');
    }

    const { error } = await supabaseService // 使用服务端客户端
      .from('users')
      .delete()
      .eq('id', userId);

    if (error) throw error;

    clearUsersCache();
    
    return createSuccessResponse(null, '用户删除成功');
  } catch (error) {
    console.error('删除用户错误:', error);
    return createErrorResponse('DELETE_USER_ERROR', '删除用户失败');
  }
});
ipcMain.handle('update-user', async (event, userData) => {
  if (!currentUser || (currentUser.role !== 'super_admin' && currentUser.role !== 'admin')) {
    return createErrorResponse('PERMISSION_DENIED', '权限不足');
  }

  try {
    // 使用新的验证规则
    const validationError = validateUserUpdate(userData);
    if (validationError) {
      return createErrorResponse('VALIDATION_ERROR', validationError);
    }

    // 构建更新对象
    const updateData = {
      name: userData.name,
      store_limit: userData.store_limit,
      updated_at: new Date().toISOString()
    };

    // 只有在提供了新密码时才更新密码
    if (userData.password && userData.password.trim() !== '') {
      updateData.password_hash = await bcrypt.hash(userData.password, 10);
    }

    const { data, error } = await supabaseService
      .from('users')
      .update(updateData)
      .eq('id', userData.id)
      .select();

    if (error) throw error;

    clearUsersCache();

    return createSuccessResponse(data[0], '用户更新成功');
  } catch (error) {
    console.error('更新用户错误:', error);
    return createErrorResponse('UPDATE_USER_ERROR', '更新用户失败');
  }
});
ipcMain.handle('toggle-user-status', async (event, userId) => {
  if (!currentUser || (currentUser.role !== 'super_admin' && currentUser.role !== 'admin')) {
    return createErrorResponse('PERMISSION_DENIED', '权限不足');
  }

  try {
    if (userId === currentUser.id) {
      return createErrorResponse('CANNOT_DISABLE_SELF', '不能禁用自己的账户');
    }

    const { data: user, error: fetchError } = await supabaseService // 使用服务端客户端
      .from('users')
      .select('is_active')
      .eq('id', userId)
      .single();

    if (fetchError) throw fetchError;

    const { error } = await supabaseService // 使用服务端客户端
      .from('users')
      .update({ is_active: !user.is_active })
      .eq('id', userId);

    if (error) throw error;

    clearUsersCache();
    
    return createSuccessResponse({ is_active: !user.is_active }, '用户状态切换成功');
  } catch (error) {
    console.error('切换用户状态错误:', error);
    return createErrorResponse('TOGGLE_USER_STATUS_ERROR', '切换用户状态失败');
  }
});

ipcMain.handle('check-store-limit', async (event, userId) => {
  try {
    const { data: user, error: userError } = await supabaseService // 使用服务端客户端
      .from('users')
      .select('store_limit, admin_id, role')
      .eq('id', userId)
      .single();
    
    if (userError) throw userError;
    
    const { data: userStores, error: userStoresError } = await supabaseService // 使用服务端客户端
      .from('stores')
      .select('id')
      .eq('owner_id', userId);
    
    if (userStoresError) throw userStoresError;
    
    const currentUserStoreCount = userStores ? userStores.length : 0;
    const userStoreLimit = user.store_limit || 10;
    
    let adminTotalStoreCount = 0;
    let adminStoreLimit = 0;
    let adminCurrentCount = 0;
    
    if (user.role === 'employee' && user.admin_id) {
      adminTotalStoreCount = await getAdminTotalStoreCount(user.admin_id);
      
      const { data: adminData } = await supabaseService // 使用服务端客户端
        .from('users')
        .select('store_limit')
        .eq('id', user.admin_id)
        .single();
      
      adminStoreLimit = adminData.store_limit || 30;
      adminCurrentCount = adminTotalStoreCount;
    }
    
    return createSuccessResponse({ 
      current: currentUserStoreCount, 
      limit: userStoreLimit,
      adminCurrent: adminCurrentCount,
      adminLimit: adminStoreLimit,
      canAdd: currentUserStoreCount < userStoreLimit && 
             (user.role !== 'employee' || adminTotalStoreCount < adminStoreLimit)
    }, '门店限制检查成功');
  } catch (error) {
    console.error('检查门店限制错误:', error);
    return createErrorResponse('CHECK_STORE_LIMIT_ERROR', '检查门店限制失败');
  }
});
// 在 IPC 处理器部分添加
ipcMain.handle('clear-current-user-cache', async (event) => {
    if (!currentUser) return createErrorResponse('NOT_LOGGED_IN', '未登录');
    
    try {
        const keys = cache.keys();
        let clearedCount = 0;
        
        // 只清理当前用户的门店相关缓存
        keys.forEach(key => {
            if (key.startsWith(`${CACHE_VERSION}:stores:${currentUser.id}`)) {
                cache.del(key);
                clearedCount++;
            }
        });
        
        console.log(`用户 ${currentUser.name} 清理了 ${clearedCount} 个缓存`);
        return createSuccessResponse({ clearedCount }, '缓存清理成功');
    } catch (error) {
        console.error('清理用户缓存错误:', error);
        return createErrorResponse('CLEAR_CACHE_ERROR', '清理缓存失败');
    }
});
// 批量导入门店
ipcMain.handle('batch-import-stores', async (event, filePath) => {
  if (!currentUser) return createErrorResponse('NOT_LOGGED_IN', '未登录');

  try {
    // 读取Excel文件
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (!data || data.length === 0) {
      return createErrorResponse('EMPTY_FILE', 'Excel文件为空');
    }

    // 修复：直接调用检查门店限制的逻辑
    const limitCheck = await checkStoreLimitDirectly(currentUser.id);
    const canAddCount = limitCheck.limit - limitCheck.current;
    if (data.length > canAddCount) {
      return createErrorResponse('STORE_LIMIT_EXCEEDED', 
        `只能添加 ${canAddCount} 个门店，但Excel中有 ${data.length} 个`);
    }

    const results = {
      success: 0,
      failed: 0,
      updated: 0,
      errors: []
    };

    // 批量插入门店
    for (const [index, row] of data.entries()) {
      try {
        // 修复：使用正确的中文字段名进行验证
        const storeName = row['门店名称*'] || row['门店名称'] || row.name;
        const platform = row['平台*'] || row['平台'] || row.platform;

        // 验证必填字段
        if (!storeName || !platform) {
          results.errors.push(`第${index + 2}行: 门店名称和平台为必填项`);
          results.failed++;
          continue;
        }

        // 验证平台有效性
        const validPlatforms = ['美团', '饿了么', '京东', '淘宝', '天猫', '拼多多', '抖音电商', '饿了么零售', '小红书'];
        if (!validPlatforms.includes(platform)) {
          results.errors.push(`第${index + 2}行: 平台名称无效`);
          results.failed++;
          continue;
        }

        // 加密密码 - 修复字段名
        const password = row['密码'] || row.password;
        const encryptedPassword = password ? encryptData(password) : null;

        const storeData = {
          name: storeName,
          platform: platform,
          username: row['账号'] || row.username || '',
          password: encryptedPassword,
          contact_person: row['联系人'] || row.contact_person || '',
          contact_phone: row['联系电话'] || row.contact_phone || '',
          province: row['省份'] || row.province || '',
          city: row['城市'] || row.city || '',
          category: row['分类'] || row.category || '',
          owner_id: currentUser.id,
          created_by: currentUser.id,
          login_status: 'pending',
          updated_at: new Date().toISOString()
        };

        // 修复：修改重复检测逻辑，处理多行返回的情况
        const { data: existingStores, error: queryError } = await supabaseService
          .from('stores')
          .select('id')
          .eq('name', storeName)
          .eq('platform', platform)
          .eq('owner_id', currentUser.id);
          // 移除 .maybeSingle()，允许返回多行

        if (queryError) {
          results.errors.push(`第${index + 2}行: 查询重复门店失败 - ${queryError.message}`);
          results.failed++;
          continue;
        }

        // 处理查询结果
        if (existingStores && existingStores.length > 0) {
          // 如果找到重复门店，使用第一个进行更新
          const existingStore = existingStores[0];
          
          // 如果有多条重复记录，记录警告但不阻止操作
          if (existingStores.length > 1) {
            console.warn(`发现 ${existingStores.length} 条重复门店记录: ${storeName} - ${platform}，将更新第一条`);
          }

          // 存在重复门店，执行更新操作
          const { error: updateError } = await supabaseService
            .from('stores')
            .update(storeData)
            .eq('id', existingStore.id);

          if (updateError) {
            results.errors.push(`第${index + 2}行: 更新门店失败 - ${updateError.message}`);
            results.failed++;
          } else {
            results.updated++;
            console.log(`已更新重复门店: ${storeName} - ${platform}`);
          }
        } else {
          // 新门店，执行插入操作
          const { error: insertError } = await supabaseService
            .from('stores')
            .insert([storeData]);

          if (insertError) {
            results.errors.push(`第${index + 2}行: 插入门店失败 - ${insertError.message}`);
            results.failed++;
          } else {
            results.success++;
          }
        }
      } catch (error) {
        results.errors.push(`第${index + 2}行: ${error.message}`);
        results.failed++;
      }
    }

    // 清除门店缓存
    clearStoresCache();

    return createSuccessResponse(results, 
      `导入完成: 新增 ${results.success} 个, 更新 ${results.updated} 个, 失败 ${results.failed} 个`);

  } catch (error) {
    console.error('批量导入错误:', error);
    return createErrorResponse('BATCH_IMPORT_ERROR', '批量导入失败: ' + error.message);
  }
});
// 添加这个辅助函数来直接检查门店限制
async function checkStoreLimitDirectly(userId) {
  try {
    const { data: user, error: userError } = await supabaseService
      .from('users')
      .select('store_limit, admin_id, role')
      .eq('id', userId)
      .single();
    
    if (userError) throw userError;
    
    const { data: userStores, error: userStoresError } = await supabaseService
      .from('stores')
      .select('id')
      .eq('owner_id', userId);
    
    if (userStoresError) throw userStoresError;
    
    const currentUserStoreCount = userStores ? userStores.length : 0;
    const userStoreLimit = user.store_limit || 10;
    
    let adminTotalStoreCount = 0;
    let adminStoreLimit = 0;
    let adminCurrentCount = 0;
    
    if (user.role === 'employee' && user.admin_id) {
      adminTotalStoreCount = await getAdminTotalStoreCount(user.admin_id);
      
      const { data: adminData } = await supabaseService
        .from('users')
        .select('store_limit')
        .eq('id', user.admin_id)
        .single();
      
      adminStoreLimit = adminData.store_limit || 30;
      adminCurrentCount = adminTotalStoreCount;
    }
    
    return {
      current: currentUserStoreCount, 
      limit: userStoreLimit,
      adminCurrent: adminCurrentCount,
      adminLimit: adminStoreLimit,
      canAdd: currentUserStoreCount < userStoreLimit && 
             (user.role !== 'employee' || adminTotalStoreCount < adminStoreLimit)
    };
  } catch (error) {
    console.error('检查门店限制错误:', error);
    throw error;
  }
}

// 修改一键登录函数，添加进度报告

ipcMain.handle('batch-auto-login', async (event, { storeIds, batchSize = 3 }) => { // 测试阶段建议batchSize=1
  if (!currentUser) return createErrorResponse('NOT_LOGGED_IN', '未登录');

  try {
    // 获取需要登录的门店信息
    const { data: stores, error } = await supabaseService
      .from('stores')
      .select('*')
      .in('id', storeIds)
      .eq('owner_id', currentUser.id);

    if (error) throw error;

    if (!stores || stores.length === 0) {
      return createErrorResponse('NO_STORES', '未找到需要登录的门店');
    }

    console.log(`开始批量登录，共 ${stores.length} 个门店，批次大小: ${batchSize}`);

    const results = {
      total: stores.length,
      success: 0,
      failed: 0,
      details: []
    };

    // 分批处理，控制并发数量
    for (let i = 0; i < stores.length; i += batchSize) {
      const batch = stores.slice(i, i + batchSize);
      console.log(`处理批次 ${Math.floor(i/batchSize) + 1}:`, batch.map(s => s.name));
      
      const batchPromises = batch.map(store => autoLoginStore(store));
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.details.push(result.value);
          if (result.value.success) {
            results.success++;
            console.log(`✅ ${result.value.storeName} 登录成功`);
          } else {
            results.failed++;
            console.log(`❌ ${result.value.storeName} 登录失败: ${result.value.error}`);
          }
        } else {
          results.failed++;
          const errorResult = {
            storeId: 'unknown',
            storeName: 'unknown',
            success: false,
            error: result.reason.message
          };
          results.details.push(errorResult);
          console.log(`❌ 未知门店登录失败: ${result.reason.message}`);
        }
      }

      // 发送进度更新到渲染进程
      event.sender.send('login-progress-update', {
  completed: Math.min(i + batchSize, stores.length),
  total: stores.length,
  batchResults: batchResults.map(r => {
    if (r.status === 'fulfilled') {
      // 检查是否是真正的成功
      const realSuccess = r.value.success && 
                         !r.value.error && 
                         r.value.message !== '登录操作已执行'; // 排除仅操作执行的成功
      
      return {
        ...r.value,
        realSuccess: realSuccess,
        finalStatus: realSuccess ? 'success' : 'failed'
      };
    } else {
      return {
        storeId: 'unknown',
        storeName: 'unknown', 
        success: false,
        error: '执行失败',
        realSuccess: false,
        finalStatus: 'failed'
      };
    }
  })
});

      // 批次间延迟，避免请求过于频繁
      if (i + batchSize < stores.length) {
        console.log(`等待2秒后处理下一批...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`批量登录完成: 成功 ${results.success} 个, 失败 ${results.failed} 个`);
    return createSuccessResponse(results, `一键登录完成: 成功 ${results.success} 个, 失败 ${results.failed} 个`);

  } catch (error) {
    console.error('一键登录错误:', error);
    return createErrorResponse('BATCH_LOGIN_ERROR', '一键登录失败: ' + error.message);
  }
});
async function autoLoginStore(store) {
  let loginWindow = null;
  
  try {
    console.log(`开始辅助登录流程: ${store.name}`);

    // 为门店生成固定UA
    const storeUA = getStoreSpecificUserAgent(store.id, store.platform);
    console.log(`门店 ${store.name} 使用固定UA: ${storeUA.substring(0, 60)}...`);

    // 更健壮的解密处理
    const password = store.password ? decryptData(store.password) : '';
    if (!store.username || !password) {
      throw new Error('账号或密码缺失');
    }

    // 创建登录窗口 - 使用固定UA
    loginWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        partition: `persist:autologin_${store.id}_${Date.now()}`,
        preload: path.join(__dirname, 'preload.js'),
        devTools: process.env.NODE_ENV === 'development',
        images: true,
        javascript: true,
        webgl: true,
        plugins: true,
        disableHardwareAcceleration: false
      },
      title: `辅助登录 - ${store.name}`,
      backgroundColor: '#ffffff'
    });

    // 添加窗口状态检查函数
    const isWindowValid = () => {
      return loginWindow && !loginWindow.isDestroyed() && !loginWindow.webContents.isDestroyed();
    };

    // 设置固定UA
    await loginWindow.webContents.setUserAgent(storeUA);
    
    // 添加网络事件处理
    loginWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      console.error(`页面加载失败: ${errorCode} - ${errorDescription} - ${validatedURL}`);
    });

    loginWindow.webContents.on('did-finish-load', () => {
      console.log('页面加载完成');
    });

    loginWindow.webContents.on('dom-ready', () => {
      console.log('DOM准备就绪');
    });

    // 更宽松的 CSP 策略
    loginWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      const csp = [
        "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:",
        "script-src * 'unsafe-inline' 'unsafe-eval' blob:",
        "style-src * 'unsafe-inline'",
        "img-src * data: blob:",
        "connect-src *",
        "frame-src *",
        "font-src * data:"
      ].join('; ');
      
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [csp]
        }
      });
    });

    const loginUrl = getPlatformUrl(store.platform);
    console.log(`加载URL: ${loginUrl}`);

    // 使用更可靠的加载策略
    await new Promise((resolve, reject) => {
      let loaded = false;
      
      const timeout = setTimeout(() => {
        if (!loaded) {
          console.log('页面加载超时，继续执行');
          resolve();
        }
      }, 120000); // 增加到2分钟超时

      // 监听多个加载事件
      const onLoadFinished = () => {
        if (!loaded) {
          loaded = true;
          clearTimeout(timeout);
          console.log('页面加载完成');
          resolve();
        }
      };

      loginWindow.webContents.once('did-finish-load', onLoadFinished);
      loginWindow.webContents.once('did-frame-finish-load', onLoadFinished);
      
      // 开始加载页面
      loginWindow.loadURL(loginUrl, {
        userAgent: platformUserAgents[store.platform] || platformUserAgents['美团'],
        httpReferrer: loginUrl
      }).catch(err => {
        console.error('加载URL错误:', err);
        if (!loaded) {
          loaded = true;
          clearTimeout(timeout);
          resolve(); // 即使出错也继续
        }
      });

      // 额外检查：10秒后如果页面仍然空白，尝试重新加载
      setTimeout(() => {
        if (!isWindowValid()) return;
        
        loginWindow.webContents.executeJavaScript(`
          document.readyState === 'loading' || document.body.innerHTML.length < 100
        `).then(isEmpty => {
          if (isEmpty && !loaded) {
            console.log('检测到页面可能为空，尝试重新加载');
            loginWindow.reload();
          }
        }).catch(() => {});
      }, 10000);
    });

    // 等待页面完全稳定
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 检查窗口是否仍然有效
    if (!isWindowValid()) {
      throw new Error('登录窗口已意外关闭');
    }

    // 检查页面内容是否正常加载
    const pageStatus = await loginWindow.webContents.executeJavaScript(`
      (function() {
        try {
          const bodyText = document.body.innerText || '';
          const hasContent = document.body.children.length > 0;
          const hasLoginForm = document.querySelector('input[type="text"], input[type="password"], input[name="username"], input[name="password"]');
          
          return {
            readyState: document.readyState,
            bodyLength: document.body.innerHTML.length,
            hasContent: hasContent,
            hasLoginForm: !!hasLoginForm,
            bodyText: bodyText.substring(0, 200),
            title: document.title,
            url: window.location.href
          };
        } catch (error) {
          return { error: error.message };
        }
      })();
    `).catch(err => ({ error: err.message }));

    console.log('页面状态检查:', pageStatus);

    // 如果页面没有正常加载，尝试刷新
    if (!pageStatus.hasContent || pageStatus.bodyLength < 100) {
      console.log('页面内容较少，尝试刷新...');
      if (isWindowValid()) {
        await loginWindow.webContents.reload();
        await new Promise(resolve => setTimeout(resolve, 8000));
      }
    }

    // 执行平台特定的登录脚本
    let loginResult;
    switch(store.platform) {
  case '美团':
    loginResult = await executeMeituanLogin(window, store.username, password);
    break;
  case '饿了么':
    loginResult = await executeElemeLogin(window, store.username, password);
    break;
   case '饿了么零售':
    loginResult = await executeElemeRetailLogin(window, store.username, password); // 使用专门的函数
    break;
  case '京东':
    loginResult = await executeJingdongLogin(window, store.username, password);
    break;
  default:
    throw new Error(`暂不支持 ${store.platform} 平台辅助登录`);
}

    if (loginResult.success) {
      // 登录成功后的处理 - 保存UA到会话数据
      await handleLoginSuccess(loginWindow, store, storeUA);
      return { 
        success: true, 
        storeId: store.id, 
        storeName: store.name, 
        platform: store.platform,
        message: '登录成功' 
      };
    } else {
      throw new Error(loginResult.error || '登录失败');
    }

  } catch (error) {
    console.error(`辅助登录失败: ${store.name}`, error);
    await handleLoginFailure(loginWindow, store, error);
    return { 
      success: false, 
      storeId: store.id, 
      storeName: store.name, 
      platform: store.platform,
      error: error.message 
    };
  } finally {
    // 安全关闭窗口 - 添加状态检查
    if (loginWindow && !loginWindow.isDestroyed()) {
      try {
        // 先移除所有事件监听器
        loginWindow.removeAllListeners();
        
        // 延迟关闭以确保所有操作完成
        setTimeout(() => {
          if (!loginWindow.isDestroyed()) {
            loginWindow.destroy(); // 使用destroy而不是close
          }
        }, 1000);
      } catch (error) {
        console.log('关闭窗口时发生错误:', error);
      }
    }
  }
}
// 保存辅助登录的会话数据
// 保存辅助登录的会话数据 - 增加UA参数
async function saveAutoLoginSessionData(window, storeId, userAgent) {
  try {
    const session = window.webContents.session;
    
    // 获取cookies
    const cookies = await session.cookies.get({});
    console.log(`获取到 ${cookies.length} 个cookies`);
    
    // 获取localStorage数据
    const localStorageData = await window.webContents.executeJavaScript(`
      (function() {
        try {
          const allData = {};
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            allData[key] = localStorage.getItem(key);
          }
          return allData;
        } catch (error) {
          console.error('获取localStorage失败:', error);
          return {};
        }
      })()
    `);
    
    // 构建包含UA的会话数据
    const sessionData = {
      cookies: cookies,
      localStorage: localStorageData,
      userAgent: userAgent, // 新增：保存UA
      deviceFingerprint: {
        screenResolution: `${window.getSize()[0]}x${window.getSize()[1]}`,
        savedAt: new Date().toISOString()
      },
      savedAt: new Date().toISOString(),
      storeId: storeId
    };
    
    // 加密并保存到数据库
    const encryptedData = encryptData(sessionData);
    if (!encryptedData) {
      throw new Error('数据加密失败');
    }
    
    const { error } = await supabaseService
      .from('sessions')
      .upsert({
        store_id: storeId,
        session_data: encryptedData,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'store_id'
      });
      
    if (error) {
      console.error('保存会话数据失败:', error);
    } else {
      console.log('会话数据保存成功（包含UA信息）');
    }
    
  } catch (error) {
    console.error('保存辅助登录会话数据失败:', error);
  }
}
// 通用的登录状态检测函数
// 增强的登录状态检测函数
async function checkRealLoginStatus(window, platform) {
  try {
    // 增加等待时间，让页面充分加载
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const status = await window.webContents.executeJavaScript(`
      (function() {
        console.log('开始增强版登录状态检测...');
        
        const currentUrl = window.location.href;
        const pageTitle = document.title.toLowerCase();
        const bodyText = document.body.innerText.toLowerCase();
        const bodyHTML = document.body.innerHTML;
        
        console.log('当前URL:', currentUrl);
        console.log('页面标题:', pageTitle);
        console.log('页面文本长度:', bodyText.length);
        
        // ========== 增强的错误检测 ==========
        const errorIndicators = {
          '美团': [
            // 错误消息选择器
            '.error-msg', '.ant-message-error', '.login-error',
            '.ep-login_error', '.ant-form-item-explain-error',
            // 错误文本
            '账号或密码错误', '登录失败', '验证失败', '账户不存在'
          ],
          '饿了么': [
            '.cook-message-error', '.cook-form-item-explain',
            '.error-message', '.login-error-msg',
            '账号或密码错误', '登录失败', '验证码错误'
          ],
          '京东': [
            '.el-message--error', '.el-form-item__error',
            '.error-message', '.login-error',
            '账号或密码错误', '登录失败', '账户异常'
          ]
        };
        
        // 检查错误信息
        const errors = errorIndicators['${platform}'] || errorIndicators['美团'];
        for (const indicator of errors) {
          if (indicator.startsWith('.')) {
            // 选择器检测
            const element = document.querySelector(indicator);
            if (element && element.textContent) {
              const errorText = element.textContent.trim();
              if (errorText.length > 0) {
                console.log('检测到错误元素:', indicator, errorText);
                return { success: false, error: errorText, reason: 'error_element' };
              }
            }
          } else {
            // 文本检测
            if (bodyText.includes(indicator.toLowerCase())) {
              console.log('检测到错误文本:', indicator);
              return { success: false, error: indicator, reason: 'error_text' };
            }
          }
        }
        
        // ========== 增强的成功检测 ==========
        const successIndicators = {
          '美团': {
            urls: [
              'e.waimai.meituan.com/',
              'retail.meituan.com',
              'waimai.meituan.com/console'
            ],
            elements: [
              '.shop-name', '.user-info', '[class*="dashboard"]',
              '[class*="商家中心"]', 'nav', 'aside', '.main-container',
              '.sidebar', '.header', '.merchant-name'
            ],
            texts: ['门店管理', '订单管理', '数据中心', '商家中心', '退出登录']
          },
          '饿了么': {
            urls: [
              'melody.shop.ele.me',
              'shop.ele.me/merchant',
              'ele.me/merchant'
            ],
            elements: [
              '.shop-info', '.user-center', '[class*="merchant"]',
              '.merchant-dashboard', 'nav', 'aside', '.main-layout'
            ],
            texts: ['门店管理', '订单管理', '商家中心', '门店设置']
          },
          '饿了么零售': {
    urls: [
      'nr.ele.me/home',
      'nr.ele.me/dashboard',
      'nr.ele.me/console',
      'nr.ele.me/merchant'
    ],
    elements: [
      '.dashboard', '.shop-info', '.merchant-info',
      '.ant-layout-sider', '.ant-layout-header',
      '.store-info', '.nav', '.sidebar'
    ],
    texts: ['门店管理', '订单管理', '商品管理', '零售', '数据看板']
  },
          '京东': {
            urls: [
              'store.jddj.com/home',
              'store.jddj.com/dashboard',
              'jddj.com/merchant'
            ],
            elements: [
              '.store-info', '.user-panel', '[class*="merchant"]',
              '.dashboard', 'nav', 'aside', '.main-content'
            ],
            texts: ['店铺管理', '订单管理', '数据中心', '商家后台']
          }
        };
        
        const successConfig = successIndicators['${platform}'] || successIndicators['美团'];
        
        // URL 检测
        const urlSuccess = successConfig.urls.some(url => currentUrl.includes(url));
        console.log('URL检测结果:', urlSuccess, '匹配的URL:', successConfig.urls.find(url => currentUrl.includes(url)));
        
        // 元素检测
        let elementSuccess = false;
        for (const selector of successConfig.elements) {
          const element = document.querySelector(selector);
          if (element) {
            console.log('找到成功元素:', selector);
            elementSuccess = true;
            break;
          }
        }
        
        // 文本检测
        let textSuccess = false;
        for (const text of successConfig.texts) {
          if (bodyText.includes(text.toLowerCase())) {
            console.log('找到成功文本:', text);
            textSuccess = true;
            break;
          }
        }
        
        // 综合判断成功条件
        const urlWeight = 0.4;
        const elementWeight = 0.4;
        const textWeight = 0.2;
        
        let successScore = 0;
        if (urlSuccess) successScore += urlWeight;
        if (elementSuccess) successScore += elementWeight;
        if (textSuccess) successScore += textWeight;
        
        console.log('成功评分:', {
          urlSuccess, elementSuccess, textSuccess, successScore
        });
        
        // 成功阈值
        if (successScore >= 0.6) {
          console.log('判定为登录成功');
          return { 
            success: true, 
            message: '登录成功',
            details: {
              url: currentUrl,
              score: successScore,
              indicators: { urlSuccess, elementSuccess, textSuccess }
            }
          };
        }
        
        // ========== 登录页面检测 ==========
        const loginPageIndicators = {
          '美团': [
            'input#login', 'input#password', '.ep-login_btn',
            'input[placeholder*="账号"]', 'input[placeholder*="密码"]',
            '手机号登录', '账号登录', '密码登录'
          ],
          '饿了么': [
            'input#username_login_user', 'input#username_login_password',
            '.cook-btn-login', 'input[placeholder*="账号"]',
            'input[placeholder*="密码"]', '饿了么商家登录'
          ],
          '饿了么零售': [
    'input[placeholder*="账号"]', 'input[placeholder*="手机"]',
    'input[type="password"]', 'input[placeholder*="密码"]',
    'button[type="submit"]', '.login-btn', 'button:contains("登录")',
    '验证码登录', '短信登录'
  ],
          '京东': [
            'input[type="text"]', 'input[type="password"]',
            '.login-btn', 'input[placeholder*="账号"]',
            'input[placeholder*="密码"]', '京东登录'
          ]
        };
        
        const loginIndicators = loginPageIndicators['${platform}'] || loginPageIndicators['美团'];
        let onLoginPage = false;
        
        for (const indicator of loginIndicators) {
          if (indicator.startsWith('input') || indicator.startsWith('.')) {
            const element = document.querySelector(indicator);
            if (element) {
              onLoginPage = true;
              break;
            }
          } else if (bodyText.includes(indicator.toLowerCase())) {
            onLoginPage = true;
            break;
          }
        }
        
        // 如果还在登录页面且没有错误，可能是登录操作未执行
        if (onLoginPage) {
          console.log('仍然在登录页面');
          return { success: false, error: '登录操作可能未成功执行', reason: 'still_on_login_page' };
        }
        
        // 无法确定状态
        console.log('无法确定登录状态', {
          url: currentUrl,
          title: document.title,
          bodyLength: bodyText.length,
          successScore: successScore
        });
        
        return { success: false, error: '无法确定登录状态', reason: 'ambiguous' };
        
      })();
    `);
    
    return status;
  } catch (error) {
    console.error('检测登录状态时出错:', error);
    return { success: false, error: error.message, reason: 'check_error' };
  }
}
async function executeMeituanLogin(window, username, password) {
  try {
    // 先等待页面可能的重定向或动态加载
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const loginOperation = await window.webContents.executeJavaScript(`
      new Promise((resolve) => {
        function tryLogin() {
          try {
            console.log('开始美团辅助登录流程...');
            
            // 根据提供的元素信息定位表单元素
            const usernameInput = document.querySelector('input#login.ep-input') || 
                                 document.querySelector('input[type="text"][placeholder*="账号"]');
            const passwordInput = document.querySelector('input#password.ep-input') || 
                                 document.querySelector('input[type="password"][placeholder*="密码"]');
            const submitButton = document.querySelector('button.ep-login_btn') || 
                                document.querySelector('button[type="submit"]');
            
            // 美团协议勾选框 - 根据提供的元素信息
            const agreementCheckbox = document.querySelector('input#checkbox.selectChecked[type="checkbox"]') ||
                                     document.querySelector('input[type="checkbox"]') ||
                                     document.querySelector('.ep-checkbox-container input[type="checkbox"]');
            
            console.log('找到的表单元素:', {
              usernameInput: !!usernameInput,
              passwordInput: !!passwordInput,
              submitButton: !!submitButton,
              agreementCheckbox: !!agreementCheckbox
            });
            
            if (!usernameInput || !passwordInput) {
              console.error('找不到必要的登录表单元素');
              resolve({ success: false, error: '找不到登录表单元素' });
              return;
            }
            
            // 清除可能存在的默认值
            usernameInput.value = '';
            passwordInput.value = '';
            
            // 使用更稳定的输入方式
            setTimeout(() => {
              // 输入用户名
              usernameInput.focus();
              usernameInput.select();
              document.execCommand('insertText', false, '${username}');
              
              // 触发输入事件
              usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
              usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
              
              setTimeout(() => {
                // 输入密码
                passwordInput.focus();
                passwordInput.select();
                document.execCommand('insertText', false, '${password}');
                
                // 触发输入事件
                passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
                passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
                
                // 勾选同意协议
                setTimeout(() => {
                  if (agreementCheckbox) {
                    console.log('找到协议勾选框，当前状态:', agreementCheckbox.checked);
                    if (!agreementCheckbox.checked) {
                      // 多种方式尝试勾选
                      try {
                        agreementCheckbox.click();
                        console.log('尝试点击勾选框');
                      } catch (e) {
                        console.log('点击失败，尝试设置checked属性');
                        agreementCheckbox.checked = true;
                      }
                      
                      // 触发change事件
                      agreementCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
                      agreementCheckbox.dispatchEvent(new Event('click', { bubbles: true }));
                      
                      console.log('协议勾选完成，新状态:', agreementCheckbox.checked);
                    } else {
                      console.log('协议已勾选，无需操作');
                    }
                  } else {
                    console.log('未找到协议勾选框，继续登录流程');
                  }
                  
                  // 提交登录
                  setTimeout(() => {
                    if (submitButton) {
                      console.log('点击登录按钮');
                      submitButton.click();
                    } else {
                      // 尝试表单提交
                      const form = usernameInput.closest('form') || 
                                  passwordInput.closest('form') ||
                                  document.querySelector('.ep-password-login_container');
                      if (form) {
                        console.log('尝试表单提交');
                        form.submit();
                      } else {
                        console.error('找不到提交方式');
                        resolve({ success: false, error: '找不到登录按钮或表单' });
                        return;
                      }
                    }
                    resolve({ success: true, message: '登录操作已执行' });
                  }, 1000);
                }, 500);
              }, 500);
            }, 500);
            
          } catch (error) {
            console.error('登录过程中出错:', error);
            resolve({ success: false, error: error.message });
          }
        }
        
        // 首次尝试
        tryLogin();
      });
    `, true);
    
    // 立即检查登录操作结果
    if (loginOperation && !loginOperation.success) {
      return loginOperation;
    }
    
    // 继续后续的状态检查
    return await checkLoginStatusWithRetry(window, '美团', 3);
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}
async function executeElemeRetailLogin(window, username, password) {
  try {
    // 等待页面稳定
    await new Promise(resolve => setTimeout(resolve, 3000));

    const loginOperation = await window.webContents.executeJavaScript(`
      new Promise((resolve) => {
        function tryLogin() {
          try {
            console.log('开始饿了么零售辅助登录流程...');
            
            // 根据提供的元素信息定位表单元素
            // 用户名输入框 - 根据提供的placeholder信息
            const usernameInput = document.querySelector('input[placeholder="请输入您的账号"]') || 
                                 document.querySelector('input[class="ant-input ant-input-lg"]') ||
                                 document.querySelector('input[type="text"]') ||
                                 document.querySelector('input[name="username"]') ||
                                 document.querySelector('input[name="account"]');
            
            // 密码输入框 - 根据提供的placeholder信息
            const passwordInput = document.querySelector('input[placeholder="请输入您的密码"]') || 
                                 document.querySelector('input[type="password"]') ||
                                 document.querySelector('input[class="ant-input ant-input-lg"][type="password"]');
            
            // 登录按钮 - 根据提供的元素信息
            const submitButton = document.querySelector('button[type="button"][class="ant-btn ant-btn-round ant-btn-primary ant-btn-lg ant-btn-block nr-components-button nr-responsive-button eb-login-button"]') || 
                                document.querySelector('button[type="submit"]') ||
                                document.querySelector('button.ant-btn-primary') ||
                                document.querySelector('button[class*="eb-login-button"]');
            
            // 协议勾选框 - 根据提供的元素信息
            const agreementCheckbox = document.querySelector('input[type="checkbox"]') ||
                                     document.querySelector('.eb-login-policy-checkbox input') ||
                                     document.querySelector('i.iconfont') || // 勾选框的icon
                                     document.querySelector('.eb-login-policy-trigger');
            
            // 已阅读并同意文本
            const agreementText = document.querySelector('.eb-login-policy span');
            
            console.log('找到的表单元素:', {
              usernameInput: !!usernameInput,
              passwordInput: !!passwordInput,
              submitButton: !!submitButton,
              agreementCheckbox: !!agreementCheckbox,
              agreementText: !!agreementText
            });
            
            // 如果找不到必要的登录表单元素，尝试通过父容器查找
            if (!usernameInput || !passwordInput || !submitButton) {
              console.log('尝试通过容器查找表单元素...');
              
              // 查找登录表单容器
              const loginForm = document.querySelector('.eb-login-form') ||
                               document.querySelector('.eb-login-main') ||
                               document.querySelector('form');
              
              if (loginForm) {
                console.log('找到登录表单容器，尝试查找子元素');
                
                // 在容器内查找输入框
                const inputs = loginForm.querySelectorAll('input');
                console.log('容器中的输入框数量:', inputs.length);
                
                // 如果没有找到用户名输入框，尝试从所有输入框中识别
                if (!usernameInput && inputs.length > 0) {
                  for (let input of inputs) {
                    const placeholder = input.placeholder || '';
                    const type = input.type || '';
                    if (placeholder.includes('账号') || 
                        placeholder.includes('手机') || 
                        type === 'text') {
                      usernameInput = input;
                      break;
                    }
                  }
                }
                
                // 如果没有找到密码输入框，尝试从所有输入框中识别
                if (!passwordInput && inputs.length > 0) {
                  for (let input of inputs) {
                    if (input.type === 'password') {
                      passwordInput = input;
                      break;
                    }
                  }
                }
                
                // 查找按钮
                const buttons = loginForm.querySelectorAll('button');
                if (!submitButton && buttons.length > 0) {
                  for (let button of buttons) {
                    const text = button.textContent || '';
                    if (text.includes('登录') || 
                        button.type === 'submit' || 
                        button.classList.contains('ant-btn-primary')) {
                      submitButton = button;
                      break;
                    }
                  }
                }
                
                console.log('重新查找后的元素:', {
                  usernameInput: !!usernameInput,
                  passwordInput: !!passwordInput,
                  submitButton: !!submitButton
                });
              }
            }
            
            if (!usernameInput || !passwordInput) {
              console.error('找不到必要的登录表单元素');
              resolve({ success: false, error: '找不到登录表单元素' });
              return;
            }
            
            if (!submitButton) {
              console.warn('找不到登录按钮，将尝试表单提交');
            }
            
            // 清除可能存在的默认值
            usernameInput.value = '';
            passwordInput.value = '';
            
            // 使用更稳定的输入方式
            setTimeout(() => {
              // 输入用户名
              usernameInput.focus();
              usernameInput.select();
              document.execCommand('insertText', false, '${username}');
              
              // 触发输入事件
              usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
              usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
              usernameInput.dispatchEvent(new Event('blur', { bubbles: true }));
              
              setTimeout(() => {
                // 输入密码
                passwordInput.focus();
                passwordInput.select();
                document.execCommand('insertText', false, '${password}');
                
                // 触发输入事件
                passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
                passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
                passwordInput.dispatchEvent(new Event('blur', { bubbles: true }));
                
                // 勾选同意协议（如果存在）
                setTimeout(() => {
                  if (agreementCheckbox) {
                    console.log('找到协议勾选框/区域');
                    
                    // 多种方式尝试勾选
                    try {
                      // 先尝试点击复选框本身
                      if (agreementCheckbox.type === 'checkbox') {
                        console.log('点击复选框，当前状态:', agreementCheckbox.checked);
                        if (!agreementCheckbox.checked) {
                          agreementCheckbox.click();
                        }
                      } else {
                        // 可能是图标或其他元素，尝试点击父元素
                        const parentElement = agreementCheckbox.closest('.eb-login-policy-checkbox') ||
                                            agreementCheckbox.closest('.eb-login-policy-trigger') ||
                                            agreementCheckbox.closest('label') ||
                                            agreementCheckbox.closest('div');
                        
                        if (parentElement) {
                          console.log('点击协议勾选框父元素');
                          parentElement.click();
                        } else {
                          // 尝试点击协议文本区域
                          if (agreementText) {
                            console.log('点击协议文本区域');
                            agreementText.click();
                          } else {
                            console.log('点击协议勾选框本身');
                            agreementCheckbox.click();
                          }
                        }
                      }
                    } catch (e) {
                      console.log('点击协议勾选框失败:', e.message);
                      
                      // 尝试通过设置属性来勾选
                      if (agreementCheckbox.type === 'checkbox') {
                        agreementCheckbox.checked = true;
                        console.log('通过设置属性勾选协议');
                      }
                    }
                    
                    // 触发相关事件
                    if (agreementCheckbox.type === 'checkbox') {
                      agreementCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
                      agreementCheckbox.dispatchEvent(new Event('click', { bubbles: true }));
                    }
                    
                    // 检查勾选状态
                    setTimeout(() => {
                      if (agreementCheckbox.type === 'checkbox') {
                        console.log('协议勾选完成，新状态:', agreementCheckbox.checked);
                      } else {
                        console.log('协议勾选操作已完成（非标准复选框）');
                      }
                    }, 100);
                  } else {
                    console.log('未找到协议勾选框，继续登录流程');
                  }
                  
                  // 提交登录
                  setTimeout(() => {
                    if (submitButton) {
                      console.log('点击登录按钮');
                      
                      // 检查按钮是否可用
                      if (submitButton.disabled) {
                        console.log('登录按钮被禁用，尝试启用');
                        
                        // 如果按钮被禁用，可能是协议未勾选
                        if (agreementCheckbox && agreementCheckbox.type === 'checkbox' && !agreementCheckbox.checked) {
                          console.log('协议未勾选，尝试强制勾选');
                          agreementCheckbox.checked = true;
                          agreementCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
                          
                          // 等待UI更新
                          setTimeout(() => {
                            submitButton.click();
                          }, 500);
                        } else {
                          // 尝试直接点击
                          submitButton.click();
                        }
                      } else {
                        submitButton.click();
                      }
                    } else {
                      // 尝试表单提交
                      const form = usernameInput.closest('form') || 
                                  passwordInput.closest('form') ||
                                  document.querySelector('.eb-login-form');
                      if (form) {
                        console.log('尝试表单提交');
                        form.submit();
                      } else {
                        console.error('找不到提交方式');
                        resolve({ success: false, error: '找不到登录按钮或表单' });
                        return;
                      }
                    }
                    resolve({ success: true, message: '登录操作已执行' });
                  }, 1000);
                }, 500);
              }, 500);
            }, 500);
            
          } catch (error) {
            console.error('登录过程中出错:', error);
            resolve({ success: false, error: error.message });
          }
        }
        
        // 首次尝试
        tryLogin();
      });
    `, true);

    // 立即检查登录操作结果
    if (loginOperation && !loginOperation.success) {
      return loginOperation;
    }

    // 等待登录操作完成
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 检查登录状态
    const loginStatus = await checkRealLoginStatus(window, '饿了么零售');
    
    if (loginStatus.success) {
      return { success: true, message: '登录成功' };
    } else {
      // 尝试再次登录
      console.log('首次登录尝试可能失败，等待后重试...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const retryStatus = await checkRealLoginStatus(window, '饿了么零售');
      if (retryStatus.success) {
        return { success: true, message: '登录成功（重试后）' };
      } else {
        return { 
          success: false, 
          error: retryStatus.error || '登录失败，请检查账号密码或手动登录',
          details: retryStatus
        };
      }
    }

  } catch (error) {
    console.error('饿了么零售登录执行错误:', error);
    return { success: false, error: error.message };
  }
}
// 修改 executeElemeLogin 函数以支持饿了么零售
async function executeElemeLogin(window, username, password) {
  try {
    // 等待页面稳定
    await new Promise(resolve => setTimeout(resolve, 3000));
    
   const loginOperation = await window.webContents.executeJavaScript(`
      new Promise((resolve) => {
        function tryLogin() {
          try {
            console.log('开始饿了么辅助登录流程...');
            
            // 根据提供的元素信息定位表单元素
            const usernameInput = document.querySelector('input#username_login_user name.cook-input.cook-input-lg') || 
                                 document.querySelector('input[placeholder="请输入您的账号"]') ||
                                 document.querySelector('input#username.login_username');
            
            const passwordInput = document.querySelector('input#username_login_password.cook-input.cook-input-lg') || 
                                 document.querySelector('input[placeholder="请输入您的密码"]') ||
                                 document.querySelector('input[type="password"]');
            
            const submitButton = document.querySelector('button.cook-btn.cook-btn-primary.cook-btn-round.cook-btn-lg.cook-btn-block') || 
                                document.querySelector('button[type="submit"]');
            
            // 饿了么协议勾选框 - 根据提供的元素信息
            const agreementCheckbox = document.querySelector('input.cook-checkbox-input[type="checkbox"]') ||
                                     document.querySelector('.cook-checkbox input[type="checkbox"]');
            
            console.log('找到的表单元素:', {
              usernameInput: !!usernameInput,
              passwordInput: !!passwordInput,
              submitButton: !!submitButton,
              agreementCheckbox: !!agreementCheckbox
            });
            
            if (!usernameInput || !passwordInput || !submitButton) {
              console.error('找不到必要的登录表单元素');
              // 尝试通过表单ID查找
              const loginForm = document.getElementById('username_login');
              if (loginForm) {
                console.log('找到登录表单，尝试通过表单查找元素');
                const inputs = loginForm.querySelectorAll('input');
                console.log('表单中的输入框数量:', inputs.length);
              }
              resolve({ success: false, error: '找不到登录表单元素' });
              return;
            }
            
            // 清除可能存在的默认值
            usernameInput.value = '';
            passwordInput.value = '';
            
            // 使用更稳定的输入方式
            setTimeout(() => {
              // 输入用户名
              usernameInput.focus();
              usernameInput.select();
              document.execCommand('insertText', false, '${username}');
              
              // 触发输入事件
              usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
              usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
              
              setTimeout(() => {
                // 输入密码
                passwordInput.focus();
                passwordInput.select();
                document.execCommand('insertText', false, '${password}');
                
                // 触发输入事件
                passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
                passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
                
                // 勾选同意协议
                setTimeout(() => {
                  if (agreementCheckbox) {
                    console.log('找到协议勾选框，当前状态:', agreementCheckbox.checked);
                    if (!agreementCheckbox.checked) {
                      // 多种方式尝试勾选
                      try {
                        // 先尝试点击复选框的父元素（通常是label）
                        const checkboxWrapper = agreementCheckbox.closest('.cook-checkbox-wrapper') ||
                                              agreementCheckbox.closest('label');
                        if (checkboxWrapper) {
                          checkboxWrapper.click();
                          console.log('点击复选框包装元素');
                        } else {
                          agreementCheckbox.click();
                          console.log('直接点击复选框');
                        }
                      } catch (e) {
                        console.log('点击失败，尝试设置checked属性');
                        agreementCheckbox.checked = true;
                      }
                      
                      // 触发change事件
                      agreementCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
                      agreementCheckbox.dispatchEvent(new Event('click', { bubbles: true }));
                      
                      // 再次检查状态
                      setTimeout(() => {
                        console.log('协议勾选完成，新状态:', agreementCheckbox.checked);
                      }, 100);
                    } else {
                      console.log('协议已勾选，无需操作');
                    }
                  } else {
                    console.log('未找到协议勾选框，继续登录流程');
                  }
                  
                  // 提交登录
                  setTimeout(() => {
                    console.log('点击登录按钮');
                    
                    // 检查按钮是否可用
                    if (submitButton.disabled) {
                      console.log('登录按钮被禁用，检查协议是否已勾选');
                      if (agreementCheckbox && !agreementCheckbox.checked) {
                        console.log('协议未勾选，尝试强制勾选');
                        agreementCheckbox.checked = true;
                        agreementCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
                      }
                    }
                    
                    submitButton.click();
                    resolve({ success: true, message: '登录操作已执行' });
                  }, 1000);
                }, 500);
              }, 500);
            }, 500);
            
          } catch (error) {
            console.error('登录过程中出错:', error);
            resolve({ success: false, error: error.message });
          }
        }
        
        // 首次尝试
        tryLogin();
      });
    `, true);
    
   if (loginOperation && !loginOperation.success) {
      return loginOperation;
    }
    
    return await checkLoginStatusWithRetry(window, '饿了么',3);
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function executeJingdongLogin(window, username, password) {
  try {
    // 等待页面稳定
    await new Promise(resolve => setTimeout(resolve, 3000));

    const loginOperation = await window.webContents.executeJavaScript(`
      new Promise((resolve) => {
        try {
          // 多种选择器尝试
          const selectors = {
            username: [
              'input[placeholder*="账号"]',
              'input[placeholder*="用户名"]',
              'input[type="text"]',
              '.el-input__inner',
              '#username'
            ],
            password: [
              'input[type="password"]',
              'input[placeholder*="密码"]',
              '#password'
            ],
            submit: [
              'button[type="submit"]',
              '.login-btn',
              '.el-button--primary',
              'button:contains("登录")'
            ]
          };

          function findElement(selectors) {
            for (const selector of selectors) {
              const element = document.querySelector(selector);
              if (element) return element;
            }
            return null;
          }

          const usernameInput = findElement(selectors.username);
          const passwordInput = findElement(selectors.password);
          const submitButton = findElement(selectors.submit);

          if (!usernameInput || !passwordInput) {
            resolve({ success: false, error: '找不到登录表单' });
            return;
          }

          // 清除现有内容并输入新内容
          usernameInput.value = '';
          passwordInput.value = '';
          
          // 使用更稳定的输入方式
          setTimeout(() => {
            usernameInput.focus();
            document.execCommand('insertText', false, '${username}');
            
            setTimeout(() => {
              passwordInput.focus();
              document.execCommand('insertText', false, '${password}');
              
              setTimeout(() => {
                if (submitButton) {
                  submitButton.click();
                } else {
                  // 尝试表单提交
                  const form = usernameInput.closest('form') || passwordInput.closest('form');
                  if (form) form.submit();
                }
                resolve({ success: true, message: '登录操作已执行' });
              }, 500);
            }, 500);
          }, 500);

        } catch (error) {
          resolve({ success: false, error: error.message });
        }
      });
    `, true);

    if (loginOperation && !loginOperation.success) {
      return loginOperation;
    }
    
    return await checkLoginStatusWithRetry(window, '京东',3);
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}
// 辅助函数：带重试的登录状态检查
// 增强的重试机制
async function checkLoginStatusWithRetry(window, platform, maxRetries = 3) {
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    console.log(`第 ${retryCount + 1} 次登录状态检查...`);
    
    const result = await checkRealLoginStatus(window, platform);
    
    if (result.success) {
      console.log('登录状态确认成功');
      return result;
    }
    
    if (result.reason !== 'ambiguous') {
      // 明确的失败，直接返回
      console.log('明确的登录失败:', result.error);
      return result;
    }
    
    // 状态不明确，重试
    retryCount++;
    if (retryCount < maxRetries) {
      console.log(`状态不明确，等待5秒后重试 (${retryCount}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  // 所有重试后仍然不明确
  console.log(`经过 ${maxRetries} 次重试后仍无法确定登录状态`);
  return { 
    success: false, 
    error: `经过 ${maxRetries} 次检测仍无法确定登录状态`, 
    reason: 'max_retries_exceeded' 
  };
}
// 登录成功处理 - 增加UA参数
async function handleLoginSuccess(window, store, userAgent) {
  try {
    console.log(`登录成功: ${store.name}`);
    
    // 保存会话数据（包含UA信息）
    await saveAutoLoginSessionData(window, store.id, userAgent);
    
    // 更新门店状态
    await supabaseService
      .from('stores')
      .update({
        login_status: 'success',
        last_login_time: new Date().toISOString(),
        login_error_message: null,
        user_agent: userAgent // 新增：保存UA到门店表
      })
      .eq('id', store.id);
      
  } catch (error) {
    console.error('处理登录成功时出错:', error);
  }
}

// 登录失败处理
async function handleLoginFailure(window, store, error) {
  try {
    // 更新门店状态为失败
    await supabaseService
      .from('stores')
      .update({
        login_status: 'failed',
        login_error_message: error.message
      })
      .eq('id', store.id);
      
  } catch (updateError) {
    console.error('更新登录状态失败:', updateError);
  }
}
// 下载Excel模板
ipcMain.handle('download-excel-template', async (event) => {
  try {
    const templateData = [
      {
        '门店名称*': '示例门店',
        '平台*': '美团',
        '账号': 'test@example.com',
        '密码': '123456',
        '联系人': '张三',
        '联系电话': '13800138000',
        '省份': '广东省',
        '城市': '深圳市',
        '分类': '快餐简餐'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '门店模板');

    // 设置列宽
    const colWidths = [
      { wch: 15 }, // 门店名称
      { wch: 10 }, // 平台
      { wch: 20 }, // 账号
      { wch: 15 }, // 密码
      { wch: 10 }, // 联系人
      { wch: 15 }, // 联系电话
      { wch: 10 }, // 省份
      { wch: 10 }, // 城市
      { wch: 10 }  // 分类
    ];
    worksheet['!cols'] = colWidths;

    // 生成文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const defaultFileName = `门店导入模板_${timestamp}.xlsx`;
    
    // 使用保存对话框让用户选择保存位置
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '保存门店导入模板',
      defaultPath: path.join(app.getPath('desktop'), defaultFileName),
      filters: [
        { name: 'Excel文件', extensions: ['xlsx'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['showOverwriteConfirmation']
    });

    if (canceled || !filePath) {
      return createErrorResponse('USER_CANCELLED', '用户取消了保存');
    }

    // 确保文件扩展名正确
    let finalFilePath = filePath;
    if (!filePath.toLowerCase().endsWith('.xlsx')) {
      finalFilePath = filePath + '.xlsx';
    }

    XLSX.writeFile(workbook, finalFilePath);

    // 显示成功提示
    dialog.showMessageBox({
      type: 'info',
      title: '模板下载成功',
      message: '门店导入模板保存成功',
      detail: `文件位置: ${finalFilePath}`,
      buttons: ['确定']
    });

    return createSuccessResponse({
      filePath: finalFilePath,
      fileName: path.basename(finalFilePath),
      directory: path.dirname(finalFilePath),
      fullPath: finalFilePath
    }, '模板下载成功');

  } catch (error) {
    console.error('下载模板错误:', error);
    return createErrorResponse('DOWNLOAD_TEMPLATE_ERROR', '下载模板失败: ' + error.message);
  }
});
// 在 IPC 处理器部分添加驾驶舱相关处理
ipcMain.handle('open-dashboard', async () => {
  try {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      if (dashboardWindow.isMinimized()) {
        dashboardWindow.restore();
      }
      dashboardWindow.focus();
      return createSuccessResponse({ action: 'focused' }, '驾驶舱已聚焦');
    }

    dashboardWindow = createDashboardWindow();
    return createSuccessResponse({ action: 'opened' }, '驾驶舱已打开');
  } catch (error) {
    console.error('打开驾驶舱错误:', error);
    return createErrorResponse('OPEN_DASHBOARD_ERROR', '打开驾驶舱失败');
  }
});
ipcMain.handle('get-dashboard-data', async () => {
  if (!currentUser) return createErrorResponse('NOT_LOGGED_IN', '未登录');

  try {
    const dashboardData = await getDashboardData();
    return createSuccessResponse(dashboardData, '驾驶舱数据获取成功');
  } catch (error) {
    console.error('获取驾驶舱数据错误:', error);
    return createErrorResponse('GET_DASHBOARD_DATA_ERROR', '获取驾驶舱数据失败');
  }
});
// 替换原来的 getDashboardData 函数 - 添加最近活动记录
async function getDashboardData() {
    const now = new Date();
    
    // 修复时区问题：使用本地时间的开始和结束
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    
    // 修正时间范围计算：确保包含今天、昨天、前天
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
    
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(now.getDate() - 2);
    const twoDaysAgoStart = new Date(twoDaysAgo.getFullYear(), twoDaysAgo.getMonth(), twoDaysAgo.getDate());
    
    const threeDaysAgo = new Date(now);
    threeDaysAgo.setDate(now.getDate() - 3);
    
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    try {
        console.log('=== 驾驶舱数据查询开始 ===');
        console.log('当前用户:', {
            id: currentUser.id,
            name: currentUser.name,
            role: currentUser.role
        });

        // 根据用户角色构建查询条件
        let storeQueryCondition = null;
        let userQueryCondition = null;

        if (currentUser.role === 'super_admin') {
            // 超级管理员：查看所有数据
            storeQueryCondition = null;
            userQueryCondition = null;
            console.log('超级管理员权限：查看所有数据');
        } else if (currentUser.role === 'admin') {
            // 管理员：只能查看自己及名下员工的数据
            const { data: employees, error: empError } = await supabaseService
                .from('users')
                .select('id')
                .eq('admin_id', currentUser.id)
                .eq('is_active', true);

            if (empError) throw empError;

            const accessibleUserIds = employees ? employees.map(e => e.id) : [];
            accessibleUserIds.push(currentUser.id);

            storeQueryCondition = { type: 'in', field: 'owner_id', values: accessibleUserIds };
            userQueryCondition = { type: 'in', field: 'id', values: accessibleUserIds };
            console.log('管理员权限：查看自己及名下员工的数据，可访问用户ID:', accessibleUserIds);
        } else {
            // 员工：只能查看自己的数据
            storeQueryCondition = { type: 'eq', field: 'owner_id', value: currentUser.id };
            userQueryCondition = { type: 'eq', field: 'id', value: currentUser.id };
            console.log('员工权限：只能查看自己的数据');
        }

        // 使用并行查询提高速度
        const queries = [];
        
        // 1. 门店总数量 - 添加权限条件
        let totalStoresQuery = supabaseService.from('stores').select('*', { count: 'exact', head: true });
        if (storeQueryCondition) {
            if (storeQueryCondition.type === 'eq') {
                totalStoresQuery = totalStoresQuery.eq(storeQueryCondition.field, storeQueryCondition.value);
            } else if (storeQueryCondition.type === 'in') {
                totalStoresQuery = totalStoresQuery.in(storeQueryCondition.field, storeQueryCondition.values);
            }
        }
        queries.push(totalStoresQuery);
        
        // 2. 用户总数量 - 添加权限条件
        let totalUsersQuery = supabaseService.from('users').select('*', { count: 'exact', head: true });
        if (userQueryCondition) {
            if (userQueryCondition.type === 'eq') {
                totalUsersQuery = totalUsersQuery.eq(userQueryCondition.field, userQueryCondition.value);
            } else if (userQueryCondition.type === 'in') {
                totalUsersQuery = totalUsersQuery.in(userQueryCondition.field, userQueryCondition.values);
            }
        }
        queries.push(totalUsersQuery);
        
        // 3. 所有门店数据（用于用户排行）- 添加权限条件
        let allStoresQuery = supabaseService.from('stores').select('owner_id');
        if (storeQueryCondition) {
            if (storeQueryCondition.type === 'eq') {
                allStoresQuery = allStoresQuery.eq(storeQueryCondition.field, storeQueryCondition.value);
            } else if (storeQueryCondition.type === 'in') {
                allStoresQuery = allStoresQuery.in(storeQueryCondition.field, storeQueryCondition.values);
            }
        }
        queries.push(allStoresQuery);
        
        // 4. 平台分布 - 添加权限条件
        let platformStoresQuery = supabaseService.from('stores').select('platform');
        if (storeQueryCondition) {
            if (storeQueryCondition.type === 'eq') {
                platformStoresQuery = platformStoresQuery.eq(storeQueryCondition.field, storeQueryCondition.value);
            } else if (storeQueryCondition.type === 'in') {
                platformStoresQuery = platformStoresQuery.in(storeQueryCondition.field, storeQueryCondition.values);
            }
        }
        queries.push(platformStoresQuery);
        
        // 5. 地区分布 - 添加权限条件
        let regionStoresQuery = supabaseService.from('stores').select('province').not('province', 'is', null);
        if (storeQueryCondition) {
            if (storeQueryCondition.type === 'eq') {
                regionStoresQuery = regionStoresQuery.eq(storeQueryCondition.field, storeQueryCondition.value);
            } else if (storeQueryCondition.type === 'in') {
                regionStoresQuery = regionStoresQuery.in(storeQueryCondition.field, storeQueryCondition.values);
            }
        }
        queries.push(regionStoresQuery);
        
        // 6. 分类分布 - 添加权限条件
        let categoryStoresQuery = supabaseService.from('stores').select('category').not('category', 'is', null);
        if (storeQueryCondition) {
            if (storeQueryCondition.type === 'eq') {
                categoryStoresQuery = categoryStoresQuery.eq(storeQueryCondition.field, storeQueryCondition.value);
            } else if (storeQueryCondition.type === 'in') {
                categoryStoresQuery = categoryStoresQuery.in(storeQueryCondition.field, storeQueryCondition.values);
            }
        }
        queries.push(categoryStoresQuery);
        
        // 7. 今日新增 - 添加权限条件
        let todayStoresQuery = supabaseService.from('stores').select('*', { count: 'exact', head: true })
            .gte('created_at', todayStart.toISOString())
            .lt('created_at', todayEnd.toISOString());
        if (storeQueryCondition) {
            if (storeQueryCondition.type === 'eq') {
                todayStoresQuery = todayStoresQuery.eq(storeQueryCondition.field, storeQueryCondition.value);
            } else if (storeQueryCondition.type === 'in') {
                todayStoresQuery = todayStoresQuery.in(storeQueryCondition.field, storeQueryCondition.values);
            }
        }
        queries.push(todayStoresQuery);
        
        // 8. 近三天新增 - 添加权限条件
        let threeDaysStoresQuery = supabaseService.from('stores').select('*', { count: 'exact', head: true })
            .gte('created_at', threeDaysAgo.toISOString());
        if (storeQueryCondition) {
            if (storeQueryCondition.type === 'eq') {
                threeDaysStoresQuery = threeDaysStoresQuery.eq(storeQueryCondition.field, storeQueryCondition.value);
            } else if (storeQueryCondition.type === 'in') {
                threeDaysStoresQuery = threeDaysStoresQuery.in(storeQueryCondition.field, storeQueryCondition.values);
            }
        }
        queries.push(threeDaysStoresQuery);
        
        // 9. 近七日新增 - 添加权限条件
        let weekStoresQuery = supabaseService.from('stores').select('*', { count: 'exact', head: true })
            .gte('created_at', sevenDaysAgo.toISOString());
        if (storeQueryCondition) {
            if (storeQueryCondition.type === 'eq') {
                weekStoresQuery = weekStoresQuery.eq(storeQueryCondition.field, storeQueryCondition.value);
            } else if (storeQueryCondition.type === 'in') {
                weekStoresQuery = weekStoresQuery.in(storeQueryCondition.field, storeQueryCondition.values);
            }
        }
        queries.push(weekStoresQuery);
        
        // 10. 近一月新增 - 添加权限条件
        let monthStoresQuery = supabaseService.from('stores').select('*', { count: 'exact', head: true })
            .gte('created_at', thirtyDaysAgo.toISOString());
        if (storeQueryCondition) {
            if (storeQueryCondition.type === 'eq') {
                monthStoresQuery = monthStoresQuery.eq(storeQueryCondition.field, storeQueryCondition.value);
            } else if (storeQueryCondition.type === 'in') {
                monthStoresQuery = monthStoresQuery.in(storeQueryCondition.field, storeQueryCondition.values);
            }
        }
        queries.push(monthStoresQuery);
        
        // 11. 近三月新增 - 添加权限条件
        let quarterStoresQuery = supabaseService.from('stores').select('*', { count: 'exact', head: true })
            .gte('created_at', ninetyDaysAgo.toISOString());
        if (storeQueryCondition) {
            if (storeQueryCondition.type === 'eq') {
                quarterStoresQuery = quarterStoresQuery.eq(storeQueryCondition.field, storeQueryCondition.value);
            } else if (storeQueryCondition.type === 'in') {
                quarterStoresQuery = quarterStoresQuery.in(storeQueryCondition.field, storeQueryCondition.values);
            }
        }
        queries.push(quarterStoresQuery);
        
        // 12. 活跃门店（最近7天有更新的）- 添加权限条件
        let activeStoresQuery = supabaseService.from('stores').select('*', { count: 'exact', head: true })
            .gte('updated_at', sevenDaysAgo.toISOString());
        if (storeQueryCondition) {
            if (storeQueryCondition.type === 'eq') {
                activeStoresQuery = activeStoresQuery.eq(storeQueryCondition.field, storeQueryCondition.value);
            } else if (storeQueryCondition.type === 'in') {
                activeStoresQuery = activeStoresQuery.in(storeQueryCondition.field, storeQueryCondition.values);
            }
        }
        queries.push(activeStoresQuery);
        
        // 13. 近三日新增的门店详细信息 - 根据权限动态构建查询
        let recentCreatedStoresQuery = supabaseService.from('stores')
            .select('id, name, platform, created_at, owner_id, province, city, category')
            .gte('created_at', twoDaysAgoStart.toISOString())
            .order('created_at', { ascending: false })
            .limit(15);

        // 14. 近三日更新的门店详细信息 - 根据权限动态构建查询
        let recentUpdatedStoresQuery = supabaseService.from('stores')
            .select('id, name, platform, updated_at, owner_id, province, city, category')
            .gte('updated_at', twoDaysAgoStart.toISOString())
            .order('updated_at', { ascending: false })
            .limit(15);

        // 根据用户角色应用不同的权限控制到动态记录查询
        if (currentUser.role === 'super_admin') {
            // 超级管理员：查看所有数据，不需要额外过滤
            console.log('超级管理员权限：查看所有动态');
        } else if (currentUser.role === 'admin') {
            // 管理员：只能查看自己及名下员工的数据
            console.log('管理员权限：查看自己及名下员工的动态');
            
            // 获取管理员名下的所有员工ID（包括自己）
            const { data: employees, error: empError } = await supabaseService
                .from('users')
                .select('id')
                .or(`admin_id.eq.${currentUser.id},id.eq.${currentUser.id}`)
                .eq('is_active', true);

            if (empError) {
                console.error('获取员工列表错误:', empError);
            } else {
                const accessibleUserIds = employees ? employees.map(e => e.id) : [currentUser.id];
                console.log('管理员可访问的用户ID:', accessibleUserIds);
                
                // 应用权限过滤
                recentCreatedStoresQuery = recentCreatedStoresQuery.in('owner_id', accessibleUserIds);
                recentUpdatedStoresQuery = recentUpdatedStoresQuery.in('owner_id', accessibleUserIds);
            }
        } else {
            // 员工：只能查看自己的数据
            console.log('员工权限：只能查看自己的动态');
            recentCreatedStoresQuery = recentCreatedStoresQuery.eq('owner_id', currentUser.id);
            recentUpdatedStoresQuery = recentUpdatedStoresQuery.eq('owner_id', currentUser.id);
        }

        queries.push(recentCreatedStoresQuery);
        queries.push(recentUpdatedStoresQuery);

        // 执行所有查询
        const results = await Promise.all(queries);

        // 处理结果
        const totalStoresCount = results[0].count || 0;
        const totalUsersCount = results[1].count || 0;
        const allStoresData = results[2].data || [];
        const platformStoresData = results[3].data || [];
        const regionStoresData = results[4].data || [];
        const categoryStoresData = results[5].data || [];
        const todayStoresCount = results[6].count || 0;
        const threeDaysStoresCount = results[7].count || 0;
        const weekStoresCount = results[8].count || 0;
        const monthStoresCount = results[9].count || 0;
        const quarterStoresCount = results[10].count || 0;
        const activeStoresCount = results[11].count || 0;
        const recentCreatedStoresData = results[12].data || [];
        const recentUpdatedStoresData = results[13].data || [];

        console.log('查询到的最近新增门店数量:', recentCreatedStoresData.length);
        console.log('查询到的最近更新门店数量:', recentUpdatedStoresData.length);

        // 获取用户信息映射
        let userMap = {};
        if (allStoresData && allStoresData.length > 0) {
            const userIds = [...new Set(allStoresData.map(store => store.owner_id))];
            if (userIds.length > 0) {
                let usersQuery = supabaseService.from('users').select('id, name, role');
                
                // 应用相同的权限控制
                if (currentUser.role === 'super_admin') {
                    // 超级管理员可以查看所有用户
                    usersQuery = usersQuery.in('id', userIds);
                } else if (currentUser.role === 'admin') {
                    // 管理员只能查看自己及名下员工
                    const { data: employees } = await supabaseService
                        .from('users')
                        .select('id')
                        .or(`admin_id.eq.${currentUser.id},id.eq.${currentUser.id}`)
                        .eq('is_active', true);
                        
                    const accessibleIds = employees ? employees.map(e => e.id) : [currentUser.id];
                    const filteredUserIds = userIds.filter(id => accessibleIds.includes(id));
                    usersQuery = usersQuery.in('id', filteredUserIds);
                } else {
                    // 员工只能查看自己
                    usersQuery = usersQuery.eq('id', currentUser.id);
                }
                
                const usersResult = await usersQuery;
                
                if (usersResult.data) {
                    usersResult.data.forEach(user => {
                        userMap[user.id] = {
                            name: user.name,
                            role: user.role
                        };
                    });
                }
                console.log('用户映射构建完成:', Object.keys(userMap).length, '个用户');
            }
        }

        // 处理最近活动记录
        const recentActivities = [];

        // 处理新增门店记录
        if (recentCreatedStoresData && recentCreatedStoresData.length > 0) {
            recentCreatedStoresData.forEach(store => {
                const user = userMap[store.owner_id];
                if (!user) {
                    console.log('未找到用户信息，跳过记录:', store.owner_id);
                    return; // 如果用户信息不存在，跳过
                }
                
                // 根据用户角色显示不同的称呼
                let userDisplayName = user.name || '未知用户';
                let userRoleDisplay = '';
                
                switch (user.role) {
                    case 'super_admin':
                        userRoleDisplay = '超级管理员';
                        break;
                    case 'admin':
                        userRoleDisplay = '管理员';
                        break;
                    default:
                        userRoleDisplay = '员工';
                }
                
                const createTime = new Date(store.created_at);
                const timeStr = formatActivityTime(createTime);
                
                // 构建活动内容
                let activityContent = `${userDisplayName}${userRoleDisplay}新增了`;
                
                if (store.category) {
                    activityContent += `${store.category}分类`;
                }
                
                activityContent += `${store.platform}门店「${store.name}」`;
                
                // 添加地址信息
                if (store.province || store.city) {
                    const address = [store.province, store.city].filter(Boolean).join('-');
                    activityContent += ` [地区: ${address}]`;
                }
                
                if (store.category) {
                    activityContent += ` [分类: ${store.category}]`;
                }
                
                recentActivities.push({
                    time: timeStr,
                    content: activityContent,
                    timestamp: createTime.getTime(),
                    type: 'create',
                    userId: store.owner_id,
                    userRole: user.role
                });
            });
        }

        // 处理更新门店记录  
        if (recentUpdatedStoresData && recentUpdatedStoresData.length > 0) {
            recentUpdatedStoresData.forEach(store => {
                const user = userMap[store.owner_id];
                if (!user) {
                    console.log('未找到用户信息，跳过记录:', store.owner_id);
                    return;
                }
                
                let userDisplayName = user.name || '未知用户';
                let userRoleDisplay = '';
                
                switch (user.role) {
                    case 'super_admin':
                        userRoleDisplay = '超级管理员';
                        break;
                    case 'admin':
                        userRoleDisplay = '管理员';
                        break;
                    default:
                        userRoleDisplay = '员工';
                }
                
                const updateTime = new Date(store.updated_at);
                const timeStr = formatActivityTime(updateTime);
                
                let activityContent = `${userDisplayName}${userRoleDisplay}更新了${store.platform}门店「${store.name}」的信息`;
                
                // 添加详细信息
                const details = [];
                if (store.category) details.push(`分类: ${store.category}`);
                if (store.province || store.city) {
                    const address = [store.province, store.city].filter(Boolean).join('-');
                    details.push(`地址: ${address}`);
                }
                
                if (details.length > 0) {
                    activityContent += ` [${details.join('] [')}]`;
                }
                
                recentActivities.push({
                    time: timeStr,
                    content: activityContent,
                    timestamp: updateTime.getTime(),
                    type: 'update',
                    userId: store.owner_id,
                    userRole: user.role
                });
            });
        }

        // 按时间排序，取最新的15条
        recentActivities.sort((a, b) => b.timestamp - a.timestamp);
        const sortedActivities = recentActivities.slice(0, 15);
        
        console.log('构建的动态记录数量:', sortedActivities.length);

        // 获取各时间段按平台分组的数据
        const platformTrendQueries = [];
        
        // 近三天各平台新增
        let threeDaysByPlatformQuery = supabaseService.from('stores')
            .select('platform')
            .gte('created_at', threeDaysAgo.toISOString());
        if (storeQueryCondition) {
            if (storeQueryCondition.type === 'eq') {
                threeDaysByPlatformQuery = threeDaysByPlatformQuery.eq(storeQueryCondition.field, storeQueryCondition.value);
            } else if (storeQueryCondition.type === 'in') {
                threeDaysByPlatformQuery = threeDaysByPlatformQuery.in(storeQueryCondition.field, storeQueryCondition.values);
            }
        }
        platformTrendQueries.push(threeDaysByPlatformQuery);
        
        // 近一周各平台新增
        let weekByPlatformQuery = supabaseService.from('stores')
            .select('platform')
            .gte('created_at', sevenDaysAgo.toISOString());
        if (storeQueryCondition) {
            if (storeQueryCondition.type === 'eq') {
                weekByPlatformQuery = weekByPlatformQuery.eq(storeQueryCondition.field, storeQueryCondition.value);
            } else if (storeQueryCondition.type === 'in') {
                weekByPlatformQuery = weekByPlatformQuery.in(storeQueryCondition.field, storeQueryCondition.values);
            }
        }
        platformTrendQueries.push(weekByPlatformQuery);
        
        // 近一月各平台新增
        let monthByPlatformQuery = supabaseService.from('stores')
            .select('platform')
            .gte('created_at', thirtyDaysAgo.toISOString());
        if (storeQueryCondition) {
            if (storeQueryCondition.type === 'eq') {
                monthByPlatformQuery = monthByPlatformQuery.eq(storeQueryCondition.field, storeQueryCondition.value);
            } else if (storeQueryCondition.type === 'in') {
                monthByPlatformQuery = monthByPlatformQuery.in(storeQueryCondition.field, storeQueryCondition.values);
            }
        }
        platformTrendQueries.push(monthByPlatformQuery);
        
        // 近三月各平台新增
        let quarterByPlatformQuery = supabaseService.from('stores')
            .select('platform')
            .gte('created_at', ninetyDaysAgo.toISOString());
        if (storeQueryCondition) {
            if (storeQueryCondition.type === 'eq') {
                quarterByPlatformQuery = quarterByPlatformQuery.eq(storeQueryCondition.field, storeQueryCondition.value);
            } else if (storeQueryCondition.type === 'in') {
                quarterByPlatformQuery = quarterByPlatformQuery.in(storeQueryCondition.field, storeQueryCondition.values);
            }
        }
        platformTrendQueries.push(quarterByPlatformQuery);

        const platformTrendResults = await Promise.all(platformTrendQueries);
        
        const timeTrendByPlatform = {
            threeDays: processPlatformData(platformTrendResults[0].data),
            oneWeek: processPlatformData(platformTrendResults[1].data),
            oneMonth: processPlatformData(platformTrendResults[2].data),
            threeMonths: processPlatformData(platformTrendResults[3].data)
        };

        // 用户门店数量排行（前五）
        let userStoreRanking = [];
        if (allStoresData && Array.isArray(allStoresData)) {
            const countMap = {};
            allStoresData.forEach(store => {
                countMap[store.owner_id] = (countMap[store.owner_id] || 0) + 1;
            });
            
            const sorted = Object.entries(countMap)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);
            
            if (sorted.length > 0) {
                const userIds = sorted.map(item => item[0]);
                
                let usersQuery = supabaseService.from('users').select('id, name');
                if (currentUser.role === 'admin') {
                    const { data: employees } = await supabaseService
                        .from('users')
                        .select('id')
                        .eq('admin_id', currentUser.id)
                        .eq('is_active', true);

                    const accessibleIds = employees ? employees.map(e => e.id) : [];
                    accessibleIds.push(currentUser.id);
                    usersQuery = usersQuery.in('id', accessibleIds);
                } else if (currentUser.role === 'employee') {
                    usersQuery = usersQuery.eq('id', currentUser.id);
                }
                
                const usersResult = await usersQuery.in('id', userIds);
                
                const userRankingMap = {};
                if (usersResult.data && Array.isArray(usersResult.data)) {
                    usersResult.data.forEach(user => userRankingMap[user.id] = user.name);
                }
                
                userStoreRanking = sorted.map(([userId, count]) => ({
                    user_name: userRankingMap[userId] || '未知用户',
                    store_count: count
                }));
            }
        }

        // 平台分布
        let platformDistribution = [];
        if (platformStoresData && Array.isArray(platformStoresData)) {
            const distribution = {};
            platformStoresData.forEach(store => {
                distribution[store.platform] = (distribution[store.platform] || 0) + 1;
            });
            platformDistribution = Object.entries(distribution).map(([platform, count]) => ({
                platform,
                count
            })).sort((a, b) => b.count - a.count);
        }

        // 地区分布
        let regionDistribution = [];
        if (regionStoresData && Array.isArray(regionStoresData)) {
            const distribution = {};
            regionStoresData.forEach(store => {
                if (store.province) {
                    distribution[store.province] = (distribution[store.province] || 0) + 1;
                }
            });
            regionDistribution = Object.entries(distribution).map(([province, count]) => ({
                province,
                count
            })).sort((a, b) => b.count - a.count);
        }

        // 分类分布
        let categoryDistribution = [];
        if (categoryStoresData && Array.isArray(categoryStoresData)) {
            const distribution = {};
            categoryStoresData.forEach(store => {
                if (store.category) {
                    distribution[store.category] = (distribution[store.category] || 0) + 1;
                }
            });
            categoryDistribution = Object.entries(distribution).map(([category, count]) => ({
                category,
                count
            })).sort((a, b) => b.count - a.count);
        }

        console.log('=== 驾驶舱数据查询完成 ===');
        
        return {
            summary: {
                total_stores: totalStoresCount,
                total_users: totalUsersCount,
                today_new_stores: todayStoresCount,
                active_stores: activeStoresCount
            },
            user_ranking: userStoreRanking,
            platform_distribution: platformDistribution,
            region_distribution: regionDistribution,
            category_distribution: categoryDistribution,
            time_analysis: {
                three_days: threeDaysStoresCount,
                one_week: weekStoresCount,
                one_month: monthStoresCount,
                three_months: quarterStoresCount
            },
            time_trend_by_platform: timeTrendByPlatform,
            recent_activities: sortedActivities,
            timestamp: now.toISOString()
        };
        
    } catch (error) {
        console.error('获取驾驶舱数据错误:', error);
        // 返回默认数据，避免前端报错
        return {
            summary: {
                total_stores: 0,
                total_users: 0,
                today_new_stores: 0,
                active_stores: 0
            },
            user_ranking: [],
            platform_distribution: [],
            region_distribution: [],
            category_distribution: [],
            time_analysis: {
                three_days: 0,
                one_week: 0,
                one_month: 0,
                three_months: 0
            },
            time_trend_by_platform: {
                threeDays: [],
                oneWeek: [],
                oneMonth: [],
                threeMonths: []
            },
            recent_activities: [],
            timestamp: new Date().toISOString()
        };
    }
}

// 添加辅助函数
function processPlatformData(data) {
    if (!data || !Array.isArray(data)) return [];
    const distribution = {};
    data.forEach(store => {
        distribution[store.platform] = (distribution[store.platform] || 0) + 1;
    });
    return Object.entries(distribution).map(([platform, count]) => ({
        platform,
        count
    }));
}

// 确保函数在全局可用
globalThis.processPlatformData = processPlatformData;



// 添加时间格式化辅助函数

function formatActivityTime(date) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const twoDaysAgoStart = new Date(todayStart);
  twoDaysAgoStart.setDate(twoDaysAgoStart.getDate() - 2);
  
  const inputDate = new Date(date);
  const inputDateStart = new Date(inputDate.getFullYear(), inputDate.getMonth(), inputDate.getDate());
  
  if (inputDate >= todayStart) {
    // 今天
    const diffHours = Math.floor((now - inputDate) / (1000 * 60 * 60));
    if (diffHours < 1) {
      const diffMins = Math.floor((now - inputDate) / (1000 * 60));
      return diffMins <= 0 ? '刚刚' : `${diffMins}分钟前`;
    }
    return `${diffHours}小时前`;
  } else if (inputDate >= yesterdayStart) {
    // 昨天
    return '昨天';
  } else if (inputDate >= twoDaysAgoStart) {
    // 前天
    return '前天';
  } else {
    // 更早的时间
    const diffDays = Math.floor((todayStart - inputDateStart) / (1000 * 60 * 60 * 24));
    return `${diffDays}天前`;
  }
}

// 将formatActivityTime函数绑定到全局，以便在getDashboardData中使用
globalThis.formatActivityTime = formatActivityTime;
// 门店管理
ipcMain.handle('save-store', async (event, store) => {
  if (!currentUser) return createErrorResponse('NOT_LOGGED_IN', '未登录');
  try {
    // ========== 1. 编辑门店时的权限与数据校验（保留原逻辑并补充） ==========
    if (store.id) { // 仅更新现有门店时执行
      // 1.1 检查门店是否存在及所有权
      const { data: existingStore, error: storeError } = await supabaseService
        .from('stores')
        .select('owner_id')
        .eq('id', store.id)
        .single();
      if (storeError || !existingStore) {
        return createErrorResponse('STORE_NOT_FOUND', '门店不存在');
      }
      // 1.2 检查编辑权限（超管/管理员/所有者/有编辑权限的共享者）
      const isOwner = existingStore.owner_id === currentUser.id;
      let hasEditPermission = isOwner;

      if (!isOwner) {
        const { data: shareRecord, error: shareError } = await supabaseService
          .from('store_shares')
          .select('can_edit')
          .eq('store_id', store.id)
          .eq('shared_with', currentUser.id)
          .eq('can_edit', true)
          .maybeSingle();
        hasEditPermission = !shareError && !!shareRecord;
      }
      const isAdmin = currentUser.role === 'super_admin' || currentUser.role === 'admin';
      if (!hasEditPermission && !isAdmin) {
        return createErrorResponse('PERMISSION_DENIED', '没有编辑权限');
      }
      // 1.3 强制校验：编辑时必须传入原 owner_id（避免前端漏传导致丢失）
      if (!store.owner_id || !isValidUUID(store.owner_id)) {
        return createErrorResponse('INVALID_OWNER_ID', '编辑门店需传入原所属者ID');
      }
    }

    // ========== 2. 门店数量限制校验（保留原逻辑） ==========
    const { data: userData, error: userError } = await supabaseService
      .from('users')
      .select('store_limit, admin_id, role')
      .eq('id', currentUser.id)
      .single();
    if (userError) throw userError;

    // 仅新增门店时检查数量限制
    if (!store.id) {
      const { data: userStores, error: userStoresError } = await supabaseService
        .from('stores')
        .select('id')
        .eq('owner_id', currentUser.id);
      if (userStoresError) throw userStoresError;
      const currentUserStoreCount = userStores ? userStores.length : 0;
      const userStoreLimit = userData.store_limit || 10;

      // 员工新增时需额外检查管理员总额度
      if (userData.role === 'employee' && userData.admin_id) {
        const adminTotalStoreCount = await getAdminTotalStoreCount(userData.admin_id);
        const { data: adminData } = await supabaseService
          .from('users')
          .select('store_limit')
          .eq('id', userData.admin_id)
          .single();
        const adminStoreLimit = adminData.store_limit || 30;
        if (adminTotalStoreCount >= adminStoreLimit) {
          return createErrorResponse('STORE_LIMIT_EXCEEDED', `管理员门店总额度已满 (${adminTotalStoreCount}/${adminStoreLimit})`);
        }
      }

      if (currentUserStoreCount >= userStoreLimit) {
        return createErrorResponse('STORE_LIMIT_EXCEEDED', `已达到个人门店数量限制 (${currentUserStoreCount}/${userStoreLimit})`);
      }
    }

    // ========== 3. 构建门店数据（核心修复：区分新增/编辑的 owner_id） ==========
    const storeToSave = {
      name: store.name,
      platform: store.platform,
      contact_person: store.contact_person,
      contact_phone: store.contact_phone,
      // 关键修复：新增用当前用户ID，编辑用原门店的 owner_id（前端传入）
      owner_id: store.id ? store.owner_id : currentUser.id,
      created_by: currentUser.id,
      province: store.province || '', // 补充默认值避免空值
      city: store.city || '',
      category: store.category || ''
    };

    // 4. 数据格式校验（保留原逻辑）
    const validationError = validateStore(storeToSave);
    if (validationError) {
      return createErrorResponse('VALIDATION_ERROR', validationError);
    }

    // 5. 处理登录数据加密（保留原逻辑）
    if (store.login_data) {
      storeToSave.login_data = encryptData(store.login_data);
    }

    // 6. 补充编辑时的更新时间（保留原逻辑）
    if (store.id && isValidUUID(store.id)) {
      storeToSave.id = store.id;
      storeToSave.updated_at = new Date().toISOString();
    } else {
      storeToSave.id = generateUUID();
    }

    // ========== 4. 执行新增/更新操作（保留原逻辑） ==========
    const { data, error } = await supabaseService
      .from('stores')
      .upsert(storeToSave)
      .select();
    if (error) {
      console.error('保存门店错误:', error);
      throw error;
    }

    // 5. 清理相关缓存（保留原逻辑，确保数据实时性）
    clearRelatedCaches('stores', store.id ? store.owner_id : currentUser.id);
    return createSuccessResponse(data[0], store.id ? '门店更新成功' : '门店新增成功');

  } catch (error) {
    console.error('保存门店异常:', error);
    return createErrorResponse('SAVE_STORE_ERROR', '保存门店失败: ' + error.message);
  }
});
ipcMain.handle('load-stores', async (event, filters = {}) => {
  if (!currentUser) return createErrorResponse('NOT_LOGGED_IN', '未登录');

  try {
    const cacheKey = generateCacheKey('stores', currentUser.id, filters);
    
    return await cachedQuery(cacheKey, async () => {
      let query = supabaseService.from('stores').select('*'); // 使用服务端客户端

      // 如果是超级管理员，可以看到所有门店
      if (currentUser.role === 'super_admin') {
        // 不需要额外过滤
      } 
      // 如果是管理员，可以看到自己创建的和员工创建的门店
      else if (currentUser.role === 'admin') {
        const { data: employees, error: empError } = await supabaseService
          .from('users')
          .select('id')
          .eq('admin_id', currentUser.id)
          .eq('is_active', true);

        if (empError) throw empError;

        const employeeIds = employees ? employees.map(e => e.id) : [];
        employeeIds.push(currentUser.id);

        query = query.in('owner_id', employeeIds);
      } 
      // 如果是员工，可以看到自己创建的和共享给自己的门店
      else if (currentUser.role === 'employee') {
        // 获取共享给当前用户的门店ID
        const { data: sharedStores, error: sharedError } = await supabaseService
          .from('store_shares')
          .select('store_id')
          .eq('shared_with', currentUser.id);

        if (sharedError) throw sharedError;

        const sharedStoreIds = sharedStores ? sharedStores.map(share => share.store_id) : [];
        
        // 查询自己创建的和共享的门店
        if (sharedStoreIds.length > 0) {
          query = query.or(`owner_id.eq.${currentUser.id},id.in.(${sharedStoreIds.join(',')})`);
        } else {
          query = query.eq('owner_id', currentUser.id);
        }
      }

      if (filters.platform && filters.platform !== 'all') {
        query = query.eq('platform', filters.platform);
      }
      if (filters.search) {
        query = query.ilike('name', `%${filters.search}%`);
      }
      if (filters.ownerId) {
        query = query.eq('owner_id', filters.ownerId);
      }
 // 添加分类筛选
      if (filters.category) {
        query = query.eq('category', filters.category);
      }
      // 处理超级管理员的角色筛选
      if (filters.role) {
        if (filters.role === 'admin') {
          const { data: adminUsers, error: adminError } = await supabaseService
            .from('users')
            .select('id')
            .eq('role', 'admin')
            .eq('is_active', true);

          if (adminError) throw adminError;

          const adminIds = adminUsers ? adminUsers.map(user => user.id) : [];
          if (adminIds.length > 0) {
            query = query.in('owner_id', adminIds);
          }
        } else if (filters.role === 'employee') {
          const { data: employeeUsers, error: empError } = await supabaseService
            .from('users')
            .select('id')
            .eq('role', 'employee')
            .eq('is_active', true);

          if (empError) throw empError;

          const employeeIds = employeeUsers ? employeeUsers.map(user => user.id) : [];
          if (employeeIds.length > 0) {
            query = query.in('owner_id', employeeIds);
          }
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      const decryptedStores = data ? data.map(store => {
        if (store.login_data) {
          store.login_data = decryptData(store.login_data);
        }
        return store;
      }) : [];

      return createSuccessResponse(decryptedStores, '门店列表获取成功');
    });
  } catch (error) {
    console.error('加载门店错误:', error);
    return createErrorResponse('LOAD_STORES_ERROR', '加载门店失败');
  }
});

ipcMain.handle('delete-store', async (event, id) => {
  if (!currentUser) return createErrorResponse('NOT_LOGGED_IN', '未登录');

  try {
    const { data: store, error: storeError } = await supabaseService // 使用服务端客户端
      .from('stores')
      .select('owner_id')
      .eq('id', id)
      .single();

    if (storeError) throw storeError;

    if (!store) {
      return createErrorResponse('STORE_NOT_FOUND', '门店不存在');
    }

    let hasPermission = store.owner_id === currentUser.id || 
                       currentUser.role === 'super_admin';
    
    if (currentUser.role === 'admin' && !hasPermission) {
      const { data: employee, error: empError } = await supabaseService // 使用服务端客户端
        .from('users')
        .select('id, admin_id')
        .eq('id', store.owner_id)
        .single();
        
      if (!empError && employee && employee.admin_id === currentUser.id) {
        hasPermission = true;
      }
    }

    if (!hasPermission) {
      return createErrorResponse('PERMISSION_DENIED', '权限不足');
    }

    const { error } = await supabaseService // 使用服务端客户端
      .from('stores')
      .delete()
      .eq('id', id);

    if (error) throw error;

    clearStoresCache();

    if (storeWindows.has(id)) {
      const window = storeWindows.get(id);
      if (!window.isDestroyed()) {
        window.close();
      }
      storeWindows.delete(id);
    }

    return createSuccessResponse(null, '门店删除成功');
  } catch (error) {
    console.error('删除门店错误:', error);
    return createErrorResponse('DELETE_STORE_ERROR', '删除门店失败');
  }
});

ipcMain.handle('batch-delete-stores', async (event, ids) => {
  if (!currentUser) return createErrorResponse('NOT_LOGGED_IN', '未登录');

  try {
    const { data: stores, error: storeError } = await supabaseService // 使用服务端客户端
      .from('stores')
      .select('id, owner_id')
      .in('id', ids);

    if (storeError) throw storeError;

    if (!stores || stores.length === 0) {
      return createErrorResponse('STORE_NOT_FOUND', '门店不存在');
    }

    const hasPermission = stores.every(store => {
      if (currentUser.role === 'super_admin') return true;
      if (store.owner_id === currentUser.id) return true;
      if (currentUser.role === 'admin') return true;
      return false;
    });

    if (!hasPermission) {
      return createErrorResponse('PERMISSION_DENIED', '权限不足');
    }

    const { error } = await supabaseService // 使用服务端客户端
      .from('stores')
      .delete()
      .in('id', ids);

    if (error) throw error;

    clearStoresCache();

    ids.forEach(id => {
      if (storeWindows.has(id)) {
        const window = storeWindows.get(id);
        if (!window.isDestroyed()) {
          window.close();
        }
        storeWindows.delete(id);
      }
    });

    return createSuccessResponse(null, '批量删除成功');
  } catch (error) {
    console.error('批量删除门店错误:', error);
    return createErrorResponse('BATCH_DELETE_STORES_ERROR', '批量删除门店失败');
  }
});

ipcMain.handle('transfer-store', async (event, { storeId, newOwnerId }) => {
  if (!currentUser) return createErrorResponse('NOT_LOGGED_IN', '未登录');

  // 添加参数验证
  if (!storeId || !isValidUUID(storeId)) {
    return createErrorResponse('INVALID_STORE_ID', '无效的门店ID');
  }
  
  if (!newOwnerId || !isValidUUID(newOwnerId)) {
    return createErrorResponse('INVALID_OWNER_ID', '无效的用户ID');
  }

  try {
    // 验证门店是否存在
    const { data: store, error: storeError } = await supabaseService
      .from('stores')
      .select('owner_id')
      .eq('id', storeId)
      .single();

    if (storeError || !store) {
      return createErrorResponse('STORE_NOT_FOUND', '门店不存在');
    }

    // 检查权限：用户必须是门店所有者或者是超级管理员/管理员
    let hasPermission = store.owner_id === currentUser.id;
    
    if (!hasPermission && (currentUser.role === 'super_admin' || currentUser.role === 'admin')) {
      // 管理员可以管理所有门店
      hasPermission = true;
    }
    
    if (!hasPermission) {
      return createErrorResponse('PERMISSION_DENIED', '权限不足');
    }

    // 验证目标用户是否存在
    const { data: user, error: userError } = await supabaseService
      .from('users')
      .select('id, role, admin_id')
      .eq('id', newOwnerId)
      .single();

    if (userError || !user) {
      return createErrorResponse('USER_NOT_FOUND', '目标用户不存在');
    }

    // 权限检查：员工只能转移给所属管理员及管理员名下的其他员工
    if (currentUser.role === 'employee') {
      const adminId = currentUser.admin_id;
      
      // 检查目标用户是否是当前员工的所属管理员或同属一个管理员的其他员工
      const isValidTarget = user.id === adminId || 
                          (user.role === 'employee' && user.admin_id === adminId);
      
      if (!isValidTarget) {
        return createErrorResponse('PERMISSION_DENIED', '员工只能转移给所属管理员及同管理员下的其他员工');
      }
    }

    const { error } = await supabaseService
      .from('stores')
      .update({ 
        owner_id: newOwnerId,
        updated_at: new Date().toISOString()
      })
      .eq('id', storeId);

    if (error) throw error;

    clearStoresCache();
    clearUserStoresCache(newOwnerId); // 新增：清除新所有者的门店缓存

    return createSuccessResponse(null, '门店转移成功');
  } catch (error) {
    console.error('转移门店错误:', error);
    return createErrorResponse('TRANSFER_STORE_ERROR', '转移门店失败: ' + error.message);
  }
});

// 门店共享相关 IPC 处理器
ipcMain.handle('share-store', async (event, { storeId, targetUserId, canEdit }) => {
  if (!currentUser) return createErrorResponse('NOT_LOGGED_IN', '未登录');

  try {
    // 检查门店是否存在及当前用户是否有权限
    const { data: store, error: storeError } = await supabaseService
      .from('stores')
      .select('owner_id')
      .eq('id', storeId)
      .single();

    if (storeError || !store) {
      return createErrorResponse('STORE_NOT_FOUND', '门店不存在');
    }

    // 检查权限：用户必须是门店所有者或者是超级管理员/管理员
    let hasPermission = store.owner_id === currentUser.id;
    
    if (!hasPermission && (currentUser.role === 'super_admin' || currentUser.role === 'admin')) {
      // 管理员可以管理所有门店
      hasPermission = true;
    }
    
    if (!hasPermission) {
      return createErrorResponse('PERMISSION_DENIED', '权限不足');
    }

    // 检查目标用户是否存在
    const { data: targetUser, error: userError } = await supabaseService
      .from('users')
      .select('id, role, admin_id')
      .eq('id', targetUserId)
      .single();

    if (userError || !targetUser) {
      return createErrorResponse('USER_NOT_FOUND', '目标用户不存在');
    }

    // 权限检查：员工只能共享给所属管理员及管理员名下的其他员工
    if (currentUser.role === 'employee') {
      const adminId = currentUser.admin_id;
      
      // 检查目标用户是否是当前员工的所属管理员或同属一个管理员的其他员工
      const isValidTarget = targetUser.id === adminId || 
                          (targetUser.role === 'employee' && targetUser.admin_id === adminId);
      
      if (!isValidTarget) {
        return createErrorResponse('PERMISSION_DENIED', '员工只能共享给所属管理员及同管理员下的其他员工');
      }
    }

    // 检查门店是否已共享给该用户
    const { data: existingShare, error: shareError } = await supabaseService
      .from('store_shares')
      .select('id')
      .eq('store_id', storeId)
      .eq('shared_with', targetUserId)
      .maybeSingle();

    if (shareError) throw shareError;

    if (existingShare) {
      return createErrorResponse('ALREADY_SHARED', '此门店已共享给该用户');
    }

    // ========== 关键修改：取消目标用户的编辑权限 ==========
    // 目标用户只能查看，不能编辑
    const finalCanEdit = false;

    // 创建共享记录
    const { data, error } = await supabaseService
      .from('store_shares')
      .insert([{
        store_id: storeId,
        shared_with: targetUserId,
        can_edit: finalCanEdit, // 强制设置为false
        shared_by: currentUser.id,
        created_at: new Date().toISOString()
      }])
      .select();

    if (error) throw error;
    clearRelatedCaches('stores', storeId);
    clearUserStoresCache(targetUserId);
    return createSuccessResponse(data[0], '门店共享成功（目标用户仅可查看）');
  } catch (error) {
    console.error('共享门店错误:', error);
    return createErrorResponse('SHARE_STORE_ERROR', '共享门店失败');
  }
});

// 批量共享门店 IPC 处理器
ipcMain.handle('batch-share-stores', async (event, { storeIds, targetUserId, canEdit }) => {
  if (!currentUser) return createErrorResponse('NOT_LOGGED_IN', '未登录');

  try {
    // 检查目标用户是否存在
    const { data: targetUser, error: userError } = await supabaseService
      .from('users')
      .select('id, role, admin_id')
      .eq('id', targetUserId)
      .single();

    if (userError || !targetUser) {
      return createErrorResponse('USER_NOT_FOUND', '目标用户不存在');
    }

    // 权限检查：员工只能批量共享给所属管理员及管理员名下的其他员工
    if (currentUser.role === 'employee') {
      const adminId = currentUser.admin_id;
      
      // 检查目标用户是否是当前员工的所属管理员或同属一个管理员的其他员工
      const isValidTarget = targetUser.id === adminId || 
                          (targetUser.role === 'employee' && targetUser.admin_id === adminId);
      
      if (!isValidTarget) {
        return createErrorResponse('PERMISSION_DENIED', '员工只能共享给所属管理员及同管理员下的其他员工');
      }
    }

    // 检查所有门店是否存在及当前用户是否有权限
    const { data: stores, error: storesError } = await supabaseService
      .from('stores')
      .select('id, owner_id')
      .in('id', storeIds);

    if (storesError) throw storesError;

    if (!stores || stores.length === 0) {
      return createErrorResponse('STORE_NOT_FOUND', '门店不存在');
    }

    // 检查权限：用户必须是所有门店的所有者或者是超级管理员/管理员
    const hasPermission = stores.every(store => {
      if (store.owner_id === currentUser.id) return true;
      if (currentUser.role === 'super_admin' || currentUser.role === 'admin') return true;
      return false;
    });

    if (!hasPermission) {
      return createErrorResponse('PERMISSION_DENIED', '权限不足');
    }

    // 检查哪些门店已共享给该用户
    const { data: existingShares, error: sharesError } = await supabaseService
      .from('store_shares')
      .select('store_id')
      .eq('shared_with', targetUserId)
      .in('store_id', storeIds);

    if (sharesError) throw sharesError;

    const alreadySharedStoreIds = existingShares ? existingShares.map(share => share.store_id) : [];
    const storesToShare = storeIds.filter(id => !alreadySharedStoreIds.includes(id));

    if (storesToShare.length === 0) {
      return createErrorResponse('ALL_ALREADY_SHARED', '所有选中的门店都已共享给该用户');
    }

    // 创建批量共享记录
    const sharesToInsert = storesToShare.map(storeId => ({
      store_id: storeId,
      shared_with: targetUserId,
      can_edit: false,
      shared_by: currentUser.id,
      created_at: new Date().toISOString()
    }));

    const { data, error } = await supabaseService
      .from('store_shares')
      .insert(sharesToInsert)
      .select();

    if (error) throw error;
    storeIds.forEach(storeId => clearRelatedCaches('stores', storeId));
    clearUserStoresCache(targetUserId); // 新增：清除目标用户的门店缓存
    return createSuccessResponse(data, `成功共享 ${data.length} 个门店`);
  } catch (error) {
    console.error('批量共享门店错误:', error);
    return createErrorResponse('BATCH_SHARE_STORES_ERROR', '批量共享门店失败');
  }
});

// 批量转移门店 IPC 处理器
ipcMain.handle('batch-transfer-stores', async (event, { storeIds, targetUserId }) => {
  if (!currentUser) return createErrorResponse('NOT_LOGGED_IN', '未登录');

  try {
    // 检查目标用户是否存在
    const { data: targetUser, error: userError } = await supabaseService
      .from('users')
      .select('id, role, admin_id')
      .eq('id', targetUserId)
      .single();

    if (userError || !targetUser) {
      return createErrorResponse('USER_NOT_FOUND', '目标用户不存在');
    }

    // 权限检查：员工只能批量转移给所属管理员及管理员名下的其他员工
    if (currentUser.role === 'employee') {
      const adminId = currentUser.admin_id;
      
      // 检查目标用户是否是当前员工的所属管理员或同属一个管理员的其他员工
      const isValidTarget = targetUser.id === adminId || 
                          (targetUser.role === 'employee' && targetUser.admin_id === adminId);
      
      if (!isValidTarget) {
        return createErrorResponse('PERMISSION_DENIED', '员工只能转移给所属管理员及同管理员下的其他员工');
      }
    }

    // 检查所有门店是否存在
    const { data: stores, error: storesError } = await supabaseService
      .from('stores')
      .select('id, owner_id')
      .in('id', storeIds);

    if (storesError) throw storesError;

    if (!stores || stores.length === 0) {
      return createErrorResponse('STORE_NOT_FOUND', '门店不存在');
    }

    // 检查权限：用户必须是所有门店的所有者或者是超级管理员/管理员
    const hasPermission = stores.every(store => {
      if (store.owner_id === currentUser.id) return true;
      if (currentUser.role === 'super_admin' || currentUser.role === 'admin') return true;
      return false;
    });

    if (!hasPermission) {
      return createErrorResponse('PERMISSION_DENIED', '权限不足');
    }

    // 检查目标用户是否已有这些门店
    const { data: ownedStores, error: ownershipError } = await supabaseService
      .from('stores')
      .select('id')
      .eq('owner_id', targetUserId)
      .in('id', storeIds);

    if (ownershipError) throw ownershipError;

    const alreadyOwnedStoreIds = ownedStores ? ownedStores.map(store => store.id) : [];
    const storesToTransfer = storeIds.filter(id => !alreadyOwnedStoreIds.includes(id));

    if (storesToTransfer.length === 0) {
      return createErrorResponse('ALL_ALREADY_OWNED', '目标用户已拥有所有选中的门店');
    }

    // 批量转移门店
    const { error } = await supabaseService
      .from('stores')
      .update({ 
        owner_id: targetUserId,
        updated_at: new Date().toISOString()
      })
      .in('id', storesToTransfer);

    if (error) throw error;

    clearStoresCache();
    clearUserStoresCache(targetUserId); // 新增：清除目标用户的门店缓存

    return createSuccessResponse(null, `成功转移 ${storesToTransfer.length} 个门店`);
  } catch (error) {
    console.error('批量转移门店错误:', error);
    return createErrorResponse('BATCH_TRANSFER_STORES_ERROR', '批量转移门店失败');
  }
});
// 新增：清除特定用户的门店缓存函数
function clearUserStoresCache(userId) {
  const keys = cache.keys();
  keys.forEach(key => {
    // 匹配格式："v1:stores:用户ID:xxx"
    if (key.startsWith(`${CACHE_VERSION}:stores:${userId}`)) {
      cache.del(key);
      console.log(`已清除用户 ${userId} 的门店缓存: ${key}`);
    }
  });
}

ipcMain.handle('check-store-shared', async (event, { storeId, targetUserId }) => {
  try {
    const { data, error } = await supabaseService
      .from('store_shares')
      .select('id')
      .eq('store_id', storeId)
      .eq('shared_with', targetUserId)
      .maybeSingle();

    if (error) throw error;

    return createSuccessResponse({
      isShared: !!data,
      count: data ? 1 : 0
    }, '检查共享状态成功');
  } catch (error) {
    console.error('检查共享状态错误:', error);
    return createErrorResponse('CHECK_SHARE_ERROR', '检查共享状态失败');
  }
});

ipcMain.handle('check-stores-shared', async (event, { storeIds, targetUserId }) => {
  try {
    const { data, error } = await supabaseService
      .from('store_shares')
      .select('store_id')
      .eq('shared_with', targetUserId)
      .in('store_id', storeIds);

    if (error) throw error;

    const sharedStoreIds = data ? data.map(share => share.store_id) : [];
    
    return createSuccessResponse({
      isShared: sharedStoreIds.length > 0,
      count: sharedStoreIds.length,
      sharedStoreIds: sharedStoreIds
    }, '检查批量共享状态成功');
  } catch (error) {
    console.error('检查批量共享状态错误:', error);
    return createErrorResponse('CHECK_SHARES_ERROR', '检查批量共享状态失败');
  }
});

ipcMain.handle('check-store-ownership', async (event, { storeId, targetUserId }) => {
  try {
    const { data, error } = await supabaseService
      .from('stores')
      .select('id')
      .eq('id', storeId)
      .eq('owner_id', targetUserId)
      .maybeSingle();

    if (error) throw error;

    return createSuccessResponse({
      hasOwnership: !!data,
      count: data ? 1 : 0
    }, '检查所有权成功');
  } catch (error) {
    console.error('检查所有权错误:', error);
    return createErrorResponse('CHECK_OWNERSHIP_ERROR', '检查所有权失败');
  }
});

ipcMain.handle('check-stores-ownership', async (event, { storeIds, targetUserId }) => {
  try {
    const { data, error } = await supabaseService
      .from('stores')
      .select('id')
      .eq('owner_id', targetUserId)
      .in('id', storeIds);

    if (error) throw error;

    const ownedStoreIds = data ? data.map(store => store.id) : [];
    
    return createSuccessResponse({
      hasOwnership: ownedStoreIds.length > 0,
      count: ownedStoreIds.length,
      ownedStoreIds: ownedStoreIds
    }, '检查批量所有权成功');
  } catch (error) {
    console.error('检查批量所有权错误:', error);
    return createErrorResponse('CHECK_OWNERSHIPS_ERROR', '检查批量所有权失败');
  }
});

// 窗口管理
ipcMain.handle('open-store', async (event, store) => {
  if (!currentUser) return createErrorResponse('NOT_LOGGED_IN', '未登录');
const isSharedWithUser = await supabaseService
  .from('store_shares')
  .select('id')
  .eq('store_id', store.id)
  .eq('shared_with', currentUser.id)
  .maybeSingle();
  if (
  store.owner_id !== currentUser.id && 
  !isSharedWithUser.data && // 新增共享判断
  currentUser.role !== 'super_admin' && 
  currentUser.role !== 'admin'
) {
  return createErrorResponse('PERMISSION_DENIED', '权限不足');
}

  const requestKey = `open-store:${store.id}`;
  if (pendingRequests.has(requestKey)) {
    return createSuccessResponse({ action: 'pending' }, '正在打开门店，请稍候');
  }

  const requestPromise = (async () => {
    if (storeWindows.has(store.id)) {
      const existingWindow = storeWindows.get(store.id);
      if (!existingWindow.isDestroyed()) {
        if (existingWindow.isMinimized()) {
          existingWindow.restore();
        }
        existingWindow.focus();
        existingWindow.moveTop();
        return createSuccessResponse({ action: 'focused' }, '窗口已聚焦');
      } else {
        storeWindows.delete(store.id);
      }
    }

    try {
      console.log(`正在创建门店窗口: ${store.name}`);
      const newWindow = await createStoreWindow(store, currentUser);
      
      if (!newWindow.isDestroyed()) {
        newWindow.show();
        newWindow.focus();
        newWindow.moveTop();
      }
      
      return createSuccessResponse({ action: 'opened' }, '窗口已打开');
    } catch (error) {
      console.error('创建窗口失败:', error);
      return createErrorResponse('CREATE_WINDOW_ERROR', '创建窗口失败: ' + error.message);
    }
  })();

  pendingRequests.set(requestKey, requestPromise);
  
  try {
    const result = await requestPromise;
    return result;
  } finally {
    pendingRequests.delete(requestKey);
  }
});

ipcMain.handle('get-store-window', async (event, id) => {
  try {
    if (storeWindows.has(id)) {
      const window = storeWindows.get(id);
      if (window && !window.isDestroyed()) {
        return createSuccessResponse({ id: id, isDestroyed: false }, '窗口信息获取成功');
      } else {
        storeWindows.delete(id);
      }
    }
    return createSuccessResponse(null, '窗口未找到');
  } catch (error) {
    console.error('获取窗口信息错误:', error);
    return createErrorResponse('GET_STORE_WINDOW_ERROR', '获取窗口信息失败');
  }
});

ipcMain.handle('get-open-windows', async () => {
  try {
    const openWindows = [];
    for (const [id, window] of storeWindows) {
      if (!window.isDestroyed()) {
        openWindows.push(id);
      }
    }
    return createSuccessResponse(openWindows, '已打开窗口列表获取成功');
  } catch (error) {
    console.error('获取打开窗口错误:', error);
    return createErrorResponse('GET_OPEN_WINDOWS_ERROR', '获取打开窗口失败');
  }
});

ipcMain.handle('close-store-window', async (event, id) => {
  if (storeWindows.has(id)) {
    const window = storeWindows.get(id);
    if (!window.isDestroyed()) {
      const session = window.webContents.session;
      session.flushStorageData();
      window.close();
    }
    storeWindows.delete(id);
  }
  return createSuccessResponse(null, '窗口关闭成功');
});

// 数据导入导出
ipcMain.handle('export-data', async () => {
  if (!currentUser) return createErrorResponse('NOT_LOGGED_IN', '未登录');

  try {
    const { data: stores, error } = await supabaseService // 使用服务端客户端
      .from('stores')
      .select('*')
      .eq('owner_id', currentUser.id);

    if (error) throw error;
    return createSuccessResponse(JSON.stringify(stores || [], null, 2), '数据导出成功');
  } catch (error) {
    console.error('导出数据错误:', error);
    return createErrorResponse('EXPORT_DATA_ERROR', '导出数据失败');
  }
});

ipcMain.handle('import-data', async (event, importData) => {
  if (!currentUser) return createErrorResponse('NOT_LOGGED_IN', '未登录');

  try {
    const parsedData = JSON.parse(importData);
    if (!Array.isArray(parsedData)) {
      return createErrorResponse('INVALID_DATA_FORMAT', '无效的数据格式');
    }

    const limitCheck = await window.electronAPI.checkStoreLimit(currentUser.id);
    if (limitCheck.current + parsedData.length > limitCheck.limit) {
      return createErrorResponse('STORE_LIMIT_EXCEEDED', `导入后将超出门店数量限制 (${limitCheck.current + parsedData.length}/${limitCheck.limit})`);
    }

    const storesToImport = parsedData.map(store => ({
      ...store,
      owner_id: currentUser.id,
      created_by: currentUser.id,
      id: undefined
    }));

    const { error } = await supabaseService // 使用服务端客户端
      .from('stores')
      .insert(storesToImport);

    if (error) throw error;

    clearStoresCache();

    return createSuccessResponse(null, '数据导入成功');
  } catch (error) {
    console.error('导入数据错误:', error);
    return createErrorResponse('IMPORT_DATA_ERROR', '导入数据失败');
  }
});

// 会话管理 IPC 处理器
ipcMain.handle('save-session-data', async (event, { storeId, sessionData }) => {
  try {
    const encryptedData = encryptData(sessionData);
    const { error } = await supabaseService // 使用服务端客户端
      .from('sessions')
      .upsert({
        store_id: storeId,
        session_data: encryptedData,
        updated_at: new Date().toISOString(),
        is_shared: true
      }, {
        onConflict: 'store_id'
      });

    if (error) throw error;
    return createSuccessResponse(null, '会话数据保存成功');
  } catch (error) {
    console.error('保存会话数据失败:', error);
    return createErrorResponse('SAVE_SESSION_ERROR', '保存会话数据失败');
  }
});

ipcMain.handle('load-session-data', async (event, storeId) => {
  try {
    const { data, error } = await supabaseService // 使用服务端客户端
      .from('sessions')
      .select('session_data')
      .eq('store_id', storeId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return createSuccessResponse(null, '无会话数据');

    const decryptedData = decryptData(data.session_data);
    return createSuccessResponse(decryptedData, '会话数据加载成功');
  } catch (error) {
    console.error('加载会话数据失败:', error);
    return createErrorResponse('LOAD_SESSION_ERROR', '加载会话数据失败');
  }
});

ipcMain.handle('get-cookies', async (event, partition) => {
  try {
    const session = partition ? session.fromPartition(partition) : event.sender.session;
    const cookies = await session.cookies.get({});
    return createSuccessResponse(cookies, 'Cookies获取成功');
  } catch (error) {
    console.error('获取cookies失败:', error);
    return createErrorResponse('GET_COOKIES_ERROR', '获取cookies失败');
  }
});

ipcMain.handle('set-cookies', async (event, partition, cookies) => {
  try {
    const session = partition ? session.fromPartition(partition) : event.sender.session;
    for (const cookie of cookies) {
      await session.cookies.set(cookie);
    }
    return createSuccessResponse(null, 'Cookies设置成功');
  } catch (error) {
    console.error('设置cookies失败:', error);
    return createErrorResponse('SET_COOKIES_ERROR', '设置cookies失败');
  }
});
// 复制门店窗口
ipcMain.handle('duplicate-store-window', async (event, storeData) => {
  try {
    console.log('收到复制窗口请求，门店数据:', storeData);
    
    if (!currentUser) {
      return createErrorResponse('NOT_LOGGED_IN', '用户未登录');
    }

    // 验证门店数据
    if (!storeData || !storeData.id || !storeData.name) {
      console.error('无效的门店数据:', storeData);
      return createErrorResponse('INVALID_STORE_DATA', '门店数据不完整');
    }

    console.log(`正在复制门店窗口: ${storeData.name} (ID: ${storeData.id})`);
    
    // 创建新的门店窗口，标记为复制窗口
    const newWindow = await createStoreWindow(storeData, currentUser, true);
    
    return createSuccessResponse({ 
      success: true,
      message: '窗口复制成功'
    });

  } catch (error) {
    console.error('复制窗口错误:', error);
    return createErrorResponse('DUPLICATE_WINDOW_ERROR', '复制窗口失败: ' + error.message);
  }
});
// ==================== 修改后的导航按钮函数 ====================

// 添加导航按钮
async function addNavigationButtons(window, store, user) {
  // 注入导航按钮的HTML和CSS
  const navigationHTML = `
    <div id="electron-nav-buttons" style="
      position: fixed;
      top: 0;
      left: 0;
      width: 30%; /* 上边长度为页面宽度的五分之二 */
      height: 32px;
      background: linear-gradient(135deg, #0e59e6ff 0%, #0b6bf2a6 100%);
      border-bottom: 1px solid #1890ff;
      display: flex;
      align-items: center;
      padding: 0 0 0 12px;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      gap: 8px;
      box-shadow: 0 1px 6px rgba(0,0,0,0.1);
      clip-path: polygon(0 0, 100% 0, calc(100% - 20px) 100%, 0 100%); /* 倒直角梯形：左侧直角，右侧斜角45度 */
      border-top-right-radius: 0;
      border-bottom-right-radius: 0;
    ">
      <button id="nav-back" style="
        padding: 4px 10px;
        background: rgba(255,255,255,0.95);
        border: none;
        border-radius: 4px;
        cursor: pointer;
        color: #1890ff;
        font-size: 11px;
        font-weight: 500;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        gap: 3px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        height: 20px;
      ">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        返回
      </button>
      
      <button id="nav-forward" style="
        padding: 4px 10px;
        background: rgba(255,255,255,0.95);
        border: none;
        border-radius: 4px;
        cursor: pointer;
        color: #1890ff;
        font-size: 11px;
        font-weight: 500;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        gap: 3px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        height: 20px;
      ">
        前进
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </button>
      
      <button id="nav-refresh" style="
        padding: 4px 12px;
        background: rgba(255,255,255,0.95);
        border: none;
        border-radius: 4px;
        cursor: pointer;
        color: #52c41a;
        font-size: 11px;
        font-weight: 500;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        gap: 4px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        height: 20px;
      ">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6M1 20v-6h6"/>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
        刷新
      </button>
      
      <button id="nav-duplicate" style="
        padding: 4px 12px;
        background: rgba(255,255,255,0.95);
        border: none;
        border-radius: 4px;
        cursor: pointer;
        color: #722ed1;
        font-size: 11px;
        font-weight: 500;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        gap: 4px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        height: 20px;
      ">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        复制窗口
      </button>
    </div>
    
    <style>
      body {
        margin-top: 0 !important; /* 梯形导航栏不需要body margin */
      }
      #electron-nav-buttons button:hover {
        transform: translateY(-1px);
        box-shadow: 0 2px 4px rgba(0,0,0,0.15);
      }
      #nav-back:hover {
        background: white !important;
        color: #096dd9 !important;
      }
      #nav-forward:hover {
        background: white !important;
        color: #096dd9 !important;
      }
      #nav-refresh:hover {
        background: white !important;
        color: #389e0d !important;
      }
      #nav-duplicate:hover {
        background: white !important;
        color: #531dab !important;
      }
      #electron-nav-buttons button:active {
        transform: translateY(0) !important;
      }
    </style>
  `;

  // 在页面加载时注入导航栏
  const injectNavigation = () => {
    window.webContents.executeJavaScript(`
      if (!document.getElementById('electron-nav-buttons')) {
        document.body.insertAdjacentHTML('afterbegin', \`${navigationHTML}\`);
        
        // 添加事件监听
        document.getElementById('nav-back').addEventListener('click', () => {
          if (window.history.length > 1) {
            window.history.back();
          }
        });
        
        document.getElementById('nav-forward').addEventListener('click', () => {
          window.history.forward();
        });
        
        document.getElementById('nav-refresh').addEventListener('click', () => {
          window.location.reload();
        });
        
        // 复制窗口按钮
        document.getElementById('nav-duplicate').addEventListener('click', async () => {
          const button = document.getElementById('nav-duplicate');
          const originalText = button.innerHTML;
          
          // 显示加载状态
          button.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> 复制中...';
          button.disabled = true;
          
          try {
            // 准备门店数据
            const storeData = {
              id: '${store.id}',
              name: '${store.name.replace(/'/g, "\\'")}',
              platform: '${store.platform}',
              username: '${(store.username || '').replace(/'/g, "\\'")}',
              password: '${(store.password || '').replace(/'/g, "\\'")}',
              contact_person: '${(store.contact_person || '').replace(/'/g, "\\'")}',
              contact_phone: '${(store.contact_phone || '').replace(/'/g, "\\'")}',
              province: '${(store.province || '').replace(/'/g, "\\'")}',
              city: '${(store.city || '').replace(/'/g, "\\'")}',
              category: '${(store.category || '').replace(/'/g, "\\'")}',
              owner_id: '${store.owner_id}',
              created_by: '${store.created_by}',
              login_status: '${store.login_status || 'pending'}'
            };
            
            console.log('发送门店数据:', storeData);
            
            // 通过electronAPI复制窗口
            if (window.electronAPI && window.electronAPI.duplicateStoreWindow) {
              const result = await window.electronAPI.duplicateStoreWindow(storeData);
              
              if (result && result.success) {
                console.log('窗口复制成功');
              } else {
                console.error('复制窗口失败:', result?.message);
              }
            } else {
              console.error('electronAPI未就绪');
            }
          } catch (error) {
            console.error('复制窗口出错:', error);
          } finally {
            // 恢复按钮状态
            button.innerHTML = originalText;
            button.disabled = false;
          }
        });
      }
    `).catch(err => console.log('注入导航按钮脚本失败:', err));
  };

  // 页面加载完成时注入
  window.webContents.on('did-finish-load', injectNavigation);
  
  // 页面开始加载时也注入，确保刷新后立即显示
  window.webContents.on('did-start-loading', injectNavigation);
}
// ==================== 应用生命周期 ====================
// 处理多实例启动
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  console.log('应用启动，用户数据路径:', userDataPath);
  
  // 初始化Supabase
  await initializeSupabase();
  
  Menu.setApplicationMenu(null);
  loginWindow = createLoginWindow();

  ipcMain.on('login-success', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = createMainWindow();
    } else {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    
    if (loginWindow && !loginWindow.isDestroyed()) {
      loginWindow.close();
      loginWindow = null;
    }
    
    mainWindow.on('closed', () => {
      mainWindow = null;
      
    });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      loginWindow = createLoginWindow();
    }
  });
});

// 修改 before-quit 事件
app.on('before-quit', (e) => {
  if (!isQuitting) {
    e.preventDefault(); // 只有第一次触发时阻止默认行为
    isQuitting = true;
    console.log('开始退出应用...');
    
    // 立即关闭所有窗口
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => {
      if (!win.isDestroyed()) {
        win.destroy();
      }
    });
    
    // 强制退出进程
    setTimeout(() => {
      app.exit(0);
    }, 100);
  }
});

app.on('will-quit', () => {
  console.log('应用即将退出');
});

app.on('window-all-closed', () => {
  if (isQuitting) {
    return; // 如果正在退出，不执行任何操作
  }
  
  if (process.platform !== 'darwin') {
    isQuitting = true;
    setTimeout(() => {
      app.exit(0);
    }, 100);
  }
});

// 错误处理
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  dialog.showErrorBox('错误', `应用程序遇到错误: ${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
});