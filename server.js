console.log('Service is trying to start...');

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import YahooFinance from 'yahoo-finance2';
import fs from 'fs/promises';
import cron from 'node-cron';
import dotenv from 'dotenv';
dotenv.config();

// __dirname 在 ES Module 中不可用，需要手动创建
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const host = process.env.HOST || '127.0.0.1';
const port = process.env.PORT || 3000;
const CacheControl = process.env.CacheControl * 1000;

let CodeData = null;
// 静态文件服务
app.use('/st', express.static(path.join(__dirname, 'public', 'st'), {
    maxAge: '30d',
    etag: true,
}));
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: CacheControl,
    etag: true,
}));
app.use(express.static(path.join(__dirname, 'data'), {
    maxAge: CacheControl,
    etag: true,
}));
app.get('/code', async (req, res) => {
    res.set({
        'Cache-Control': 'no-store',
    });
    res.json(CodeData);
});

const dataDir = path.join(__dirname, 'data');
await fs.mkdir(dataDir, { recursive: true });

async function getCodeList() {
    try {
        const files = await fs.readdir(dataDir);
        CodeData = files
            .filter(file => path.extname(file).toLowerCase() === '.json')
            .map(file => path.parse(file).name);
    } catch (err) {
        console.error(`读取目录${dataDir}失败:`, err);
    }
}


const yahooFinance = new YahooFinance();
async function getData(code) {
    try {
        console.log(`正在获取${code}历史数据`, new Date());
        const result = await yahooFinance.chart(code, {
            period1: '2000-01-01',   // 开始日期 (支持 'YYYY-MM-DD' 或 Date 对象 / 时间戳)
            // period2: '2026-01-01',// 结束日期 (默认到最新)
            interval: '1d',          // '1d' (日线), '1wk' (周线), '1mo' (月线)
        });

        const quotes = result.quotes.filter(item => item.close);
        // console.log(quotes)
        const data = transformData(quotes);
        const filePath = path.join(dataDir, `${code}.json`);
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');

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
async function getDatas() {
    try {
        const codeEnv = process.env.CODE || '';
        const codes = codeEnv.trim().split(/\s+/).filter(Boolean);
        const tasks = codes.map(code => getData(code));
        await Promise.allSettled(tasks);
    } finally {
        console.log('执行完毕');
        getCodeList();
    }
}


// --- 启动服务器 ---
app.listen(port, host, () => {
    console.log(`Start HTTP server @ ${host}:${port}`);
    getDatas();

});
cron.schedule('0 18 * * 1-5', () => {
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
