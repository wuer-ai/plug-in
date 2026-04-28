function convertAtoB(inputData) {
    // 获取原始内容
    const rawContent = inputData[0].output;
    
    // 提取标题（第一行）
    const lines = rawContent.split('\n');
    const titleLine = lines[0];
    const title = titleLine.replace('早上好，今天是', '').replace('，以下是今日AI前沿速递：', '').trim();
    const formattedTitle = `AI前沿速递 | ${title}`;
    
    // 解析内容
    const content = [];
    
    // 添加开头问候语
    content.push([{ "tag": "text", "text": "早上好，以下是今日AI前沿速递：" }]);
    
    // 使用正则表达式匹配每个条目
    const itemRegex = /✅ (\d+)\. ([^\n]+)\s*\n🔗 \[原文链接\]\(([^)]+)\)((?:\s*\n▪️[^\n]+)*)/g;
    let match;
    
    while ((match = itemRegex.exec(rawContent)) !== null) {
        const [, itemNum, title, link, details] = match;
        
        // 添加条目标题
        content.push([{ "tag": "text", "text": `✅ ${itemNum}. ${title.trim()}` }]);
        
        // 添加链接
        content.push([{
            "tag": "a",
            "text": "🔗 原文链接",
            "href": link
        }]);
        
        // 处理详细信息
        if (details) {
            const detailLines = details.split('\n').filter(line => line.trim().startsWith('▪️'));
            detailLines.forEach(line => {
                const cleanLine = line.trim();
                if (cleanLine) {
                    content.push([{ "tag": "text", "text": cleanLine }]);
                }
            });
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

// 示例用法
const inputA = [
    {
        "output": "早上好，今天是2025年6月5日，以下是今日AI前沿速递：\n\n✅ 1. Mistral AI推出企业级编程助手，直接挑战GitHub Copilot \n🔗 [原文链接](https://venturebeat.com/ai/mistral-ais-new-coding-assistant-takes-direct-aim-at-github-copilot/) \n▪️ 技术亮点：支持本地部署，提供数据主权保障和模型定制化 \n▪️ 关键数据：专为企业开发者设计，支持多语言代码生成 \n▪️ 应用场景：破解企业级代码生成的安全与隐私难题 \n\n✅ 2. AI在乳腺癌筛查中实现突破：提前4-6年预测风险 \n🔗 [原文链接](https://www.news-medical.net/news/20250603/AI-spots-future-breast-cancer-risk-in-mammograms-years-before-diagnosis.aspx) \n▪️ 研究团队：挪威研究机构 \n▪️ 关键数据：商用AI工具分析常规乳腺X光片，准确识别高风险人群 \n▪️ 意义：个性化筛查和早期干预的新范式 \n\n✅ 3. 摩根斯坦利AI工具年省28万开发者小时 \n🔗 [原文链接](https://developers.slashdot.org/story/25/06/04/1233253/morgan-stanley-says-its-ai-tool-processed-9-million-lines-of-legacy-code-this-year-and-saved-280000-developer-hours) \n▪️ 技术名称：DevGen.AI \n▪️ 核心改进：将老旧编程语言翻译为自然语言 \n▪️ 量化指标：处理900万行遗留代码，效率提升300% \n\n✅ 4. 谷歌NotebookLM新增公共笔记本共享功能 \n🔗 [原文链接](https://www.theverge.com/news/679332/washington-post-opinion-pieces-ai-tool-ember) \n▪️ 创新点：支持AI生成音频摘要的交互式共享 \n▪️ 应用场景：教育协作与研究知识管理 \n\n✅ 5. 洛克希德·马丁创建\"AI格斗俱乐部\"测试军事算法 \n🔗 [原文链接](https://spacenews.com/lockheed-martin-launches-ai-fight-club-to-test-algorithms-for-warfare/) \n▪️ 技术亮点：虚拟战场环境测试AI军事应用 \n▪️ 参与方：多家防务公司算法对抗测试 \n\n✅ 6. 华盛顿邮报将用AI工具Ember辅助专栏创作 \n🔗 [原文链接](https://www.theverge.com/news/679332/washington-post-opinion-pieces-ai-tool-ember) \n▪️ 创新点：非专业作者可通过AI指导完成观点文章 \n▪️ 争议点：新闻业与AI生成内容的边界探索 \n\n✅ 7. 台湾医院部署Nurabot护理机器人缓解人力短缺 \n🔗 [原文链接](https://www.foxnews.com/tech/ai-robots-help-nurses-beat-burnout-transform-hospital-care) \n▪️ 关键数据：执行送药等30%常规护理任务 \n▪️ 应用前景：全球护理缺口达450万人的解决方案 \n\n✅ 8. 好莱坞秘密使用生成式AI工具制作内容 \n🔗 [原文链接](https://entertainment.slashdot.org/story/25/06/04/1519210/hollywood-already-uses-generative-ai-and-is-hiding-it) \n▪️ 行业动态：近100家AI工作室服务主流影业 \n▪️ 技术应用：剧本生成、视觉特效等全流程渗透 \n\n✅ 9. 生成式AI加剧印巴冲突中的虚假信息传播 \n🔗 [原文链接](https://www.thenewsminute.com/news/deepfakes-voice-clones-and-ai-images-amplified-disinformation-on-india-pak-conflict) \n▪️ 技术风险：深度伪造使虚假信息可信度提升200% \n▪️ 应对措施：新型数字内容溯源技术开发中 \n\n✅ 10. 代码生成初创公司Cursor估值达100亿美元 \n🔗 [原文链接](https://developers.slashdot.org/story/25/06/04/0820246/ai-startups-revolutionize-coding-industry-leading-to-sky-high-valuations) \n▪️ 行业趋势：AI编程工具融资额年增500% \n▪️ 技术瓶颈：负毛利率下的商业化挑战 \n\n（注：根据要求已排除融资、会议及非技术进展内容，精选10条最具技术突破性的AI动态）"
    }
];

// 转换并输出结果
const result = convertAtoB(inputA);
console.log(JSON.stringify(result, null, 2));

// 导出函数以便在其他地方使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = convertAtoB;
} 