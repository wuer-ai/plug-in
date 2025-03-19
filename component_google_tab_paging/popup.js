document.addEventListener('DOMContentLoaded', function() {
  // 定义Chrome支持的9种颜色选项
  const colors = [
    { name: 'grey', value: '#BDC1C6' },
    { name: 'blue', value: '#8AB4F8' },
    { name: 'red', value: '#F28B82' },
    { name: 'yellow', value: '#FDD663' },
    { name: 'green', value: '#81C995' },
    { name: 'pink', value: '#FCAD70' },
    { name: 'purple', value: '#D7AEFB' },
    { name: 'cyan', value: '#78D9EC' },
    { name: 'orange', value: '#FBBC04' }
  ];

  let selectedColor = colors[0].name;
  const colorOptionsContainer = document.getElementById('colorOptions');
  const domainsContainer = document.getElementById('domainsContainer');
  const addDomainBtn = document.getElementById('addDomainBtn');
  const groupNameInput = document.getElementById('groupName');
  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');
  const messageDiv = document.getElementById('message');
  const domainItemsContainer = document.getElementById('domainItems');
  const enableSwitch = document.getElementById('enableSwitch');
  
  // 最大域名数量限制
  const MAX_DOMAINS = 5;

  // 渲染颜色选项
  function renderColorOptions() {
    colorOptionsContainer.innerHTML = '';
    colors.forEach(color => {
      const colorOption = document.createElement('div');
      colorOption.className = 'color-option';
      colorOption.style.backgroundColor = color.value;
      colorOption.dataset.color = color.name;
      
      if (color.name === selectedColor) {
        colorOption.classList.add('selected');
      }
      
      colorOption.addEventListener('click', function() {
        document.querySelectorAll('.color-option').forEach(el => {
          el.classList.remove('selected');
        });
        this.classList.add('selected');
        selectedColor = this.dataset.color;
      });
      
      colorOptionsContainer.appendChild(colorOption);
    });
  }

  // 显示消息
  function showMessage(text, isSuccess = true) {
    messageDiv.textContent = text;
    messageDiv.className = 'message ' + (isSuccess ? 'success' : 'error');
    messageDiv.style.display = 'block';
    
    setTimeout(() => {
      messageDiv.style.display = 'none';
    }, 3000);
  }

  // 加载保存的域名配置
  function loadDomainConfigs() {
    chrome.storage.local.get('domainConfigs', function(result) {
      const configs = result.domainConfigs || [];
      renderDomainList(configs);
    });
  }

  // 添加域名输入框
  function addDomainInput(value = '') {
    // 检查是否已达到最大域名数量
    const currentInputs = domainsContainer.querySelectorAll('.domain-input-group');
    if (currentInputs.length >= MAX_DOMAINS) {
      showMessage(`最多只能添加${MAX_DOMAINS}个域名`, false);
      return;
    }
    
    const inputGroup = document.createElement('div');
    inputGroup.className = 'domain-input-group';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'domain-input';
    input.placeholder = '例如：google.com';
    input.value = value;
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-domain';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', function() {
      inputGroup.remove();
    });
    
    inputGroup.appendChild(input);
    inputGroup.appendChild(removeBtn);
    domainsContainer.appendChild(inputGroup);
  }
  
  // 获取所有域名输入值
  function getDomainInputValues() {
    const inputs = domainsContainer.querySelectorAll('.domain-input');
    const values = [];
    
    inputs.forEach(input => {
      const value = input.value.trim();
      if (value) {
        values.push(value);
      }
    });
    
    return values;
  }
  
  // 渲染域名列表
  function renderDomainList(configs) {
    domainItemsContainer.innerHTML = '';
    
    if (configs.length === 0) {
      domainItemsContainer.innerHTML = '<p>暂无保存的域名配置</p>';
      return;
    }
    
    configs.forEach((config, index) => {
      const domainItem = document.createElement('div');
      domainItem.className = 'domain-item';
      
      const colorInfo = colors.find(c => c.name === config.color) || colors[0];
      
      // 显示域名列表
      const domainsList = Array.isArray(config.domains) ? 
        config.domains.join(', ') : 
        config.domain; // 兼容旧数据格式
      
      domainItem.innerHTML = `
        <div class="domain-info" data-index="${index}" style="cursor: pointer;">
          <span class="domain-color" style="background-color: ${colorInfo.value}"></span>
          <span>${domainsList} (${config.groupName})</span>
        </div>
        <span class="domain-delete" data-index="${index}">×</span>
      `;
      
      domainItemsContainer.appendChild(domainItem);
    });
    
    // 添加删除事件监听
    document.querySelectorAll('.domain-delete').forEach(el => {
      el.addEventListener('click', function() {
        const index = parseInt(this.dataset.index);
        deleteDomainConfig(index);
      });
    });
    
    // 添加编辑事件监听
    document.querySelectorAll('.domain-info').forEach(el => {
      el.addEventListener('click', function() {
        const index = parseInt(this.dataset.index);
        editDomainConfig(index);
      });
    });
  }

  // 删除域名配置
  function deleteDomainConfig(index) {
    chrome.storage.local.get('domainConfigs', function(result) {
      const configs = result.domainConfigs || [];
      configs.splice(index, 1);
      
      chrome.storage.local.set({ domainConfigs: configs }, function() {
        loadDomainConfigs();
        showMessage('删除成功');
      });
    });
  }

  // 保存域名配置
  function saveDomainConfig() {
    const domains = getDomainInputValues();
    const groupName = groupNameInput.value.trim();
    
    if (domains.length === 0) {
      showMessage('请至少输入一个域名', false);
      return;
    }
    
    if (!groupName) {
      showMessage('请输入分组名称', false);
      return;
    }
    
    const newConfig = {
      domains: domains,
      groupName: groupName,
      color: selectedColor
    };
    
    chrome.storage.local.get('domainConfigs', function(result) {
      const configs = result.domainConfigs || [];
      
      if (editingIndex !== -1) {
        // 编辑模式
        const oldGroupName = configs[editingIndex].groupName;
        configs[editingIndex] = newConfig;
        
        // 更新现有标签组 - 需要查找所有与旧分组名称匹配的标签组
        chrome.windows.getAll({ populate: true }, function(windows) {
          windows.forEach(window => {
            chrome.tabGroups.query({ windowId: window.id }, function(groups) {
              groups.forEach(group => {
                if (group.title === oldGroupName) {
                  chrome.tabGroups.update(group.id, {
                    title: groupName,
                    color: selectedColor
                  });
                }
              });
            });
          });
        });
      } else {
        // 新建模式
        // 检查是否已存在相同分组名称的配置
        const existingIndex = configs.findIndex(config => config.groupName === groupName);
        if (existingIndex !== -1) {
          // 如果存在相同分组名称，询问用户是否合并
          if (confirm(`已存在名为"${groupName}"的分组，是否将新域名添加到该分组？`)) {
            // 合并域名列表（去重）
            const existingConfig = configs[existingIndex];
            const existingDomains = Array.isArray(existingConfig.domains) ? 
              existingConfig.domains : 
              [existingConfig.domain]; // 兼容旧数据格式
            
            // 合并并去重
            const mergedDomains = [...new Set([...existingDomains, ...domains])];
            
            // 更新配置
            configs[existingIndex] = {
              domains: mergedDomains,
              groupName: groupName,
              color: selectedColor
            };
          } else {
            // 用户选择不合并，创建新配置
            configs.push(newConfig);
          }
        } else {
          // 不存在相同名称的分组，直接添加
          configs.push(newConfig);
        }
      }
      
      // 保存配置
      chrome.storage.local.set({ domainConfigs: configs }, function() {
        loadDomainConfigs();
        showMessage('保存成功');
        resetForm();
      });
    });
  }

  // 重置表单
  function resetForm() {
    // 清空所有域名输入框
    while (domainsContainer.firstChild) {
      domainsContainer.removeChild(domainsContainer.firstChild);
    }
    // 添加一个空的域名输入框
    addDomainInput();
    groupNameInput.value = '';
    selectedColor = colors[0].name;
    editingIndex = -1;
    renderColorOptions();
  }

  // 编辑域名配置
  let editingIndex = -1;

  function editDomainConfig(index) {
    chrome.storage.local.get('domainConfigs', function(result) {
      const configs = result.domainConfigs || [];
      if (index >= 0 && index < configs.length) {
        const config = configs[index];
        
        // 清空所有域名输入框
        while (domainsContainer.firstChild) {
          domainsContainer.removeChild(domainsContainer.firstChild);
        }
        
        // 获取域名列表
        const domains = Array.isArray(config.domains) ? 
          config.domains : 
          [config.domain]; // 兼容旧数据格式
        
        // 为每个域名添加输入框
        domains.forEach(domain => {
          addDomainInput(domain);
        });
        
        groupNameInput.value = config.groupName;
        selectedColor = config.color;
        editingIndex = index;
        renderColorOptions();
        showMessage('点击保存按钮更新配置');
      }
    });
  }

  // 加载开关状态
  function loadSwitchState() {
    chrome.storage.local.get('enableAutoGroup', function(result) {
      // 如果存储中没有该值，默认为启用状态
      const enabled = result.enableAutoGroup !== undefined ? result.enableAutoGroup : true;
      enableSwitch.checked = enabled;
      
      // 根据开关状态更新界面
      updateFormState(enabled);
    });
  }
  
  // 更新表单状态（启用/禁用）
  function updateFormState(enabled) {
    const formElements = document.querySelectorAll('#colorOptions, #domainsContainer, #groupNameInput, #addDomainBtn, .buttons, .domain-list');
    
    if (enabled) {
      formElements.forEach(el => el.classList.remove('disabled-form'));
    } else {
      formElements.forEach(el => el.classList.add('disabled-form'));
    }
  }

  // 保存开关状态
  function saveSwitchState(enabled) {
    chrome.storage.local.set({ enableAutoGroup: enabled }, function() {
      showMessage(enabled ? '自动分组已启用' : '自动分组已禁用');
    });
  }

  // 初始化
  renderColorOptions();
  loadDomainConfigs();
  loadSwitchState();
  // 移除这行代码，因为HTML中已经有一个默认的域名输入框
  // addDomainInput(); // 添加初始域名输入框

  // 事件监听
  saveBtn.addEventListener('click', saveDomainConfig);
  resetBtn.addEventListener('click', resetForm);
  addDomainBtn.addEventListener('click', function() {
    addDomainInput();
  });
  
  // 开关状态变化监听
  enableSwitch.addEventListener('change', function() {
    const enabled = this.checked;
    saveSwitchState(enabled);
    updateFormState(enabled);
  });
});