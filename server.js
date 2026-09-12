console.log('Service is trying to start...');

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import YahooFinance from 'yahoo-finance2';
import fs from 'fs/promises';
import dotenv from 'dotenv';
dotenv.config();
import { LRUCache } from 'lru-cache';

const cache = new LRUCache({
    max: 1000,                 // 最多缓存 1000 
    ttl: 60000 * 30,           // 自动 30 分钟过期！
});

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

app.get('/:code.json', async (req, res) => {
    const code = req.params.code.toUpperCase();
    if (!/^[A-Z]{1,5}$/.test(code)) return next();

    if (cache.has(code)) {
        return res.json(cache.get(code));
    }

    const data = await getData(code);
    if (data) {
        cache.set(code, data);
        res.set({ 'Cache-Control': 'max-age=300', });
        return res.json(data);
    }
    return res.status(400).send('Not Found');
});

const yahooFinance = new YahooFinance();
async function getData(code) {
    try {
        const result = await yahooFinance.chart(code, {
            period1: '2000-01-01',            // 开始日期 (支持 'YYYY-MM-DD' 或 Date 对象 / 时间戳)
            // period2: '2020-01-01',         // 结束日期 (默认到最新)
            interval: '1d',                   // '1d' (日线), '1wk' (周线), '1mo' (月线)
        });

        const quotes = result.quotes.filter(item => item.close);
        const data = transformData(quotes);
        console.log(`✅ 获取到${code.toUpperCase()}数据${data.length}条`);
        return data;
    } catch (error) {
        console.error(`❌ 获取${code.toUpperCase()}数据失败:`, error);
        return false;
    }
}

function transformData(rawData) {
    return rawData.map(item => ({
        date: item.date.toISOString().slice(0, 10),
        close: Math.round(Number(item.close) * 10000) / 10000
    }));
}

// --- 启动 ---
app.listen(port, host, () => {
    console.log(`Start HTTP server @ ${host}:${port}`);
});


// --- 关闭 ---
process.on('SIGINT', () => {
    console.log('Received SIGINT. Shutting down gracefully...');
    process.exit(0);
});
