console.log('Service is trying to start...');

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import YahooFinance from 'yahoo-finance2';
import fs from 'fs/promises';
import cron from 'node-cron';

// __dirname 在 ES Module 中不可用，需要手动创建
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 4001;
const host = '127.0.0.1';


// 静态文件服务
const tenMin = 10 * 60 * 1000;
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: tenMin,
    etag: true,
}));
app.get('/code', async (req, res) => {
    try {
        const publicDir = path.join(__dirname, 'public');
        const files = await fs.readdir(publicDir);
        const jsonFiles = files
            .filter(file => path.extname(file).toLowerCase() === '.json')
            .map(file => path.parse(file).name);
        res.json(jsonFiles);
    } catch (err) {
        console.error('读取 public 目录失败:', err);
        res.status(500).json({ error: '读取文件失败或 public 目录不存在' });
    }
});



const yahooFinance = new YahooFinance();
async function getData(code) {
    try {
        console.log(`正在获取${code}历史数据`, new Date());
        const result = await yahooFinance.chart(code, {
            period1: '2000-01-07',   // 开始日期 (支持 'YYYY-MM-DD' 或 Date 对象 / 时间戳)
            // period2: '2026-01-01',// 结束日期 (默认到最新)
            interval: '1d',          // '1d' (日线), '1wk' (周线), '1mo' (月线)
        });

        const quotes = result.quotes.filter(item => item.close);
        // console.log(quotes)
        // console.log(`成功获取到 ${quotes.length} 条数据，正在写入文件...`);
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
        close: Math.round(Number(item.close) * 10000) / 10000
    }));
}
function getDatas() {
    getData('qqq');
    getData('spy');
    getData('tqqq');
}



// --- 启动服务器 ---
app.listen(port, host, () => {
    console.log(`Start HTTP server @ ${host}:${port}`);
    getDatas();

});
cron.schedule('0 18 * * *', () => {
    console.log('[cron] 美东时间 18:00，开始执行定时任务...');
    getDatas();
}, {
    timezone: 'America/New_York',
});
// --- 优雅关闭 ---
process.on('SIGINT', () => {
    console.log('Received SIGINT. Shutting down gracefully...');
    process.exit(0);
});
