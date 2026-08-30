console.log('Service is trying to start...');

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// --- 配置 ---



// __dirname 在 ES Module 中不可用，需要手动创建
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port =  4001;
const host =  '127.0.0.1';


// 静态文件服务
// app.use(express.static(path.join(__dirname, 'public')));
const tenMin = 10 * 60 * 1000;
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: tenMin,
    etag: true,
}));



// --- 启动服务器 ---
app.listen(port, host, () => {
    console.log(`Start HTTP server @ ${host}:${port}`);
});

// --- 优雅关闭 ---
process.on('SIGINT', () => {
    console.log('Received SIGINT. Shutting down gracefully...');
    process.exit(0);
});
