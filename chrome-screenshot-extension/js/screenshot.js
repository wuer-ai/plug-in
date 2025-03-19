// 截图处理工具，专门处理全页面滚动捕获和图像处理

// 全页面截图处理函数
class ScreenshotHandler {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.scrollPosition = 0;
    this.dimensions = null;
    this.format = 'jpeg';
    this.quality = 90;
    this.capturedParts = [];
  }

  // 初始化截图过程
  async initialize(tabId, format = 'jpeg', quality = 90) {
    this.format = format;
    this.quality = quality;
    this.capturedParts = [];
    
    try {
      // 获取页面尺寸信息
      this.dimensions = await chrome.tabs.sendMessage(tabId, { action: 'getDimensions' });
      console.log('页面尺寸信息:', this.dimensions);
      
      // 创建离屏画布
      this.canvas = new OffscreenCanvas(
        this.dimensions.totalWidth, 
        this.dimensions.totalHeight
      );
      this.ctx = this.canvas.getContext('2d');
      
      // 重置滚动位置
      this.scrollPosition = 0;
      await chrome.tabs.sendMessage(tabId, { 
        action: 'scrollTo', 
        position: this.scrollPosition 
      });
      
      // 等待页面重绘
      await this.sleep(100);
      
      return true;
    } catch (error) {
      console.error('初始化截图过程失败:', error);
      return false;
    }
  }
  
  // 捕获下一部分
  async captureNextPart(tabId) {
    try {
      // 捕获当前可见区域
      const dataUrl = await this.captureVisibleTab();
      
      // 将捕获的图像添加到列表
      this.capturedParts.push({
        dataUrl,
        position: this.scrollPosition
      });
      
      // 计算下一个滚动位置
      const nextPosition = this.scrollPosition + this.dimensions.viewportHeight;
      
      // 检查是否已经滚动到底部
      if (nextPosition >= this.dimensions.totalHeight) {
        return false; // 已完成所有部分的捕获
      }
      
      // 滚动到下一个位置
      this.scrollPosition = nextPosition;
      await chrome.tabs.sendMessage(tabId, { 
        action: 'scrollTo', 
        position: this.scrollPosition 
      });
      
      // 等待页面重绘
      await this.sleep(100);
      
      return true; // 还有更多部分需要捕获
    } catch (error) {
      console.error('捕获下一部分失败:', error);
      throw error;
    }
  }
  
  // 合并所有捕获的部分
  async mergeAllParts() {
    try {
      // 清除画布
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      
      // 将所有捕获的部分绘制到画布上
      for (const part of this.capturedParts) {
        const img = await this.dataUrlToImageBitmap(part.dataUrl);
        this.ctx.drawImage(
          img, 
          0, 
          part.position, 
          this.dimensions.viewportWidth,
          Math.min(
            this.dimensions.viewportHeight,
            this.dimensions.totalHeight - part.position
          )
        );
      }
      
      // 将画布转换为数据URL
      const blob = await this.canvas.convertToBlob({ 
        type: `image/${this.format}`, 
        quality: this.format === 'jpeg' ? this.quality / 100 : undefined 
      });
      
      return await this.blobToDataUrl(blob);
    } catch (error) {
      console.error('合并所有部分失败:', error);
      throw error;
    }
  }
  
  // 辅助方法：捕获当前可见区域
  async captureVisibleTab() {
    return new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab(null, {
        format: this.format,
        quality: this.quality
      }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(dataUrl);
        }
      });
    });
  }
  
  // 辅助方法：将数据URL转换为ImageBitmap
  async dataUrlToImageBitmap(dataUrl) {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return await createImageBitmap(blob);
  }
  
  // 辅助方法：将Blob转换为数据URL
  async blobToDataUrl(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }
  
  // 辅助方法：延迟执行
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 导出处理器
window.ScreenshotHandler = ScreenshotHandler;
