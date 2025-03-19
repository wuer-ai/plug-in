// content.js - 在网页中执行的脚本，处理页面滚动和尺寸测量

// 监听来自background脚本的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getDimensions') {
    // 获取页面尺寸信息
    const dimensions = getPageDimensions();
    sendResponse(dimensions);
  } else if (message.action === 'scrollTo') {
    // 滚动到指定位置
    window.scrollTo(0, message.position);
    sendResponse({ success: true });
  }
  return true; // 异步响应
});

// 获取页面尺寸信息
function getPageDimensions() {
  // 获取视口尺寸
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // 获取页面总尺寸
  // 使用多种方法确保兼容性
  const totalHeight = Math.max(
    document.body.scrollHeight,
    document.body.offsetHeight,
    document.documentElement.clientHeight,
    document.documentElement.scrollHeight,
    document.documentElement.offsetHeight
  );
  
  const totalWidth = Math.max(
    document.body.scrollWidth,
    document.body.offsetWidth,
    document.documentElement.clientWidth,
    document.documentElement.scrollWidth,
    document.documentElement.offsetWidth
  );
  
  // 获取当前滚动位置
  const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
  const scrollY = window.pageYOffset || document.documentElement.scrollTop;
  
  return {
    viewportWidth,
    viewportHeight,
    totalWidth,
    totalHeight,
    scrollX,
    scrollY
  };
}

// 初始化
console.log('高清网页截图扩展已加载');
