document.addEventListener('DOMContentLoaded', () => {
  // 获取元素引用
  const inputText = document.getElementById('input-text');
  const translateBtn = document.getElementById('btn-translate');
  const clearBtn = document.getElementById('btn-clear');
  const translationResult = document.getElementById('translation-result');
  const langInfo = document.getElementById('lang-info');
  const resultArea = document.getElementById('result-area');
  
  // 绑定按钮事件
  translateBtn.addEventListener('click', handleTranslate);
  clearBtn.addEventListener('click', handleClear);
  
  // 添加快捷键支持
  inputText.addEventListener('keydown', (e) => {
    // Ctrl+Enter 快捷键翻译
    if (e.ctrlKey && e.key === 'Enter') {
      handleTranslate();
    }
  });
  
  /**
   * 处理翻译按钮点击事件
   */
  function handleTranslate() {
    const text = inputText.value.trim();
    
    if (!text) {
      showResult('请输入要翻译的文本', '', 'error');
      return;
    }
    
    // 显示加载中状态
    showLoading();
    
    // 检测语言
    const textLang = detectLanguage(text);
    let sourceLang, targetLang;
    
    if (textLang === 'mixed') {
      // 混合文本，默认中文翻译为英文
      sourceLang = 'zh-CN';
      targetLang = 'en';
    } else {
      // 纯中文或纯英文，按检测结果设置
      sourceLang = textLang === 'zh-CN' ? 'zh-CN' : 'en';
      targetLang = textLang === 'zh-CN' ? 'en' : 'zh-CN';
    }
    
    // 调用Google翻译API
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    
    fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error('翻译服务暂时不可用');
        }
        return response.json();
      })
      .then(data => {
        // 提取翻译结果
        const translatedText = data[0].map(item => item[0]).join('');
        
        // 显示翻译结果
        showResult(translatedText, sourceLang === 'zh-CN' ? '中文 → 英文' : '英文 → 中文');
      })
      .catch(error => {
        console.error('翻译出错:', error);
        showResult('翻译服务暂时不可用，请稍后重试', '', 'error');
      });
  }
  
  /**
   * 处理清空按钮点击事件
   */
  function handleClear() {
    inputText.value = '';
    translationResult.textContent = '';
    langInfo.textContent = '';
    inputText.focus();
  }
  
  /**
   * 显示翻译结果
   * @param {string} text 翻译结果文本
   * @param {string} langDirection 翻译方向
   * @param {string} type 消息类型，默认为normal，可选error
   */
  function showResult(text, langDirection, type = 'normal') {
    resultArea.classList.remove('loading');
    
    if (type === 'error') {
      translationResult.innerHTML = `<span style="color: #ffffff; background-color: #cc0000; padding: 5px; border-radius: 4px; display: block; font-weight: bold;">${text}</span>`;
      langInfo.textContent = '';
    } else {
      translationResult.style.backgroundColor = '#0d5ba1';
      translationResult.style.color = '#ffffff';
      translationResult.style.padding = '10px';
      translationResult.style.borderRadius = '4px';
      translationResult.style.fontWeight = 'bold';
      translationResult.style.border = '1px solid #0a4c8b';
      translationResult.textContent = text;
      
      langInfo.style.marginTop = '5px';
      langInfo.style.color = '#555';
      langInfo.style.fontWeight = 'bold';
      langInfo.textContent = langDirection;
    }
  }
  
  /**
   * 显示加载中状态
   */
  function showLoading() {
    resultArea.classList.add('loading');
    translationResult.textContent = '正在翻译...';
    langInfo.textContent = '';
  }
  
  /**
   * 检测文本语言
   * @param {string} text 要检测的文本
   * @returns {string} 语言代码 ('zh-CN', 'en' 或 'mixed')
   */
  function detectLanguage(text) {
    // 使用正则表达式检测中文字符
    const chineseRegex = /[\u4e00-\u9fa5]/;
    const chineseChars = text.match(chineseRegex);
    
    // 使用正则表达式检测英文字符
    const englishRegex = /[a-zA-Z]/;
    const englishChars = text.match(englishRegex);
    
    // 如果同时包含中文和英文字符，返回'mixed'
    if (chineseChars && englishChars) {
      return 'mixed';
    }
    
    // 如果包含中文字符，返回'zh-CN'
    if (chineseChars) {
      return 'zh-CN';
    }
    
    // 否则返回'en'
    return 'en';
  }
  
  // 在弹出窗口打开时，恢复焦点到输入框
  inputText.focus();
}); 