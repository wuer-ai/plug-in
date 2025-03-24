/**
 * 中英互译助手 - 调试辅助工具
 * 
 * 此文件提供调试功能和问题诊断工具
 */

/**
 * 检查扩展状态
 */
function checkExtensionStatus() {
  console.log('[中英互译助手调试] 开始检查扩展状态...');
  
  // 检查background是否正常工作
  let backgroundActive = false;
  let contentScriptActive = false;
  let storageAccessible = false;
  
  // 检查storage访问
  try {
    chrome.storage.local.get('autoTranslate', function(result) {
      if (chrome.runtime.lastError) {
        console.error('[中英互译助手调试] 存储访问出错: ', chrome.runtime.lastError);
      } else {
        storageAccessible = true;
        console.log('[中英互译助手调试] 存储访问正常: ', result);
      }
      
      // 检查background script
      try {
        chrome.runtime.sendMessage({ action: 'ping' }, function(response) {
          if (chrome.runtime.lastError) {
            console.error('[中英互译助手调试] Background脚本未响应: ', chrome.runtime.lastError);
          } else if (response && response.status === 'pong') {
            backgroundActive = true;
            console.log('[中英互译助手调试] Background脚本响应正常');
          }
          
          // 检查content script
          try {
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
              if (tabs && tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'ping' }, function(response) {
                  if (chrome.runtime.lastError) {
                    console.error('[中英互译助手调试] Content脚本未响应: ', chrome.runtime.lastError);
                  } else if (response && response.status === 'pong') {
                    contentScriptActive = true;
                    console.log('[中英互译助手调试] Content脚本响应正常');
                  }
                  
                  // 显示总结
                  console.log('[中英互译助手调试] 状态检查结果:');
                  console.log('- 存储访问: ' + (storageAccessible ? '✓ 正常' : '✗ 异常'));
                  console.log('- Background脚本: ' + (backgroundActive ? '✓ 正常' : '✗ 异常'));
                  console.log('- Content脚本: ' + (contentScriptActive ? '✓ 正常' : '✗ 异常'));
                  
                  if (!contentScriptActive) {
                    console.log('[中英互译助手调试] 提示: 可能需要刷新页面或重新加载扩展');
                  }
                });
              } else {
                console.error('[中英互译助手调试] 无法获取当前标签页');
              }
            });
          } catch (e) {
            console.error('[中英互译助手调试] 检查Content脚本时出错: ', e);
          }
        });
      } catch (e) {
        console.error('[中英互译助手调试] 检查Background脚本时出错: ', e);
      }
    });
  } catch (e) {
    console.error('[中英互译助手调试] 检查存储访问时出错: ', e);
  }
}

/**
 * 重新注入content script
 */
function reInjectContentScript() {
  console.log('[中英互译助手调试] 尝试重新注入Content脚本...');
  
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (tabs && tabs.length > 0) {
      const tabId = tabs[0].id;
      
      // 尝试执行脚本
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      }).then(() => {
        console.log('[中英互译助手调试] Content脚本重新注入成功');
        
        // 注入CSS
        chrome.scripting.insertCSS({
          target: { tabId: tabId },
          files: ['content.css']
        }).then(() => {
          console.log('[中英互译助手调试] Content样式重新注入成功');
        }).catch(err => {
          console.error('[中英互译助手调试] Content样式重新注入失败: ', err);
        });
      }).catch(err => {
        console.error('[中英互译助手调试] Content脚本重新注入失败: ', err);
      });
    }
  });
}

/**
 * 简单自诊断
 */
function diagnoseIssues() {
  console.log('[中英互译助手调试] 开始自诊断...');
  
  // 常见错误检查
  const potentialIssues = [];
  
  // 检查权限
  chrome.permissions.contains({
    permissions: ['storage', 'activeTab', 'tabs', 'contextMenus'],
    origins: ['<all_urls>']
  }, function(result) {
    if (!result) {
      potentialIssues.push('权限不足，可能需要重新安装扩展或授予更多权限');
    }
    
    // 检查网络连接
    fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=test')
      .then(response => {
        if (!response.ok) {
          potentialIssues.push('无法连接到Google翻译API，状态码: ' + response.status);
        } else {
          console.log('[中英互译助手调试] Google翻译API连接正常');
        }
      })
      .catch(error => {
        potentialIssues.push('连接Google翻译API出错: ' + error.message);
      })
      .finally(() => {
        // 显示诊断结果
        console.log('[中英互译助手调试] 自诊断结果:');
        if (potentialIssues.length === 0) {
          console.log('未发现明显问题，如果翻译仍然无法工作，请尝试刷新页面或重新加载扩展');
        } else {
          console.log('发现潜在问题:');
          potentialIssues.forEach((issue, index) => {
            console.log(`${index + 1}. ${issue}`);
          });
        }
      });
  });
}

/**
 * 主动恢复失效的content script
 */
function fixInvalidContext() {
  console.log('[中英互译助手调试] 尝试修复上下文无效错误...');
  
  // 首先尝试重新加载扩展的content script
  reInjectContentScript();
  
  // 恢复后的验证逻辑
  setTimeout(() => {
    try {
      chrome.runtime.sendMessage({ action: 'ping' }, function(response) {
        if (chrome.runtime.lastError) {
          console.error('[中英互译助手调试] 仍无法连接到扩展: ', chrome.runtime.lastError);
          console.log('[中英互译助手调试] 建议刷新页面或重启浏览器以恢复功能');
        } else if (response && response.status === 'pong') {
          console.log('%c[中英互译助手调试] 连接已恢复!', 'color: green; font-weight: bold;');
          
          // 通知content script已恢复
          chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs && tabs.length > 0) {
              chrome.tabs.sendMessage(tabs[0].id, { action: 'contextRecovered' })
                .then(() => console.log('[中英互译助手调试] 已通知content script恢复上下文'))
                .catch(err => console.error('[中英互译助手调试] 通知content script失败: ', err));
            }
          });
        }
      });
    } catch (e) {
      console.error('[中英互译助手调试] 检查恢复状态时出错: ', e);
    }
  }, 1000);
}

// 导出诊断函数到全局对象
window.translateExtDebug = {
  checkStatus: checkExtensionStatus,
  reInject: reInjectContentScript,
  diagnose: diagnoseIssues,
  fixContext: fixInvalidContext
};

// 初始提示信息
console.log('[中英互译助手调试] 调试工具已加载，可以使用 translateExtDebug.checkStatus() 检查扩展状态'); 