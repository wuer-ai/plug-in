function convertAtoB(inputData) {
    // 获取原始内容
    const rawContent = inputData[0].output;
    
    // 提取标题（第一行）
    const lines = rawContent.split('\n').filter(line => line.trim());
    const titleLine = lines[0];
    const title = titleLine.replace('早上好，今天是', '').replace('，以下是今日AI前沿速递：', '').trim();
    const formattedTitle = `AI前沿速递 | ${title}`;
    
    // 解析内容
    const content = [];
    
    // 添加开头问候语
    content.push([{ "tag": "text", "text": "早上好，以下是今日AI前沿速递：" }]);
    
    let i = 0;
    while (i < lines.length) {
        const line = lines[i].trim();
        
        // 检查是否是条目标题（以✅开头）
        if (line.match(/^✅ \d+\./)) {
            // 添加条目标题
            content.push([{ "tag": "text", "text": line }]);
            i++;
            
            // 查找并添加链接
            if (i < lines.length && lines[i].includes('🔗 [原文链接](')) {
                const linkLine = lines[i].trim();
                const linkMatch = linkLine.match(/🔗 \[原文链接\]\((.*?)\)/);
                if (linkMatch) {
                    content.push([{
                        "tag": "a",
                        "text": "🔗 原文链接",
                        "href": linkMatch[1]
                    }]);
                }
                i++;
            }
            
            // 添加详细信息（以▪️开头的行）
            while (i < lines.length && lines[i].trim().startsWith('▪️')) {
                const detailLine = lines[i].trim();
                content.push([{ "tag": "text", "text": detailLine }]);
                i++;
            }
            
            // 在每个条目后添加空行
            content.push([{ "tag": "text", "text": "" }]);
        } else {
            i++;
        }
    }
    
    // 构建最终结果格式
    const result = {
        "msg_type": "post",
        "content": {
            "post": {
                "zh_cn": {
                    "title": formattedTitle,
                    "content": content
                }
            }
        }
    };
    
    return result;
}

// 测试数据 - 简化版本
const inputA = [
    {
        "output": "早上好，今天是2025年6月5日，以下是今日AI前沿速递：\n\n✅ 1. Mistral AI推出企业级编程助手，直接挑战GitHub Copilot \n🔗 [原文链接](https://venturebeat.com/ai/mistral-ais-new-coding-assistant-takes-direct-aim-at-github-copilot/) \n▪️ 技术亮点：支持本地部署，提供数据主权保障和模型定制化 \n▪️ 关键数据：专为企业开发者设计，支持多语言代码生成 \n▪️ 应用场景：破解企业级代码生成的安全与隐私难题 \n\n✅ 2. AI在乳腺癌筛查中实现突破：提前4-6年预测风险 \n🔗 [原文链接](https://www.news-medical.net/news/20250603/AI-spots-future-breast-cancer-risk-in-mammograms-years-before-diagnosis.aspx) \n▪️ 研究团队：挪威研究机构 \n▪️ 关键数据：商用AI工具分析常规乳腺X光片，准确识别高风险人群 \n▪️ 意义：个性化筛查和早期干预的新范式"
    }
];

// 转换并输出结果
const result = convertAtoB(inputA);
console.log(JSON.stringify(result, null, 2));

// 导出函数以便在其他地方使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = convertAtoB;
} 