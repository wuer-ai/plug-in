/**
 * 翻译服务
 */
import { debugLog } from '../utils/safeApi.js';

/**
 * 使用Google翻译API翻译文本
 * @param {string} text 要翻译的文本
 * @param {string} sourceLang 源语言
 * @param {string} targetLang 目标语言
 * @returns {Promise<string>} 翻译后的文本
 */
async function translateText(text, sourceLang, targetLang) {
  debugLog(`翻译: ${sourceLang} -> ${targetLang}`);
  
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
    
    debugLog(`翻译成功: "${translatedText.substring(0, 30)}${translatedText.length > 30 ? '...' : ''}"`);
    
    return translatedText;
  } catch (error) {
    debugLog('翻译出错: ' + error.message);
    throw new Error('翻译服务暂时不可用，请稍后重试');
  }
}

export { translateText }; 