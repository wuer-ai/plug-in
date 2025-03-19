// 弹出界面脚本，处理用户交互和与background脚本通信

document.addEventListener('DOMContentLoaded', function() {
  // 获取DOM元素
  const formatSelect = document.getElementById('format');
  const qualityInput = document.getElementById('quality');
  const qualityValue = document.getElementById('quality-value');
  const qualityContainer = document.getElementById('quality-container');
  const captureVisibleBtn = document.getElementById('capture-visible');
  const captureFullBtn = document.getElementById('capture-full');
  const statusMessage = document.getElementById('status-message');

  // 初始化质量显示
  qualityValue.textContent = qualityInput.value + '%';

  // 监听格式选择变化
  formatSelect.addEventListener('change', function() {
    // 如果选择PNG格式，隐藏质量选项（PNG是无损的）
    if (formatSelect.value === 'png') {
      qualityContainer.style.display = 'none';
    } else {
      qualityContainer.style.display = 'block';
    }
  });

  // 监听质量滑块变化
  qualityInput.addEventListener('input', function() {
    qualityValue.textContent = qualityInput.value + '%';
  });

  // 截取可见区域按钮点击事件
  captureVisibleBtn.addEventListener('click', function() {
    captureVisibleBtn.disabled = true;
    captureFullBtn.disabled = true;
    statusMessage.textContent = '正在截取可见区域...';

    // 获取当前设置
    const format = formatSelect.value;
    const quality = parseInt(qualityInput.value);

    // 向background脚本发送消息，请求截取可见区域
    chrome.runtime.sendMessage(
      { action: 'captureVisibleTab', format: format, quality: quality },
      function(response) {
        if (response && response.success) {
          // 截图成功，下载图片
          downloadScreenshot(response.dataUrl, format);
        } else {
          // 截图失败，显示错误信息
          statusMessage.textContent = '截图失败: ' + (response ? response.error : '未知错误');
        }
        
        captureVisibleBtn.disabled = false;
        captureFullBtn.disabled = false;
      }
    );
  });

  // 截取整个页面按钮点击事件
  captureFullBtn.addEventListener('click', function() {
    captureVisibleBtn.disabled = true;
    captureFullBtn.disabled = true;
    statusMessage.textContent = '正在截取整个页面，请稍候...';

    // 获取当前设置
    const format = formatSelect.value;
    const quality = parseInt(qualityInput.value);

    // 向background脚本发送消息，请求截取整个页面
    chrome.runtime.sendMessage(
      { action: 'captureFullPage', format: format, quality: quality },
      function(response) {
        if (response && response.success) {
          // 截图成功，下载图片
          downloadScreenshot(response.dataUrl, format);
        } else {
          // 截图失败，显示错误信息
          statusMessage.textContent = '截图失败: ' + (response ? response.error : '未知错误');
        }
        
        captureVisibleBtn.disabled = false;
        captureFullBtn.disabled = false;
      }
    );
  });

  // 下载截图
  function downloadScreenshot(dataUrl, format) {
    // 生成文件名
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const filename = `screenshot_${timestamp}.${format}`;

    // 向background脚本发送消息，请求下载图片
    chrome.runtime.sendMessage(
      { action: 'downloadImage', dataUrl: dataUrl, filename: filename },
      function(response) {
        if (response && response.success) {
          statusMessage.textContent = '截图已保存';
        } else {
          statusMessage.textContent = '保存失败: ' + (response ? response.error : '未知错误');
        }
      }
    );
  }

  // 加载存储的设置
  chrome.storage.local.get(['format', 'quality'], function(result) {
    if (result.format) {
      formatSelect.value = result.format;
      // 触发change事件以更新UI
      formatSelect.dispatchEvent(new Event('change'));
    }
    
    if (result.quality) {
      qualityInput.value = result.quality;
      qualityValue.textContent = result.quality + '%';
    }
  });

  // 保存设置
  function saveSettings() {
    chrome.storage.local.set({
      format: formatSelect.value,
      quality: qualityInput.value
    });
  }

  // 当设置改变时保存
  formatSelect.addEventListener('change', saveSettings);
  qualityInput.addEventListener('change', saveSettings);
});
