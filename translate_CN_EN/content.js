// 全局变量
let isExtensionValid = true;
let isTranslating = false;
let translationPopup = null;
let lastMousePosition = { x: 0, y: 0 };
let recoveryAttempts = 0;
const MAX_RECOVERY_ATTEMPTS = 3;

// 初始化扩展
document.addEventListener('DOMContentLoaded', function() {
  initTranslationSettings();
  setupMessageListener();
});

// 设置消息监听器
function setupMessageListener() {
  try {
    if (chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('收到消息: ' + JSON.stringify(message));
        // 简单返回成功
        sendResponse({status: "ok"});
        return true;
      });
    }
  } catch (error) {
    console.error('设置消息监听器时出错:', error);
  }
}

// 自动恢复机制
function attemptRecovery() {
  if (recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
    console.log('已达到最大恢复尝试次数，请刷新页面');
    return;
  }
  
  recoveryAttempts++;
  console.log(`尝试恢复扩展状态 (第${recoveryAttempts}次)`);
  
  try {
    // 重新初始化设置
    initTranslationSettings();
  } catch (error) {
    console.log('恢复尝试失败: ' + error.message);
    setTimeout(attemptRecovery, 1000); // 1秒后重试
  }
}

// 安全的API调用包装函数，处理扩展上下文无效的情况
function safeApiCall(apiCall, fallback = null) {
  try {
    if (!isExtensionValid) return fallback;
    return apiCall();
  } catch (error) {
    if (error.message.includes('Extension context invalidated') ||
        error.message.includes('Extension context was invalidated') ||
        error.message.includes('context invalidated')) {
      isExtensionValid = false;
      return fallback;
    }
    console.error('[中英互译助手] API调用错误:', error);
    return fallback;
  }
}

/**
 * 检测文本语言
 * @param {string} text 要检测的文本
 * @returns {string} 语言代码 ('zh-CN', 'en' 或 'mixed')
 */
function detectLanguage(text) {
  // 使用正则表达式检测中文字符
  const chineseRegex = /[\u4e00-\u9fa5]/;
  const chineseChars = text.match(chineseRegex);

  // 使用正则表达式检测英文字符
  const englishRegex = /[a-zA-Z]/;
  const englishChars = text.match(englishRegex);

  // 如果同时包含中文和英文字符，返回'mixed'
  if (chineseChars && englishChars) {
    return 'mixed';
  }

  // 如果包含中文字符，返回'zh-CN'
  if (chineseChars) {
    return 'zh-CN';
  }

  // 否则返回'en'
  return 'en';
}

/**
 * 确定翻译方向
 * @param {string} detectedLang 检测到的语言
 * @param {object} settings 用户设置
 * @returns {object} 包含源语言和目标语言的对象
 */
function determineTranslationDirection(detectedLang, settings) {
  let sourceLang, targetLang;

  // 处理混合文本情况
  if (detectedLang === 'mixed') {
    // 使用偏好设置决定如何处理混合文本
    if (settings.mixedTextPreference === 'zh-CN') {
      // 偏好翻译为英文
      sourceLang = 'zh-CN';
      targetLang = 'en';
    } else {
      // 偏好翻译为中文
      sourceLang = 'en';
      targetLang = 'zh-CN';
    }
  } else {
    // 如果不是混合文本，则根据检测结果设置源语言和目标语言
    sourceLang = detectedLang === 'zh-CN' ? 'zh-CN' : 'en';
    targetLang = detectedLang === 'zh-CN' ? 'en' : 'zh-CN';
  }

  return { sourceLang, targetLang };
}

/**
 * 使用Google翻译API翻译文本
 * @param {string} text 要翻译的文本
 * @param {string} sourceLang 源语言
 * @param {string} targetLang 目标语言
 * @returns {Promise<string>} 翻译后的文本
 */
async function translateText(text, sourceLang, targetLang) {
  console.log(`翻译: ${sourceLang} -> ${targetLang}`);

  // 构建Google翻译API URL
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
                            
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`翻译服务响应错误: ${response.status}`);
    }

    const data = await response.json();

    // Google翻译API返回的数据结构较复杂，需要提取翻译结果
    const translatedText = data[0].map(item => item[0]).join('');

    console.log(`翻译成功: "${translatedText.substring(0, 30)}${translatedText.length > 30 ? '...' : ''}"`);

    return translatedText;
  } catch (error) {
    console.log('翻译出错: ' + error.message);
    throw new Error('翻译服务暂时不可用，请稍后重试');
  }
}

/**
 * 处理翻译请求
 * @param {string} text 要翻译的文本
 */
async function processTranslation(text) {
  try {
    // 检测语言
    const detectedLang = detectLanguage(text);
    console.log('检测到的语言: ' + detectedLang);

    // 确定翻译方向
    let sourceLang, targetLang;
    if (detectedLang === 'mixed') {
      // 混合文本，默认使用中文翻译为英文
      sourceLang = 'zh-CN';
      targetLang = 'en';
    } else {
      // 纯中文或纯英文
      sourceLang = detectedLang === 'zh-CN' ? 'zh-CN' : 'en';
      targetLang = detectedLang === 'zh-CN' ? 'en' : 'zh-CN';
    }

    // 执行翻译
    const translatedText = await translateText(text, sourceLang, targetLang);

    // 显示翻译结果
    showTranslationPopup(text, translatedText, sourceLang, targetLang);
  } catch (error) {
    console.log('翻译出错: ' + error.message);
    showErrorPopup(error.message || "翻译服务暂时不可用，请稍后重试");
  }
}

/**
 * 显示翻译结果弹窗
 * @param {string} original 原文
 * @param {string} translated 翻译后的文本
 * @param {string} sourceLang 源语言
 * @param {string} targetLang 目标语言
 */
function showTranslationPopup(original, translated, sourceLang, targetLang) {
  // 先移除已有的弹窗
  removeTranslationPopup();
  
  // 创建弹窗元素
  translationPopup = document.createElement('div');
  translationPopup.className = 'translation-popup';
  translationPopup.style.position = 'fixed';
  translationPopup.style.zIndex = '9999';
  translationPopup.style.backgroundColor = '#2c2c2c';
  translationPopup.style.color = '#ffffff';
  translationPopup.style.border = '2px solid #555';
  translationPopup.style.borderRadius = '8px';
  translationPopup.style.padding = '12px';
  translationPopup.style.boxShadow = '0 4px 20px rgba(0,0,0,0.5)';
  translationPopup.style.maxWidth = '350px';
  translationPopup.style.fontFamily = 'Arial, sans-serif';
  translationPopup.style.fontSize = '14px';
  translationPopup.style.lineHeight = '1.4';

  // 创建弹窗内容
  const content = document.createElement('div');
  content.className = 'translation-content';

  // 原文
  const originalText = document.createElement('div');
  originalText.className = 'original-text';
  originalText.style.marginBottom = '10px';
  originalText.style.padding = '8px';
  originalText.style.backgroundColor = '#3a3a3a';
  originalText.style.border = '1px solid #555';
  originalText.style.borderRadius = '4px';
  originalText.style.color = '#e0e0e0';
  originalText.style.fontWeight = 'normal';
  originalText.textContent = original;

  // 翻译结果
  const translatedText = document.createElement('div');
  translatedText.className = 'translated-text';
  translatedText.style.marginBottom = '10px';
  translatedText.style.padding = '8px';
  translatedText.style.backgroundColor = '#0d5ba1';
  translatedText.style.border = '1px solid #0a4c8b';
  translatedText.style.borderRadius = '4px';
  translatedText.style.color = '#ffffff';
  translatedText.style.fontWeight = 'bold';
  translatedText.textContent = translated;

  // 翻译方向
  const translationDirection = document.createElement('div');
  translationDirection.className = 'translation-direction';
  translationDirection.style.fontSize = '12px';
  translationDirection.style.color = '#999';
  translationDirection.style.textAlign = 'right';
  translationDirection.textContent = `${sourceLang === 'zh-CN' ? '中文 → 英文' : '英文 → 中文'}`;

  // 组装弹窗
  content.appendChild(originalText);
  
  // 分隔线
  const hr = document.createElement('div');
  hr.style.height = '1px';
  hr.style.backgroundColor = '#555';
  hr.style.margin = '8px 0';
  content.appendChild(hr);
  
  content.appendChild(translatedText);
  content.appendChild(translationDirection);
  translationPopup.appendChild(content);

  // 获取视口尺寸
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // 先定位在鼠标位置附近
  translationPopup.style.left = `${lastMousePosition.x + 10}px`;
  translationPopup.style.top = `${lastMousePosition.y + 10}px`;

  // 将弹窗添加到页面
  document.body.appendChild(translationPopup);

  // 获取弹窗尺寸
  const rect = translationPopup.getBoundingClientRect();

  // 调整位置，确保在视口内
  if (lastMousePosition.x + rect.width + 20 > viewportWidth) {
    translationPopup.style.left = `${lastMousePosition.x - rect.width - 10}px`;
  }

  if (lastMousePosition.y + rect.height + 20 > viewportHeight) {
    translationPopup.style.top = `${lastMousePosition.y - rect.height - 10}px`;
  }

  // 8秒后自动关闭
  setTimeout(removeTranslationPopup, 8000);
}

/**
 * 显示错误信息弹窗
 * @param {string} errorMessage 错误信息
 */
function showErrorPopup(errorMessage) {
  console.log('显示错误信息: ' + errorMessage);

  // 先移除已有的弹窗
  removeTranslationPopup();

  // 创建弹窗元素
  translationPopup = document.createElement('div');
  translationPopup.className = 'translation-popup error';
  translationPopup.style.position = 'fixed';
  translationPopup.style.zIndex = '9999';
  translationPopup.style.backgroundColor = '#4a0000';
  translationPopup.style.border = '2px solid #ff0000';
  translationPopup.style.borderRadius = '8px';
  translationPopup.style.padding = '12px';
  translationPopup.style.boxShadow = '0 4px 20px rgba(0,0,0,0.5)';
  translationPopup.style.maxWidth = '350px';
  translationPopup.style.color = '#ffffff';
  translationPopup.style.fontFamily = 'Arial, sans-serif';
  translationPopup.style.fontSize = '14px';
  translationPopup.style.lineHeight = '1.4';

  // 创建弹窗内容
  const content = document.createElement('div');
  content.className = 'translation-content';
  content.style.padding = '8px';
  content.style.fontWeight = 'bold';
  content.textContent = errorMessage;

  // 组装弹窗
  translationPopup.appendChild(content);

  // 获取视口尺寸
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // 先定位在鼠标位置附近
  translationPopup.style.left = `${lastMousePosition.x + 10}px`;
  translationPopup.style.top = `${lastMousePosition.y + 10}px`;

  // 将弹窗添加到页面
  document.body.appendChild(translationPopup);

  // 获取弹窗尺寸
  const rect = translationPopup.getBoundingClientRect();

  // 调整位置，确保在视口内
  if (lastMousePosition.x + rect.width + 20 > viewportWidth) {
    translationPopup.style.left = `${lastMousePosition.x - rect.width - 10}px`;
  }

  if (lastMousePosition.y + rect.height + 20 > viewportHeight) {
    translationPopup.style.top = `${lastMousePosition.y - rect.height - 10}px`;
  }

  // 4秒后自动关闭
  setTimeout(removeTranslationPopup, 4000);
}

/**
 * 移除翻译弹窗
 */
function removeTranslationPopup() {
  if (translationPopup && translationPopup.parentNode) {
    translationPopup.parentNode.removeChild(translationPopup);
    console.log('翻译弹窗已移除');
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

// 默认设置
const defaultSettings = {
  autoTranslate: true,           // 是否自动翻译选中文本
  defaultSourceLang: 'auto',     // 默认源语言（auto表示自动检测）
  defaultTargetLang: 'auto',     // 默认目标语言（auto表示根据源语言自动选择）  
  mixedTextPreference: 'zh-CN',  // 混合文本（中英文都有）时的翻译偏好
  popupTimeout: '0'              // 弹窗超时时间（默认为0，表示不自动关闭）     
};

/**
 * 获取设置
 * @param {object} customDefault 自定义默认值（可选）
 * @returns {Promise<object>} 设置对象
 */
function getSettings(customDefault = {}) {
  return new Promise((resolve) => {
    const mergedDefaults = { ...defaultSettings, ...customDefault };
    resolve(mergedDefaults);
  });
}

/**
 * 初始化翻译设置
 */
function initTranslationSettings() {
  console.log('内容脚本已加载并初始化设置');
}

// 监听鼠标选中事件
document.addEventListener('mouseup', function(event) {
  setTimeout(function() {
    try {
      const selectedText = window.getSelection().toString().trim();
      
      // 保存鼠标位置
      lastMousePosition = { x: event.clientX, y: event.clientY };
      
      // 如果有选中文本，准备翻译
      if (selectedText.length > 0) {
        console.log('检测到选中文本: ' + selectedText);
        
        // 处理翻译
        processTranslation(selectedText);
      }
    } catch (error) {
      console.error('处理选中文本时出错:', error);
    }
  }, 200);
});

// 监听鼠标移动事件
document.addEventListener('mousemove', function(event) {
  // 如果鼠标远离弹窗，则关闭弹窗
  if (translationPopup && !isMouseNearPopup(event.clientX, event.clientY)) {
    removeTranslationPopup();
  }
});

// 添加页面卸载监听器，清理资源
window.addEventListener('beforeunload', function() {
  console.log('页面卸载，清理资源');
  removeTranslationPopup();
}); 