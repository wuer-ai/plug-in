// 使用Map来存储每个标签页的监听器
const tabListeners = new Map();

// 监听标签页创建事件
chrome.tabs.onCreated.addListener(async (tab) => {
  // 为新创建的标签页添加一个监听器
  const listener = async (tabId, changeInfo, updatedTab) => {
    if (tabId === tab.id && changeInfo.url) {
      // 移除监听器
      chrome.tabs.onUpdated.removeListener(listener);
      tabListeners.delete(tab.id);
      
      // 处理标签页分组
      await processTabGrouping(updatedTab);
    }
  };
  
  // 保存监听器引用
  tabListeners.set(tab.id, listener);
  chrome.tabs.onUpdated.addListener(listener);
});

// 监听标签页URL更新事件
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // 当标签页完成加载且不是新创建的标签页时处理
  if (changeInfo.status === 'complete' && !tabListeners.has(tabId)) {
    await processTabGrouping(tab);
  }
});

// 监听标签页关闭事件，清理相关监听器
chrome.tabs.onRemoved.addListener((tabId) => {
  const listener = tabListeners.get(tabId);
  if (listener) {
    chrome.tabs.onUpdated.removeListener(listener);
    tabListeners.delete(tabId);
  }
});

// 处理标签页分组逻辑
async function processTabGrouping(tab) {
  try {
    // 首先检查自动分组功能是否启用
    const result = await chrome.storage.local.get('enableAutoGroup');
    // 如果明确禁用了自动分组功能，则不执行分组操作
    if (result.enableAutoGroup === false) {
      console.log('自动分组功能已禁用，跳过分组操作');
      return;
    }
    // 获取标签页URL
    const url = tab.url;
    if (!url || url === '' || url.startsWith('chrome://')) {
      return; // 忽略空URL或Chrome内部页面
    }
    
    // 从URL中提取域名
    const urlObj = new URL(url);
    let domain = urlObj.hostname;
    
    // 移除www前缀
    if (domain.startsWith('www.')) {
      domain = domain.substring(4);
    }
    
    console.log('处理域名:', domain); // 调试日志
    
    // 获取保存的域名配置
    const domainConfigResult = await chrome.storage.local.get('domainConfigs');
    const configs = domainConfigResult.domainConfigs || [];
    
    console.log('当前配置:', configs); // 调试日志
    
    // 提取主域名（用于分组匹配）
    const domainParts = domain.split('.');
    const mainDomain = domainParts.length >= 2 ? 
      domainParts[domainParts.length - 2] + '.' + domainParts[domainParts.length - 1] : 
      domain;
    
    // 查找匹配的域名配置
    const matchedConfig = configs.find(config => {
      // 获取配置中的域名列表
      const configDomains = Array.isArray(config.domains) ? 
        config.domains : 
        [config.domain]; // 兼容旧数据格式
      
      // 检查每个配置的域名
      return configDomains.some(configDomain => {
        // 移除配置中的www前缀
        if (configDomain.startsWith('www.')) {
          configDomain = configDomain.substring(4);
        }
        
        // 提取配置中的主域名
        const configDomainParts = configDomain.split('.');
        const configMainDomain = configDomainParts.length >= 2 ? 
          configDomainParts[configDomainParts.length - 2] + '.' + configDomainParts[configDomainParts.length - 1] : 
          configDomain;
        
        // 匹配逻辑：
        // 1. 完全匹配域名
        // 2. 如果配置的是主域名，则匹配所有子域名
        // 3. 如果配置的是子域名，则只精确匹配该子域名
        const isExactMatch = domain === configDomain;
        const isSubdomainMatch = domain.endsWith('.' + configMainDomain) && 
                                configDomain === configMainDomain;
        
        const isMatch = isExactMatch || isSubdomainMatch;
        console.log(`比较域名: ${domain} 与 ${configDomain}, 匹配结果: ${isMatch}`); // 调试日志
        return isMatch;
      });
    });
    
    if (matchedConfig) {
      // 查找当前窗口中是否已存在相同域名的标签组
      const currentWindow = await chrome.windows.getCurrent();
      
      // 获取所有标签组
      const allGroups = await chrome.tabGroups.query({
        windowId: currentWindow.id
      });
      
      // 查找匹配的标签组
      let matchingGroup = null;
      for (const group of allGroups) {
        if (group.title === matchedConfig.groupName) {
          matchingGroup = group;
          break;
        }
      }
      
      let groupId;
      
      if (matchingGroup) {
        // 如果已存在相同名称的标签组，使用该组
        groupId = matchingGroup.id;
        
        // 将标签添加到现有组
        await chrome.tabs.group({
          groupId: groupId,
          tabIds: [tab.id]
        });
      } else {
        // 如果不存在，创建新的标签组
        groupId = await chrome.tabs.group({
          tabIds: [tab.id]
        });
        
        // 确保颜色名称是Chrome支持的
        // Chrome支持的颜色: grey, blue, red, yellow, green, pink, purple, cyan, orange
        const validColors = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
        let color = matchedConfig.color;
        
        if (!validColors.includes(color)) {
          // 如果颜色不在支持列表中，使用默认颜色
          color = 'blue';
        }
        
        // 设置标签组的标题和颜色
        await chrome.tabGroups.update(groupId, {
          title: matchedConfig.groupName,
          color: color
        });
      }
    }
  } catch (error) {
    console.error('标签分组处理错误:', error);
  }
}