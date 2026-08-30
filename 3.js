import YahooFinance from 'yahoo-finance2';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const yahooFinance = new YahooFinance();

async function saveQQQData() {
    try {
        console.log('正在获取 QQQ 历史数据...');

        // 使用官方推荐的 chart() 方法
        const result = await yahooFinance.chart('QQQ', {
            period1: '2026-07-01',   // 开始日期 (支持 'YYYY-MM-DD' 或 Date 对象 / 时间戳)
            // period2: '2026-01-01',// 结束日期 (默认到最新)
            interval: '1wk',          // '1d' (日线), '1wk' (周线), '1mo' (月线)
        });

        // 历史行情数据存放在 quotes 数组中
        const quotes = result.quotes;
        // console.log(quotes)
        console.log(`成功获取到 ${quotes.length} 条数据，正在写入文件...`);

        const aa = transformData(quotes);

        const filePath = path.join(__dirname,'public', 'qqq.json');
        await fs.writeFile(filePath, JSON.stringify(aa, null, 2), 'utf-8');

        console.log(`✅ 数据已成功保存到: ${filePath}`);
    } catch (error) {
        console.error('❌ 获取或保存数据失败:', error);
    }
}
function transformData(rawData) {
    return rawData.map(item => ({
      date: item.date.toISOString().slice(0, 10),
      close: item.close
    }));
  }
saveQQQData();
