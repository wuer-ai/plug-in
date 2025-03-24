/**
 * 语言检测和处理工具
 */

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

// 导出函数
export { detectLanguage, determineTranslationDirection }; 