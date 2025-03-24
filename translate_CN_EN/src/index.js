/**
 * 中英互译助手 - 主入口文件
 * 
 * 此文件作为整个扩展的入口点，导入并导出所有相关模块
 */

// 导入实用工具
import * as safeApi from './utils/safeApi.js';
import * as language from './utils/language.js';

// 导入服务
import * as translator from './services/translator.js';
import * as storage from './services/storage.js';

// 导入UI组件
import * as popup from './ui/popup.js';

// 导入内容脚本
import * as contentScript from './contentScript/index.js';

// 导入后台脚本
import * as background from './background/index.js';

// 导入调试工具
import * as debug from './debug/index.js';

// 导出所有模块
export {
  safeApi,
  language,
  translator,
  storage,
  popup,
  contentScript,
  background,
  debug
}; 