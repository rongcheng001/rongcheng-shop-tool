// 在 utils.js 中添加哈希函数
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}// 设置按钮加载状态
function setButtonLoading(button, isLoading) {
    if (isLoading) {
        button.disabled = true;
        const originalText = button.innerHTML;
        button.setAttribute('data-original-text', originalText);
        button.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" class="spinner">
                <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
            </svg>
            <span>处理中...</span>
        `;
    } else {
        button.disabled = false;
        const originalText = button.getAttribute('data-original-text');
        if (originalText) {
            button.innerHTML = originalText;
        }
    }
}

// 获取角色名称
function getRoleName(role) {
    const roles = {
        'super_admin': '超级管理员',
        'admin': '管理员',
        'employee': '员工'
    };
    return roles[role] || role;
}

// 获取平台CSS类名
function getPlatformClass(platform) {
    const platformClassMap = {
        '美团': 'platform-meituan',
        '饿了么': 'platform-eleme',
        '饿了么零售': 'platform-elemelingshou',
        '京东': 'platform-jd',
        '淘宝': 'platform-taobao',
        '天猫': 'platform-tmall',
        '拼多多': 'platform-pinduoduo',
        '抖音电商': 'platform-douyin',
       
        '小红书': 'platform-xiaohongshu'
    };
    return platformClassMap[platform] || 'platform-default';
}

// 显示通知
function showNotification(message, type = 'info') {
    // 移除现有的通知
    const existingNotification = document.getElementById('global-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.id = 'global-notification';
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-message">${message}</span>
            <button class="notification-close">&times;</button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // 辅助隐藏
    setTimeout(() => {
        if (notification.parentNode) {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);
    
    // 点击关闭
    notification.querySelector('.notification-close').addEventListener('click', () => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    });
}

// 防抖函数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 格式化错误消息
function formatErrorMessage(result, defaultMessage = '操作失败') {
    if (result && result.message) {
        return result.message;
    }
    if (result && result.error) {
        return result.error;
    }
    return defaultMessage;
}

// 在 utils.js 中添加以下函数

// 显示表单字段错误
function showFieldError(fieldId, message) {
    const errorElement = document.getElementById(fieldId);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.add('show');
        
        // 标记对应的输入框为错误状态
        const inputField = document.querySelector(`[data-field="${fieldId.replace('Error', '')}"]`) || 
                          document.getElementById(fieldId.replace('Error', ''));
        if (inputField) {
            inputField.classList.add('error');
        }
    }
}

// 清除表单字段错误
function clearFieldError(fieldId) {
    const errorElement = document.getElementById(fieldId);
    if (errorElement) {
        errorElement.classList.remove('show');
        
        // 移除对应的输入框错误状态
        const inputField = document.querySelector(`[data-field="${fieldId.replace('Error', '')}"]`) || 
                          document.getElementById(fieldId.replace('Error', ''));
        if (inputField) {
            inputField.classList.remove('error');
        }
    }
}

// 显示全局通知
function showGlobalNotification(message, type = 'info', duration = 5000) {
    // 移除现有的通知
    const existingNotification = document.getElementById('global-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.id = 'global-notification';
    notification.className = `global-notification ${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        display: flex;
        align-items: center;
        max-width: 400px;
        border-left: 4px solid #3498db;
        animation: slideIn 0.3s ease;
    `;
    
    // 根据类型设置边框颜色
    if (type === 'error') {
        notification.style.borderLeftColor = '#e74c3c';
    } else if (type === 'success') {
        notification.style.borderLeftColor = '#2ecc71';
    } else if (type === 'warning') {
        notification.style.borderLeftColor = '#f39c12';
    }
    
    notification.innerHTML = `
        <div style="flex: 1; margin-right: 10px;">${message}</div>
        <button style="background: none; border: none; font-size: 18px; cursor: pointer; color: #999;" onclick="this.parentElement.remove()">&times;</button>
    `;
    
    document.body.appendChild(notification);
    
    // 辅助隐藏
    if (duration > 0) {
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOut 0.3s ease forwards';
                setTimeout(() => notification.remove(), 300);
            }
        }, duration);
    }
    
    return notification;
}
// 验证函数
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validatePhone(phone) {
    const phoneRegex = /^1[3-9]\d{9}$/;
    return phoneRegex.test(phone);
}

// 暴露给全局
if (typeof window !== 'undefined') {
    window.utils = {
        // 原有函数
        setButtonLoading: setButtonLoading,
        getRoleName: getRoleName,
        getPlatformClass: getPlatformClass,
        showNotification: showNotification,
        debounce: debounce,
        formatErrorMessage: formatErrorMessage,
        hashPassword: hashPassword,
        // 新增函数
        showFieldError: showFieldError,
        clearFieldError: clearFieldError,
        showGlobalNotification: showGlobalNotification,
        validateEmail: validateEmail,
        validatePhone: validatePhone
    };
}