/**
 * 后台脚本主文件
 */
import { debugLog } from '../utils/safeApi.js';
import { detectLanguage, determineTranslationDirection } from '../utils/language.js';
import { translateText } from '../services/translator.js';
import { initializeSettings, getSettings } from '../services/storage.js';

// 跟踪已注入content script的标签页
const injectedTabs = new Set();

/**
 * 创建上下文菜单
 */
function createContextMenu() {
  chrome.contextMenus.create({
    id: "translateSelection",
    title: "翻译选中文本",
    contexts: ["selection"]
  });
  
  debugLog('创建上下文菜单完成');
}

/**
 * 初始化扩展
 */
function initializeExtension() {
  // 创建上下文菜单
  createContextMenu();
  
  // 初始化设置
  initializeSettings();
  
  debugLog('扩展已安装/更新');
}

/**
 * 处理上下文菜单点击事件
 * @param {chrome.contextMenus.OnClickData} info 菜单项信息
 * @param {chrome.tabs.Tab} tab 标签页信息
 */
function handleContextMenuClick(info, tab) {
  if (info.menuItemId === "translateSelection") {
    const selectedText = info.selectionText;
    debugLog('上下文菜单翻译请求: ' + selectedText);
    processTranslation(selectedText, tab.id);
  }
}

/**
 * 处理标签页更新事件
 * @param {number} tabId 标签页ID
 * @param {object} changeInfo 变更信息
 * @param {chrome.tabs.Tab} tab 标签页信息
 */
function handleTabUpdated(tabId, changeInfo, tab) {
  // 只有完成加载的页面才检查content script状态
  if (changeInfo.status === 'complete' && injectedTabs.has(tabId)) {
    checkContentScriptStatus(tabId);
  }
}

/**
 * 检查content script状态
 * @param {number} tabId 标签页ID
 */
function checkContentScriptStatus(tabId) {
  try {
    chrome.tabs.sendMessage(tabId, { action: "ping" }, (response) => {
      if (chrome.runtime.lastError) {
        debugLog(`标签页 ${tabId} 的content script可能已失效: ${chrome.runtime.lastError.message}`);
        injectedTabs.delete(tabId);
      } else if (response && response.status === "pong") {
        debugLog(`标签页 ${tabId} 的content script正常响应`);
      }
    });
  } catch (error) {
    debugLog(`检查content script状态出错: ${error.message}`);
    injectedTabs.delete(tabId);
  }
}

/**
 * 处理来自内容脚本的消息
 * @param {object} message 消息对象
 * @param {chrome.runtime.MessageSender} sender 发送者信息
 * @param {function} sendResponse 响应回调
 * @returns {boolean} 是否保持响应通道开放
 */
function handleMessage(message, sender, sendResponse) {
  debugLog('收到消息: ' + JSON.stringify(message));
  
  // 处理ping消息（用于调试和状态检查）
  if (message.action === 'ping') {
    sendResponse({status: 'pong'});
    return true;
  }
  
  // 处理翻译请求
  if (message.action === 'translate') {
    // 如果是翻译请求，记录该标签页已注入content script
    if (sender.tab && sender.tab.id) {
      injectedTabs.add(sender.tab.id);
    }
    processTranslation(message.text, sender.tab.id);
    sendResponse({status: 'processing'});
    return true;
  }
  
  // 处理content script加载报告
  if (message.action === 'contentScriptLoaded') {
    if (sender.tab && sender.tab.id) {
      injectedTabs.add(sender.tab.id);
      debugLog(`Content script已加载于标签页 ${sender.tab.id}: ${message.url}`);
    }
    sendResponse({status: 'noted'});
    return true;
  }
  
  // 处理调试工具加载请求
  if (message.action === 'loadDebugTool') {
    if (sender.tab && sender.tab.id) {
      injectDebugTool(sender.tab.id);
      sendResponse({status: 'debug_tool_loaded'});
    } else {
      sendResponse({status: 'error', message: '无法获取标签页ID'});
    }
    return true;
  }
  
  return false;
}

/**
 * 处理翻译请求
 * @param {string} text 要翻译的文本
 * @param {number} tabId 标签页ID
 */
async function processTranslation(text, tabId) {
  debugLog(`开始翻译文本: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`);
  
  try {
    // 获取翻译设置
    const settings = await getSettings();
    
    // 检测语言
    const detectedLang = detectLanguage(text);
    debugLog('检测到的语言: ' + detectedLang);
    
    // 确定翻译方向
    const { sourceLang, targetLang } = determineTranslationDirection(detectedLang, settings);
    
    debugLog(`翻译方向: ${sourceLang} -> ${targetLang}`);
    
    // 执行翻译
    const translatedText = await translateText(text, sourceLang, targetLang);
    
    // 发送翻译结果到内容脚本
    sendMessageToTab(tabId, {
      action: "showTranslation",
      original: text,
      translated: translatedText,
      sourceLang: sourceLang,
      targetLang: targetLang
    });
  } catch (error) {
    debugLog('翻译出错: ' + error.message);
    sendMessageToTab(tabId, {
      action: "translationError",
      message: error.message || "翻译服务暂时不可用，请稍后重试"
    });
  }
}

/**
 * 安全地发送消息到标签页
 * @param {number} tabId 标签页ID
 * @param {object} message 要发送的消息
 */
function sendMessageToTab(tabId, message) {
  try {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        debugLog(`发送消息到标签页 ${tabId} 失败: ${chrome.runtime.lastError.message}`);
        
        // 如果是因为content script失效，从注入列表中移除
        if (chrome.runtime.lastError.message.includes('Extension context invalidated') ||
            chrome.runtime.lastError.message.includes('Could not establish connection')) {
          injectedTabs.delete(tabId);
        }
      }
    });
  } catch (error) {
    debugLog(`发送消息出错: ${error.message}`);
  }
}

/**
 * 注入调试工具
 * @param {number} tabId 标签页ID
 */
function injectDebugTool(tabId) {
  debugLog('正在注入调试工具到标签页: ' + tabId);
  
  chrome.scripting.executeScript({
    target: {tabId: tabId},
    files: ['debug.js']
  }).then(() => {
    debugLog('调试工具注入成功');
  }).catch(err => {
    console.error('调试工具注入失败: ', err);
  });
}

// 注册事件监听器
chrome.runtime.onInstalled.addListener(initializeExtension);
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);
chrome.tabs.onUpdated.addListener(handleTabUpdated);
chrome.runtime.onMessage.addListener(handleMessage);

// 导出函数以供测试和调试
export {
  processTranslation,
  sendMessageToTab,
  checkContentScriptStatus,
  injectDebugTool
}; 