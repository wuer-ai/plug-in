/**
 * 内容脚本主文件
 */
import { debugLog, safeApiCall, setExtensionValid, getExtensionValid } from '../utils/safeApi.js';
import { getSettings } from '../services/storage.js';
import { 
  showTranslationPopup, 
  showErrorPopup, 
  removeTranslationPopup, 
  setMousePosition, 
  isMouseNearPopup 
} from '../ui/popup.js';

// 全局变量
let isTranslating = false; // 防止重复翻译的标志

/**
 * 初始化翻译设置
 */
function initTranslationSettings() {
  safeApiCall(() => {
    getSettings().then(settings => {
      debugLog('内容脚本已加载并初始化设置');
    });
  });
}

/**
 * 向背景脚本报告内容脚本已加载
 */
function reportContentScriptLoaded() {
  safeApiCall(() => {
    chrome.runtime.sendMessage({
      action: "contentScriptLoaded",
      url: window.location.href
    }).catch(err => {
      if (err.message.includes('context invalidated')) {
        setExtensionValid(false);
      }
    });
  });
}

/**
 * 处理鼠标选中事件
 * @param {MouseEvent} event 鼠标事件
 */
function handleMouseUp(event) {
  if (!getExtensionValid()) return;
  
  setTimeout(() => {
    try {
      const selectedText = window.getSelection().toString().trim();
      
      // 保存鼠标位置
      setMousePosition(event.clientX, event.clientY);
      
      // 如果有选中文本，准备翻译
      if (selectedText.length > 0 && !isTranslating) {
        debugLog('检测到选中文本: ' + selectedText);
        
        // 设置标志防止重复翻译
        isTranslating = true;
        
        // 获取设置，判断是否启用自动翻译
        safeApiCall(() => {
          getSettings({ autoTranslate: true }).then(settings => {
            if (settings.autoTranslate) {
              // 发送消息到background.js进行翻译
              chrome.runtime.sendMessage({
                action: "translate",
                text: selectedText
              }).then(response => {
                debugLog('发送翻译请求，收到响应: ' + JSON.stringify(response));
              }).catch(err => {
                debugLog('发送消息错误: ' + err.message);
                
                // 如果是上下文无效错误，标记扩展状态
                if (err.message.includes('context invalidated') || 
                    err.message.includes('Extension context invalidated')) {
                  setExtensionValid(false);
                }
              }).finally(() => {
                // 重置标志
                isTranslating = false;
              });
            } else {
              debugLog('自动翻译已禁用');
              isTranslating = false;
            }
          });
        }, () => {
          isTranslating = false; // 确保在失败时也重置标志
        });
      }
    } catch (error) {
      console.error('[中英互译助手] 处理选中文本时出错:', error);
      isTranslating = false;
      
      if (error.message.includes('context invalidated') || 
          error.message.includes('Extension context invalidated')) {
        setExtensionValid(false);
      }
    }
  }, 200);
}

/**
 * 处理鼠标移动事件
 * @param {MouseEvent} event 鼠标事件
 */
function handleMouseMove(event) {
  if (!isMouseNearPopup(event.clientX, event.clientY)) {
    removeTranslationPopup();
  }
}

/**
 * 设置消息监听器
 */
function setupMessageListener() {
  safeApiCall(() => {
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
      try {
        debugLog('收到消息: ' + JSON.stringify(message));
        
        if (message.action === "showTranslation") {
          showTranslationPopup(message.original, message.translated, message.sourceLang, message.targetLang);
          sendResponse({status: "success"});
        } else if (message.action === "translationError") {
          showErrorPopup(message.message);
          sendResponse({status: "error"});
        } else if (message.action === "ping") {
          // 添加ping-pong机制检查content script是否仍然活跃
          sendResponse({status: "pong"});
        } else if (message.action === "contextRecovered") {
          // 处理上下文恢复通知
          setExtensionValid(true);
          debugLog('扩展上下文已恢复正常');
          sendResponse({status: "recovered"});
          
          // 重新初始化设置
          initTranslationSettings();
        } else {
          sendResponse({status: "unknown_action"});
        }
        
        return true; // 保持消息通道开放
      } catch (error) {
        console.error('[中英互译助手] 处理消息时出错:', error);
        
        if (error.message.includes('context invalidated') || 
            error.message.includes('Extension context invalidated')) {
          setExtensionValid(false);
        }
        
        sendResponse({status: "error", message: error.message});
        return true;
      }
    });
  });
}

/**
 * 初始化内容脚本
 */
function initialize() {
  try {
    // 初始化设置
    initTranslationSettings();
    
    // 向背景脚本报告内容脚本已加载
    reportContentScriptLoaded();
    
    // 设置事件监听器
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousemove', handleMouseMove);
    
    // 设置消息监听器
    setupMessageListener();
    
    // 添加页面卸载监听器，清理资源
    window.addEventListener('beforeunload', () => {
      debugLog('页面卸载，清理资源');
      removeTranslationPopup();
    });
    
    debugLog('内容脚本初始化完成');
  } catch (e) {
    // 如果初始化过程出错，记录错误但继续执行
    if (e.message.includes('context invalidated') || 
        e.message.includes('Extension context invalidated')) {
      setExtensionValid(false);
      console.warn('[中英互译助手] 初始化时扩展上下文已失效，功能可能受限');
    } else {
      console.error('[中英互译助手] 初始化错误:', e);
    }
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initialize);

// 导出函数以供测试和调试
export { 
  initTranslationSettings, 
  handleMouseUp, 
  handleMouseMove 
}; 