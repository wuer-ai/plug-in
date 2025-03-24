/**
 * 存储服务
 */
import { safeApiCall, debugLog } from '../utils/safeApi.js';

// 默认翻译设置
const defaultSettings = {
  autoTranslate: true,           // 是否自动翻译选中文本
  defaultSourceLang: 'auto',     // 默认源语言（auto表示自动检测）
  defaultTargetLang: 'auto',     // 默认目标语言（auto表示根据源语言自动选择）
  mixedTextPreference: 'zh-CN',  // 混合文本（中英文都有）时的翻译偏好
  popupTimeout: '0'              // 弹窗超时时间（默认为0，表示不自动关闭）
};

/**
 * 获取存储的设置
 * @param {object} customDefault 自定义默认值（可选）
 * @returns {Promise<object>} 设置对象
 */
function getSettings(customDefault = {}) {
  return new Promise((resolve) => {
    const mergedDefaults = { ...defaultSettings, ...customDefault };
    
    safeApiCall(() => {
      chrome.storage.local.get(mergedDefaults, (settings) => {
        debugLog('加载翻译设置: ' + JSON.stringify(settings));
        resolve(settings);
      });
    }, mergedDefaults);
  });
}

/**
 * 保存设置
 * @param {object} settings 要保存的设置
 * @returns {Promise<boolean>} 是否保存成功
 */
function saveSettings(settings) {
  return new Promise((resolve) => {
    safeApiCall(() => {
      chrome.storage.local.set(settings, () => {
        debugLog('保存设置: ' + JSON.stringify(settings));
        resolve(true);
      });
    }, false);
  });
}

/**
 * 初始化默认设置（在扩展首次安装或更新时）
 */
function initializeSettings() {
  getSettings().then(settings => {
    // 确保所有默认设置都存在
    const updatedSettings = { ...defaultSettings, ...settings };
    saveSettings(updatedSettings);
  });
}

export { getSettings, saveSettings, initializeSettings, defaultSettings }; 