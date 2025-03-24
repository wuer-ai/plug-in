/**
 * 翻译弹窗UI组件
 */
import { debugLog, safeApiCall } from '../utils/safeApi.js';
import { getSettings } from '../services/storage.js';

// 全局变量
let translationPopup = null;
let lastMousePosition = { x: 0, y: 0 };

/**
 * 设置鼠标位置
 * @param {number} x 鼠标X坐标
 * @param {number} y 鼠标Y坐标
 */
function setMousePosition(x, y) {
  lastMousePosition = { x, y };
}

/**
 * 显示翻译结果弹窗
 * @param {string} original 原文
 * @param {string} translated 翻译后的文本
 * @param {string} sourceLang 源语言
 * @param {string} targetLang 目标语言
 */
function showTranslationPopup(original, translated, sourceLang, targetLang) {
  debugLog('显示翻译结果');
  
  // 先移除已有的弹窗
  removeTranslationPopup();
  
  // 创建弹窗元素
  translationPopup = document.createElement('div');
  translationPopup.className = 'translation-popup';
  
  // 创建弹窗内容
  const content = document.createElement('div');
  content.className = 'translation-content';
  
  // 原文
  const originalText = document.createElement('div');
  originalText.className = 'original-text';
  originalText.textContent = original;
  
  // 翻译结果
  const translatedText = document.createElement('div');
  translatedText.className = 'translated-text';
  translatedText.textContent = translated;
  
  // 翻译方向
  const translationDirection = document.createElement('div');
  translationDirection.className = 'translation-direction';
  translationDirection.textContent = `${sourceLang === 'zh-CN' ? '中文 → 英文' : '英文 → 中文'}`;
  
  // 组装弹窗
  content.appendChild(originalText);
  content.appendChild(document.createElement('hr'));
  content.appendChild(translatedText);
  content.appendChild(translationDirection);
  translationPopup.appendChild(content);
  
  // 设置弹窗位置
  positionPopup(translationPopup);
  
  // 将弹窗添加到页面
  document.body.appendChild(translationPopup);
  
  // 检查是否设置了弹窗超时
  safeApiCall(() => {
    getSettings().then(settings => {
      const timeout = parseInt(settings.popupTimeout);
      if (timeout > 0) {
        // 设置超时自动关闭
        debugLog(`设置翻译弹窗${timeout}秒后自动关闭`);
        setTimeout(removeTranslationPopup, timeout * 1000);
      }
    });
  });
}

/**
 * 显示错误信息弹窗
 * @param {string} errorMessage 错误信息
 */
function showErrorPopup(errorMessage) {
  debugLog('显示错误信息: ' + errorMessage);
  
  // 先移除已有的弹窗
  removeTranslationPopup();
  
  // 创建弹窗元素
  translationPopup = document.createElement('div');
  translationPopup.className = 'translation-popup error';
  
  // 创建弹窗内容
  const content = document.createElement('div');
  content.className = 'translation-content';
  content.textContent = errorMessage;
  
  // 组装弹窗
  translationPopup.appendChild(content);
  
  // 设置弹窗位置
  positionPopup(translationPopup);
  
  // 将弹窗添加到页面
  document.body.appendChild(translationPopup);
  
  // 3秒后自动关闭
  setTimeout(removeTranslationPopup, 3000);
}

/**
 * 设置弹窗位置
 * @param {HTMLElement} popup 弹窗元素
 */
function positionPopup(popup) {
  // 获取视口尺寸
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // 设置初始位置（鼠标位置）
  popup.style.position = 'fixed';
  popup.style.zIndex = '9999';
  
  // 先定位在鼠标位置附近
  popup.style.left = `${lastMousePosition.x + 10}px`;
  popup.style.top = `${lastMousePosition.y + 10}px`;
  
  // 添加到DOM以便获取尺寸
  document.body.appendChild(popup);
  
  // 获取弹窗尺寸
  const popupRect = popup.getBoundingClientRect();
  
  // 调整位置，确保在视口内
  if (lastMousePosition.x + popupRect.width + 20 > viewportWidth) {
    popup.style.left = `${lastMousePosition.x - popupRect.width - 10}px`;
  }
  
  if (lastMousePosition.y + popupRect.height + 20 > viewportHeight) {
    popup.style.top = `${lastMousePosition.y - popupRect.height - 10}px`;
  }
  
  // 从DOM中移除，因为我们只是用来测量大小
  document.body.removeChild(popup);
  
  debugLog('弹窗位置已设置');
}

/**
 * 移除翻译弹窗
 */
function removeTranslationPopup() {
  if (translationPopup && translationPopup.parentNode) {
    translationPopup.parentNode.removeChild(translationPopup);
    debugLog('翻译弹窗已移除');
  }
  translationPopup = null;
}

/**
 * 检查鼠标是否在弹窗附近
 * @param {number} mouseX 鼠标X坐标
 * @param {number} mouseY 鼠标Y坐标
 * @returns {boolean} 鼠标是否在弹窗附近
 */
function isMouseNearPopup(mouseX, mouseY) {
  if (!translationPopup || !translationPopup.parentNode) {
    return false;
  }
  
  const popupRect = translationPopup.getBoundingClientRect();
  
  // 检查鼠标是否在popup内或接近popup
  return (
    mouseX >= popupRect.left - 50 &&
    mouseX <= popupRect.right + 50 &&
    mouseY >= popupRect.top - 50 &&
    mouseY <= popupRect.bottom + 50
  );
}

export { 
  showTranslationPopup, 
  showErrorPopup, 
  removeTranslationPopup, 
  setMousePosition, 
  isMouseNearPopup 
}; 