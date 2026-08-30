console.log('Service is trying to start...');

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import YahooFinance from 'yahoo-finance2';
import fs from 'fs/promises';

// __dirname 在 ES Module 中不可用，需要手动创建
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port =  4001;
const host =  '127.0.0.1';


// 静态文件服务
const tenMin = 10 * 60 * 1000;
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: tenMin,
    etag: true,
}));




const yahooFinance = new YahooFinance();
async function getData(code) {
    try {
        console.log(`正在获取${code}历史数据...`);
        const result = await yahooFinance.chart(code, {
            period1: '2000-01-01',   // 开始日期 (支持 'YYYY-MM-DD' 或 Date 对象 / 时间戳)
            // period2: '2026-01-01',// 结束日期 (默认到最新)
            interval: '1wk',          // '1d' (日线), '1wk' (周线), '1mo' (月线)
        });

        const quotes = result.quotes;
        console.log(`成功获取到 ${quotes.length} 条数据，正在写入文件...`);
        const aa = transformData(quotes);
        const filePath = path.join(__dirname, 'public', `${code}.json`);
        await fs.writeFile(filePath, JSON.stringify(aa, null, 2), 'utf-8');

        console.log(`✅ 数据已成功保存到: ${filePath}`);
        return true;
    } catch (error) {
        console.error('❌ 获取或保存数据失败:', error);
        return false;
    }
}
function transformData(rawData) {
    return rawData.map(item => ({
        date: item.date.toISOString().slice(0, 10),
        close: item.close
    }));
}
getData('qqq');
getData('spy');



// --- 启动服务器 ---
app.listen(port, host, () => {
    console.log(`Start HTTP server @ ${host}:${port}`);
});

// --- 优雅关闭 ---
process.on('SIGINT', () => {
    console.log('Received SIGINT. Shutting down gracefully...');
    process.exit(0);
});
