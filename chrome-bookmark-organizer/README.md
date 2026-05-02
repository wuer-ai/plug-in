# Chrome Bookmark Organizer

基于 AI 汇总的 Chrome 收藏夹整理插件。

## Current Direction

插件不再用本地域名、关键词、路径规则猜测收藏分类。本地流程只负责：

- 读取 Chrome 收藏夹树并展开收藏清单
- 检测重复收藏
- 识别空文件夹
- 预览、应用整理方案，并支持撤销

收藏移动分组必须由远程 AI Provider 生成。没有配置 AI 时，扫描只会展示清点状态、重复收藏和空目录提示，不会生成本地移动建议。

## AI Flow

1. 在设置页启用 AI，选择 `gemini` 或 `openai-compatible`。
2. 填写模型名和 API Key。
3. OpenAI-compatible 的 API Base URL 填到 `/v1`，插件会优先请求 `/responses`，失败后回退 `/chat/completions`。
4. 扫描收藏夹时，插件把收藏标题、域名、原文件夹发送给 AI；关闭“仅发送标题与域名”后才会发送完整 URL。
5. AI 返回严格 JSON 分组：

```json
[
  {
    "folderPath": ["模型开发", "API 文档"],
    "reason": "这些收藏都是大模型 API 和开发文档",
    "confidence": 0.86,
    "bookmarkIds": ["12", "18"]
  }
]
```

6. AI 最多创建 8 个一级分类，二级分类数量不限制，每个目标路径最多 2 层。
7. 用户预览后应用，插件会直接在 Chrome 书签栏下创建分类，不再额外创建 `Bookmark Organizer` 一级目录。

## Files

- `background.js`: 扫描、AI 汇总、应用、撤销的消息路由
- `js/modules/bookmark-analysis.js`: 收藏清点、重复检测、空目录检测
- `js/modules/ai-providers.js`: Gemini/OpenAI-compatible 汇总提示词、请求和 JSON 解析
- `js/modules/bookmark-actions.js`: 应用 AI 方案并记录撤销快照
- `popup.html` + `js/popup.js`: 预览和操作入口
- `options.html` + `js/options.js`: AI Provider 设置

## How To Load

1. 打开 Chrome 的 `chrome://extensions/`
2. 开启 Developer Mode
3. 点击 “Load unpacked”
4. 选择 `chrome-bookmark-organizer` 文件夹
