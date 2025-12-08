// 确保 utils 可用
const utils = window.utils || {};

document.addEventListener('DOMContentLoaded', () => {
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const rememberMeCheckbox = document.getElementById('rememberMe');
    const loginBtn = document.getElementById('loginBtn');
    const loadingOverlay = document.getElementById('loadingOverlay');

    // 加载保存的登录信息
    async function loadSavedLoginInfo() {
        try {
            const result = await window.electronAPI.loadLoginInfo();
            if (result.success && result.data) {
                emailInput.value = result.data.email || '';
                if (result.data.remember && result.data.password) {
                    passwordInput.value = result.data.password;
                    rememberMeCheckbox.checked = true;
                }
            }
        } catch (error) {
            console.error('加载登录信息失败:', error);
            utils.showGlobalNotification('加载登录信息失败', 'error');
        }
    }

    // 登录处理
    async function handleLogin() {
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        const remember = rememberMeCheckbox.checked;

        // 清除之前的错误提示
        utils.clearFieldError('emailError');
        utils.clearFieldError('passwordError');

        let hasError = false;

        if (!email) {
            utils.showFieldError('emailError', '请输入邮箱');
            hasError = true;
        } else if (!utils.validateEmail(email)) {
            utils.showFieldError('emailError', '请输入有效的邮箱地址');
            hasError = true;
        }

        if (!password) {
            utils.showFieldError('passwordError', '请输入密码');
            hasError = true;
        } else if (password.length < 6) {
            utils.showFieldError('passwordError', '密码长度至少6位');
            hasError = true;
        }

        if (hasError) return;

        // 显示加载状态
        loadingOverlay.classList.add('active');
        utils.setButtonLoading(loginBtn, true);

        try {
            const result = await window.electronAPI.login({ email, password });
            
            if (result.success) {
                // 保存登录信息
                await window.electronAPI.saveLoginInfo({ email, password, remember });
                
                // 通知主进程登录成功
                window.electronAPI.loginSuccess();
            } else {
                // 显示服务器返回的错误
                if (result.message.includes('用户不存在')) {
                    utils.showFieldError('emailError', '用户不存在或已被禁用');
                } else if (result.message.includes('密码错误')) {
                    utils.showFieldError('passwordError', '密码错误');
                } else {
                    utils.showFieldError('passwordError', '登录失败: ' + result.message);
                }
            }
        } catch (error) {
            console.error('登录错误:', error);
            utils.showGlobalNotification('登录过程中发生错误，请重试', 'error');
        } finally {
            utils.setButtonLoading(loginBtn, false);
            loadingOverlay.classList.remove('active');
        }
         // 哈希密码
    const hashedPassword = await utils.hashPassword(password);
    
    try {
        const result = await window.electronAPI.login({ email, password: hashedPassword });
        // ... 处理结果
    } catch (error) {
        // ... 错误处理
    }
    }

    // 事件监听
    loginBtn.addEventListener('click', handleLogin);

    passwordInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            handleLogin();
        }
    });

    emailInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            passwordInput.focus();
        }
    });

    // 添加输入事件监听以清除错误
    emailInput.addEventListener('input', () => {
        utils.clearFieldError('emailError');
    });

    passwordInput.addEventListener('input', () => {
        utils.clearFieldError('passwordError');
    });

    // 初始化
    loadSavedLoginInfo();
});