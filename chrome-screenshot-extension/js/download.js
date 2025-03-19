// 下载处理工具，专门处理图片下载功能

class DownloadHandler {
  constructor() {
    this.defaultFormat = 'jpeg';
  }

  // 下载图片
  async downloadImage(dataUrl, filename = null) {
    try {
      // 如果没有提供文件名，生成一个默认的
      if (!filename) {
        const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
        const format = this.getFormatFromDataUrl(dataUrl);
        filename = `screenshot_${timestamp}.${format}`;
      }

      // 使用chrome.downloads API下载图片
      const downloadId = await this.startDownload(dataUrl, filename);
      console.log('下载已开始，ID:', downloadId);
      return { success: true, downloadId };
    } catch (error) {
      console.error('下载图片失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 从数据URL中获取格式
  getFormatFromDataUrl(dataUrl) {
    const match = dataUrl.match(/^data:image\/([a-zA-Z]+);base64,/);
    return match ? match[1] : this.defaultFormat;
  }

  // 开始下载
  startDownload(dataUrl, filename) {
    return new Promise((resolve, reject) => {
      chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: true
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(downloadId);
        }
      });
    });
  }

  // 获取下载状态
  async getDownloadStatus(downloadId) {
    return new Promise((resolve) => {
      chrome.downloads.search({ id: downloadId }, (downloads) => {
        if (downloads && downloads.length > 0) {
          resolve(downloads[0]);
        } else {
          resolve(null);
        }
      });
    });
  }
}

// 导出处理器
window.DownloadHandler = DownloadHandler;
