// 背景脚本，处理消息传递、截图捕获和下载功能

// 监听来自popup或content脚本的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'captureVisibleTab') {
    // 捕获当前可见区域的截图
    captureVisibleTab(message.format, message.quality)
      .then(dataUrl => {
        sendResponse({ success: true, dataUrl: dataUrl });
      })
      .catch(error => {
        console.error('截图失败:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 异步响应
  } else if (message.action === 'captureFullPage') {
    // 启动全页面截图过程
    captureFullPage(message.format, message.quality)
      .then(dataUrl => {
        sendResponse({ success: true, dataUrl: dataUrl });
      })
      .catch(error => {
        console.error('全页面截图失败:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 异步响应
  } else if (message.action === 'downloadImage') {
    // 下载图片
    downloadImage(message.dataUrl, message.filename)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('下载失败:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 异步响应
  }
});

// 捕获当前可见区域的截图
async function captureVisibleTab(format = 'jpeg', quality = 90) {
  try {
    // 获取当前活动标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      throw new Error('没有找到活动标签页');
    }

    // 捕获可见区域的截图
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: format,
      quality: quality
    });

    return dataUrl;
  } catch (error) {
    console.error('捕获可见区域失败:', error);
    throw error;
  }
}

// 捕获全页面截图（通过与content脚本通信实现滚动捕获）
async function captureFullPage(format = 'jpeg', quality = 90) {
  try {
    // 获取当前活动标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      throw new Error('没有找到活动标签页');
    }

    // 向content脚本发送消息，获取页面尺寸信息
    const dimensions = await chrome.tabs.sendMessage(tab.id, { action: 'getDimensions' });
    
    // 初始化画布
    const canvas = new OffscreenCanvas(dimensions.totalWidth, dimensions.totalHeight);
    const ctx = canvas.getContext('2d');
    
    // 计算需要滚动的次数
    const viewportHeight = dimensions.viewportHeight;
    const totalHeight = dimensions.totalHeight;
    const scrollCount = Math.ceil(totalHeight / viewportHeight);
    
    // 逐段捕获页面
    for (let i = 0; i < scrollCount; i++) {
      // 向content脚本发送消息，滚动到指定位置
      await chrome.tabs.sendMessage(tab.id, { 
        action: 'scrollTo', 
        position: i * viewportHeight 
      });
      
      // 等待滚动和重绘完成
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 捕获当前可见区域
      const dataUrl = await captureVisibleTab(format, quality);
      
      // 将捕获的图像绘制到画布上
      const img = await createImageBitmap(await (await fetch(dataUrl)).blob());
      ctx.drawImage(img, 0, i * viewportHeight, dimensions.viewportWidth, 
                   (i === scrollCount - 1 && totalHeight % viewportHeight !== 0) 
                   ? (totalHeight % viewportHeight) 
                   : viewportHeight);
    }
    
    // 将画布转换为数据URL
    const blob = await canvas.convertToBlob({ type: `image/${format}`, quality: quality / 100 });
    const reader = new FileReader();
    
    return new Promise((resolve) => {
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('捕获全页面失败:', error);
    throw error;
  }
}

// 下载图片
async function downloadImage(dataUrl, filename) {
  try {
    // 使用chrome.downloads API下载图片
    await chrome.downloads.download({
      url: dataUrl,
      filename: filename || `screenshot_${new Date().toISOString().replace(/:/g, '-')}.jpg`,
      saveAs: true
    });
  } catch (error) {
    console.error('下载图片失败:', error);
    throw error;
  }
}
