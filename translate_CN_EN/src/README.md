# 中英互译助手 - 代码结构说明

本文档介绍了中英互译助手Chrome扩展的代码结构和模块划分，便于开发者理解和扩展功能。

## 目录结构

```
src/
├── utils/            # 实用工具函数
│   ├── language.js   # 语言检测工具
│   └── safeApi.js    # 安全API调用工具
│
├── services/         # 服务模块
│   ├── translator.js # 翻译服务
│   └── storage.js    # 存储服务
│
├── ui/               # 用户界面组件
│   └── popup.js      # 翻译弹窗UI组件
│
├── contentScript/    # 内容脚本模块
│   └── index.js      # 内容脚本主文件
│
├── background/       # 后台脚本模块
│   └── index.js      # 后台脚本主文件
│
├── debug/            # 调试工具模块
│   └── index.js      # 调试工具主文件
│
└── index.js          # 主入口文件
```

## 模块说明

### 实用工具 (utils)

- **language.js**: 提供语言检测和处理相关函数
  - `detectLanguage()`: 检测文本的语言类型（中文、英文或混合）
  - `determineTranslationDirection()`: 根据检测结果确定翻译方向

- **safeApi.js**: 提供安全的API调用包装，处理扩展上下文失效问题
  - `debugLog()`: 调试日志记录
  - `safeApiCall()`: 安全API调用封装
  - `setExtensionValid()`: 设置扩展状态
  - `getExtensionValid()`: 获取扩展状态

### 服务 (services)

- **translator.js**: 翻译服务实现
  - `translateText()`: 调用Google翻译API实现文本翻译

- **storage.js**: 存储服务实现
  - `getSettings()`: 获取存储的设置
  - `saveSettings()`: 保存设置
  - `initializeSettings()`: 初始化默认设置

### 用户界面 (ui)

- **popup.js**: 翻译弹窗UI组件
  - `showTranslationPopup()`: 显示翻译结果弹窗
  - `showErrorPopup()`: 显示错误信息弹窗
  - `removeTranslationPopup()`: 移除翻译弹窗

### 内容脚本 (contentScript)

- **index.js**: 内容脚本主文件，处理页面上的选中文本和翻译弹窗
  - `handleMouseUp()`: 处理鼠标选中事件
  - `handleMouseMove()`: 处理鼠标移动事件
  - `setupMessageListener()`: 设置消息监听器

### 后台脚本 (background)

- **index.js**: 后台脚本主文件，处理扩展全局事件和翻译请求
  - `processTranslation()`: 处理翻译请求
  - `sendMessageToTab()`: 安全地发送消息到标签页
  - `checkContentScriptStatus()`: 检查内容脚本状态

### 调试工具 (debug)

- **index.js**: 调试工具主文件，提供扩展状态检查和问题诊断
  - `checkExtensionStatus()`: 检查扩展状态
  - `reInjectContentScript()`: 重新注入内容脚本
  - `diagnoseIssues()`: 诊断常见问题
  - `fixInvalidContext()`: 修复无效上下文错误

## 构建与开发

项目使用Webpack进行构建，支持模块化开发。

- 安装依赖: `npm install`
- 开发模式: `npm run dev`
- 生产构建: `npm run build`

构建后的文件会输出到`dist`目录，可以直接加载到Chrome中。 