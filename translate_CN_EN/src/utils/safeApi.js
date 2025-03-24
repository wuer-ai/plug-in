/**
 * 安全API调用工具
 */

// 全局变量，用于跟踪扩展上下文是否有效
let isExtensionValid = true;

/**
 * 调试辅助函数
 * @param {string} message 要记录的消息
 */
function debugLog(message) {
  if (isExtensionValid) {
    console.log('[中英互译助手] ' + message);
  }
}

/**
 * 安全的API调用包装函数，处理扩展上下文无效的情况
 * @param {Function} apiCall 要执行的API调用函数
 * @param {*} fallback 失败时的返回值
 * @returns {*} API调用的结果或fallback值
 */
function safeApiCall(apiCall, fallback = null) {
  try {
    if (!isExtensionValid) return fallback;
    return apiCall();
  } catch (error) {
    if (error.message.includes('Extension context invalidated') || 
        error.message.includes('Extension context was invalidated') ||
        error.message.includes('context invalidated')) {
      isExtensionValid = false;
      console.warn('[中英互译助手] 扩展上下文已失效，页面刷新后将恢复正常');
      return fallback;
    }
    console.error('[中英互译助手] API调用错误:', error);
    return fallback;
  }
}

/**
 * 设置扩展上下文状态
 * @param {boolean} valid 上下文是否有效
 */
function setExtensionValid(valid) {
  isExtensionValid = valid;
}

/**
 * 获取扩展上下文状态
 * @returns {boolean} 当前扩展上下文是否有效
 */
function getExtensionValid() {
  return isExtensionValid;
}

// 导出函数和变量
export { debugLog, safeApiCall, setExtensionValid, getExtensionValid }; 