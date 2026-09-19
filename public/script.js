// ─────────────────────────────────────────────
// 1. DOM 缓存与全局状态管理
// ─────────────────────────────────────────────
const DOM = {
    csh: document.getElementById('csh'),
    statusEl: document.getElementById('statusEl'),
    statusText: document.getElementById('statusText'),
    datePickerBtn: document.getElementById('datePickerBtn'),
    pickerPanel: document.getElementById('pickerPanel'),
    pickerBreadcrumb: document.getElementById('pickerBreadcrumb'),
    pickerGrid: document.getElementById('pickerGrid'),
    freqSelect: document.getElementById('freqSelect'),
    amountInput: document.getElementById('amountInput'),
    dividendInput: document.getElementById('dividendInput'),
    emptyState: document.getElementById('emptyState'),
    chartDom: document.getElementById('chart'),
    chartHead: document.getElementById('chart-panel-head'),
    chartPanel: document.getElementById('chart-panel'),
    chartTitle: document.getElementById('chartTitle'),
    codeListBox: document.getElementById('CodeListBox'),
    summaryEl: document.getElementById('summaryEl'),
    okBtn: document.getElementById('okBtn'),
    swBtn: document.getElementById('swBtn'),
    fsBtn: document.getElementById('fsBtn'),
    shBtn: document.getElementById('shBtn'),
};

let priceData = [];
let dateIndex = new Map();
let dateTree = {};
let selectedDate = null;
let chartInstance = null;
let activeCode = '';
let currentAbortController = null;
let statusA = true;
let STORAGE_KEY = 'history_code';
let hst = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
let StartDate = null;

// 格式化工具单例
const fmtMoney = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const fmtMoney2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (x) => (x * 100).toFixed(2) + '%';

// 防抖工具函数
function debounce(fn, delay = 200) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

function addHistory(text) {
    if (!text) return;
    const existingIndex = hst.indexOf(text);
    if (existingIndex !== -1) hst.splice(existingIndex, 1);
    hst.push(text);
    if (hst.length > 5) hst = hst.slice(-5);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hst));
}

// ─────────────────────────────────────────────
// 2. 数据请求与解析（含 AbortController 防竞态）
// ─────────────────────────────────────────────
async function fetchStockData(dataName) {
    DOM.csh.blur();
    if (!dataName) return;
    if (currentAbortController) {
        currentAbortController.abort();
    }
    currentAbortController = new AbortController();

    DOM.emptyState.style.display = 'block';
    DOM.emptyState.innerHTML = '<img src="loading.gif" alt="加载中...">';
    DOM.chartDom.style.display = 'none';

    try {
        const res = await fetch(`${dataName.toLowerCase()}.json`, { signal: currentAbortController.signal });
        if (!res.ok) throw new Error(`HTTP 错误: ${res.status}`);
        const json = await res.json();

        parseJson(json);
        if (priceData.length === 0) throw new Error('数据源中无可用的价格记录');

        buildDateTree();

        DOM.statusEl.classList.remove('err');
        DOM.statusText.textContent = `数据更新至 · ${priceData.at(-1).date}`;

        selectedDate = dateIndex.has(StartDate) ? StartDate : priceData[0].date;
        DOM.datePickerBtn.textContent = selectedDate;

        initChart();
        recompute();

        const els = DOM.codeListBox.querySelectorAll('.code');
        const hasMatch = Array.from(els).some(
            el => el.textContent.trim().toLowerCase() === dataName.toLowerCase()
        );
        if (!hasMatch) {
            const cachedEls = DOM.codeListBox.querySelectorAll('[data-cache="true"]');
            if (cachedEls.length > 4) cachedEls[0].remove();
            const span = createElementA(dataName);
            span.dataset.cache = 'true';
            span.classList.add('code-active');
            DOM.codeListBox.appendChild(span);
            addHistory(dataName);
        }
    } catch (err) {
        if (err.name === 'AbortError') return;
        DOM.statusEl.classList.add('err');
        DOM.statusText.textContent = '数据加载失败';
        DOM.emptyState.style.display = 'block';
        DOM.emptyState.innerHTML = `<b>无法加载 ${dataName.toUpperCase()}</b><br>原因：${err.message}`;
    }
}

function parseJson(json) {
    if (!Array.isArray(json)) {
        priceData = [];
        dateIndex.clear();
        return;
    }

    const rows = [];
    for (let i = 0; i < json.length; i++) {
        const item = json[i];
        if (!item || !item.date) continue;
        const close = parseFloat(item.close);
        if (isNaN(close)) continue;

        const parts = String(item.date).split('-');
        if (parts.length !== 3) continue;

        rows.push({
            date: `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`,
            close: close,
            y: +parts[0],
            m: +parts[1],
            d: +parts[2]
        });
    }

    // 按时间升序
    rows.sort((a, b) => (a.date < b.date ? -1 : 1));
    priceData = rows;

    dateIndex.clear();
    for (let i = 0; i < rows.length; i++) {
        dateIndex.set(rows[i].date, i);
    }
}

function buildDateTree() {
    dateTree = {};
    for (let i = 0; i < priceData.length; i++) {
        const r = priceData[i];
        const yKey = String(r.y);
        const mKey = String(r.m).padStart(2, '0');

        if (!dateTree[yKey]) dateTree[yKey] = {};
        if (!dateTree[yKey][mKey]) dateTree[yKey][mKey] = [];
        dateTree[yKey][mKey].push({ day: r.d, date: r.date });
    }
}

// ─────────────────────────────────────────────
// 3. 日期选择器
// ─────────────────────────────────────────────
let pickerLevel = 'year';
let pickerYear = null;
let pickerMonth = null;

DOM.datePickerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    DOM.pickerPanel.classList.contains('hidden') ? openPicker() : closePicker();
});

document.addEventListener('click', (e) => {
    if (!e.composedPath().includes(DOM.pickerPanel) && !e.composedPath().includes(DOM.datePickerBtn)) {
        closePicker();
    }
});

function openPicker() {
    pickerLevel = 'year';
    pickerYear = null;
    pickerMonth = null;
    DOM.pickerPanel.classList.remove('hidden');
    renderPicker();
}

function closePicker() {
    DOM.pickerPanel.classList.add('hidden');
}

function renderPicker() {
    let bc = `<span class="crumb ${pickerLevel === 'year' ? 'current' : ''}" data-level="year">年份</span>`;
    if (pickerYear) {
        bc += `<span class="sep">/</span><span class="crumb ${pickerLevel === 'month' ? 'current' : ''}" data-level="month">${pickerYear}</span>`;
    }
    if (pickerMonth) {
        bc += `<span class="sep">/</span><span class="crumb current" data-level="day">${pickerMonth}</span>`;
    }
    DOM.pickerBreadcrumb.innerHTML = bc;

    DOM.pickerBreadcrumb.querySelectorAll('.crumb').forEach(el => {
        el.addEventListener('click', () => {
            const lvl = el.dataset.level;
            if (lvl === 'year') { pickerLevel = 'year'; pickerYear = null; pickerMonth = null; }
            else if (lvl === 'month') { pickerLevel = 'month'; pickerMonth = null; }
            renderPicker();
        });
    });

    DOM.pickerGrid.innerHTML = '';
    const fragment = document.createDocumentFragment();

    if (pickerLevel === 'year') {
        Object.keys(dateTree).sort().forEach(y => {
            const btn = document.createElement('button');
            btn.textContent = y;
            if (y === pickerYear) btn.classList.add('active');
            btn.onclick = () => { pickerYear = y; pickerLevel = 'month'; renderPicker(); };
            fragment.appendChild(btn);
        });
    } else if (pickerLevel === 'month') {
        Object.keys(dateTree[pickerYear]).sort().forEach(m => {
            const btn = document.createElement('button');
            btn.textContent = `${m}月`;
            if (m === pickerMonth) btn.classList.add('active');
            btn.onclick = () => { pickerMonth = m; pickerLevel = 'day'; renderPicker(); };
            fragment.appendChild(btn);
        });
    } else if (pickerLevel === 'day') {
        const days = dateTree[pickerYear][pickerMonth].slice().sort((a, b) => a.day - b.day);
        days.forEach(d => {
            const btn = document.createElement('button');
            btn.textContent = String(d.day).padStart(2, '0');
            if (d.date === selectedDate) btn.classList.add('active');
            btn.onclick = () => {
                selectedDate = d.date;
                DOM.datePickerBtn.textContent = selectedDate;
                StartDate = selectedDate;
                closePicker();
                recompute();
            };
            fragment.appendChild(btn);
        });
    }
    DOM.pickerGrid.appendChild(fragment);
}

// ─────────────────────────────────────────────
// 4. 定投周期判断与 XIRR 年化算法
// ─────────────────────────────────────────────

function getWeekKey(dateStr) {
    const d = new Date(dateStr + 'T00:00:00Z');
    const day = d.getUTCDay();
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setUTCDate(diff));
    return monday.toISOString().slice(0, 10);
}

function calculateXIRR(cashFlows, guess = 0.1) {
    if (!cashFlows || cashFlows.length < 2) return null;
    const d0 = new Date(cashFlows[0].date + 'T00:00:00Z').getTime();
    const yearMs = 1000 * 60 * 60 * 24 * 365.25;

    let r = guess;
    const maxIter = 60;
    const tol = 1e-6;

    for (let i = 0; i < maxIter; i++) {
        let f = 0;
        let df = 0;
        for (let j = 0; j < cashFlows.length; j++) {
            const dt = (new Date(cashFlows[j].date + 'T00:00:00Z').getTime() - d0) / yearMs;
            const denom = Math.pow(1 + r, dt);
            if (!isFinite(denom) || denom === 0) continue;
            f += cashFlows[j].amount / denom;
            df += -dt * cashFlows[j].amount / (denom * (1 + r));
        }
        if (Math.abs(f) < tol) return r;
        if (Math.abs(df) < 1e-12) break;
        const newR = r - f / df;
        if (isNaN(newR) || !isFinite(newR) || newR <= -0.999) {
            r = r > 0 ? r / 2 : 0.05;
            break;
        }
        r = newR;
    }
    return isFinite(r) && r > -0.999 ? r : null;
}

// ─────────────────────────────────────────────
// 5. 回测计算与 UI 同步
// ─────────────────────────────────────────────

function recompute() {
    if (!selectedDate || priceData.length === 0) return;
    const rawAmount = DOM.amountInput.value.trim();
    const amount = parseFloat(rawAmount);

    const startIdx = dateIndex.get(selectedDate);
    if (startIdx === undefined) return;

    if (statusA) {
        computeStockPrice(startIdx);
        DOM.chartTitle.innerHTML = `${activeCode} 股价曲线`;
        return;
    }
    if (rawAmount === '' || isNaN(amount) || amount <= 0) {
        renderEmpty('请输入不小于 0 的有效金额');
        return;
    }
    const freq = DOM.freqSelect ? DOM.freqSelect.value : 'weekly';
    const divYield = parseFloat(DOM.dividendInput.value) || 0;
    DOM.chartTitle.innerHTML = `${activeCode} 定投收益曲线 (${getFreqName(freq)} / 分红率 ${divYield}%)`;
    computeDCA(startIdx, amount, freq, divYield);
}

function getFreqName(freq) {
    if (freq === 'daily') return '日定投';
    if (freq === 'weekly') return '周定投';
    return '月定投';
}

function updateMetricUI(metrics) {
    if (!DOM.summaryEl || !Array.isArray(metrics)) return;
    DOM.summaryEl.style.opacity = 1;
    DOM.chartHead.style.opacity = 1;
    DOM.summaryEl.innerHTML = metrics.map(m => `
        <div class="stat">
            <div class="k">${m.label}</div>
            <div class="v ${m.cls || 'neutral'}">${m.value}</div>
        </div>
    `).join('');
}

function computeStockPrice(startIdx) {
    const series = priceData.slice(startIdx);
    const first = series[0];
    const last = series[series.length - 1];
    const diff = last.close - first.close;

    let peak = -Infinity;
    let maxDd = 0;
    for (let i = 0; i < series.length; i++) {
        if (series[i].close > peak) peak = series[i].close;
        const dd = (peak - series[i].close) / peak;
        if (dd > maxDd) maxDd = dd;
    }

    const years = (new Date(last.date).getTime() - new Date(first.date).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    const cagr = years > 0.1 ? Math.pow(last.close / first.close, 1 / years) - 1 : diff / first.close;

    const cls = diff > 0 ? 'pos' : (diff < 0 ? 'neg' : 'neutral');
    const cagrCls = cagr > 0 ? 'pos' : (cagr < 0 ? 'neg' : 'neutral');

    updateMetricUI([
        { label: '起始价格', value: fmtMoney2.format(first.close) },
        { label: '最新价格', value: fmtMoney2.format(last.close), cls },
        { label: '涨跌额', value: fmtMoney2.format(diff), cls },
        { label: '涨跌幅', value: fmtPct(diff / first.close), cls },
        { label: '年化收益', value: fmtPct(cagr), cls: cagrCls },
        { label: '最高价格', value: fmtMoney2.format(peak) },
        { label: '交易天数', value: series.length },
        { label: '最大回撤', value: '-' + fmtPct(maxDd), cls: 'neg' }
    ]);

    updateStockChart(series);
}

function computeDCA(startIdx, amount, freq, dividendYield) {
    let shares = 0;
    let invested = 0;
    let investCount = 0;
    const series = [];
    const cashFlows = [];

    const dailyDivRate = dividendYield > 0 ? Math.pow(1 + dividendYield / 100, 1 / 252) - 1 : 0;

    let lastWeekKey = null;
    let lastMonthKey = null;
    let peakValue = 0;
    let maxDrawdown = 0;

    for (let i = startIdx; i < priceData.length; i++) {
        const row = priceData[i];

        // 1. 分红复权：按交易日复利追加份额
        if (shares > 0 && dailyDivRate > 0) {
            shares *= (1 + dailyDivRate);
        }

        // 2. 周期判断
        let shouldInvest = false;
        if (freq === 'daily') {
            shouldInvest = true;
        } else if (freq === 'weekly') {
            const currentWeekKey = getWeekKey(row.date);
            if (currentWeekKey !== lastWeekKey) {
                shouldInvest = true;
                lastWeekKey = currentWeekKey;
            }
        } else if (freq === 'monthly') {
            const currentMonthKey = `${row.y}-${row.m}`;
            if (currentMonthKey !== lastMonthKey) {
                shouldInvest = true;
                lastMonthKey = currentMonthKey;
            }
        }

        if (shouldInvest) {
            shares += amount / row.close;
            invested += amount;
            investCount++;
            cashFlows.push({ date: row.date, amount: -amount });
        }

        const currentValue = shares * row.close;

        if (currentValue > peakValue) peakValue = currentValue;
        const currentDd = peakValue > 0 ? (peakValue - currentValue) / peakValue : 0;
        if (currentDd > maxDrawdown) maxDrawdown = currentDd;

        series.push({
            date: row.date,
            close: row.close,
            invested: invested,
            value: currentValue,
            ret: invested > 0 ? (currentValue - invested) / invested : 0,
            shares: shares
        });
    }

    const last = series[series.length - 1];

    if (cashFlows.length > 0 && last.value > 0) {
        cashFlows.push({ date: last.date, amount: last.value });
    }
    const xirr = calculateXIRR(cashFlows);
    const avgPrice = shares > 0 ? invested / shares : 0;

    const diff = last.value - last.invested;
    const retCls = last.ret > 0 ? 'pos' : (last.ret < 0 ? 'neg' : 'neutral');
    const xirrCls = xirr > 0 ? 'pos' : (xirr < 0 ? 'neg' : 'neutral');

    updateMetricUI([
        { label: '定投次数', value: investCount },
        { label: '累计投入', value: fmtMoney.format(last.invested) },
        { label: '当前市值', value: fmtMoney.format(last.value), cls: retCls },
        { label: '浮盈', value: fmtMoney.format(diff), cls: retCls },
        { label: '总收益率', value: fmtPct(last.ret), cls: retCls },
        { label: '持仓均价', value: avgPrice > 0 ? fmtMoney2.format(avgPrice) : '—' },
        { label: '持仓数量', value: fmtMoney2.format(last.shares) },
        { label: '最大回撤', value: '-' + fmtPct(maxDrawdown), cls: 'neg' }
    ]);

    updateChart(series);
}

// ─────────────────────────────────────────────
// 6. ECharts 实例管理与渲染
// ─────────────────────────────────────────────
function initChart() {
    DOM.chartDom.style.display = 'block';
    if (!chartInstance) {
        chartInstance = echarts.init(DOM.chartDom, null, { renderer: 'canvas' });
        window.addEventListener('resize', () => chartInstance && chartInstance.resize());
    }
}

const commonChartOptions = {
    backgroundColor: 'transparent',
    textStyle: { fontFamily: "'IBM Plex Mono', monospace" },
    grid: { left: 45, right: 3, top: 20, bottom: 64 },
    xAxis: {
        type: 'category',
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#24272E' } },
        axisTick: { show: false },
        axisLabel: { color: '#565B64', fontSize: 10 },
        splitLine: { show: false }
    },
    yAxis: {
        type: 'value',
        scale: true,
        splitLine: { lineStyle: { color: '#ddd' } },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#565B64', fontSize: 10 }
    }
};

function updateStockChart(series) {
    DOM.emptyState.style.display = 'none';
    DOM.chartDom.style.display = 'block';

    const dates = [];
    const closePrices = [];
    for (let i = 0; i < series.length; i++) {
        dates.push(series[i].date);
        closePrices.push(series[i].close);
    }
    const basePrice = series[0].close;

    const option = {
        ...commonChartOptions,
        xAxis: { ...commonChartOptions.xAxis, data: dates },
        yAxis: {
            ...commonChartOptions.yAxis,
            axisLabel: {
                ...commonChartOptions.yAxis.axisLabel,
                formatter: (v) => v.toFixed(0)
            }
        },
        dataZoom: [
            { type: 'inside', start: 0, end: 100 },
            {
                type: 'slider', start: 0, end: 100, height: 18, bottom: 12,
                borderColor: '#24272E', backgroundColor: '#fff',
                fillerColor: 'rgba(58, 134, 255, 0.2)',
                handleStyle: { color: '#3A86FF', borderColor: '#3A86FF' },
                textStyle: { color: '#565B64', fontSize: 9 }
            }
        ],
        series: [{
            name: '收盘价',
            type: 'line',
            data: closePrices,
            symbol: 'none',
            lineStyle: { color: '#3A86FF', width: 1.6 },
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(58, 134, 255, 0.28)' },
                    { offset: 1, color: 'rgba(58, 134, 255, 0.02)' }
                ])
            }
        }],
        tooltip: {
            trigger: 'axis',
            backgroundColor: '#fff',
            borderColor: '#bbb',
            borderWidth: 1,
            padding: 12,
            textStyle: { color: '#222', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 },
            formatter: (params) => {
                const s = series[params[0].dataIndex];
                const green = 'var(--green, #22c55e)';
                const red = 'var(--red, #ef4444)';
                const curIdx = dateIndex.get(s.date);
                const prevClose = curIdx > 0 ? priceData[curIdx - 1].close : null;
                const dailyRet = prevClose ? (s.close - prevClose) / prevClose : 0;
                const totalRet = (s.close - basePrice) / basePrice;

                return `
              <div class="fl-date">${s.date}</div>
              <div class="fl"><span>收盘价</span><b>${fmtMoney2.format(s.close)}</b></div>
              <div class="fl"><span>日涨幅</span><b style="color:${dailyRet >= 0 ? green : red};">${prevClose ? fmtPct(dailyRet) : '—'}</b></div>
              <div class="fl"><span>总涨幅</span><b style="color:${totalRet >= 0 ? green : red};">${fmtPct(totalRet)}</b></div>
            `;
            }
        }
    };

    chartInstance.setOption(option, true);
}

function updateChart(series) {
    DOM.emptyState.style.display = 'none';
    DOM.chartDom.style.display = 'block';

    const dates = [];
    const retData = [];
    for (let i = 0; i < series.length; i++) {
        dates.push(series[i].date);
        retData.push(+(series[i].ret * 100).toFixed(3));
    }

    const option = {
        ...commonChartOptions,
        xAxis: { ...commonChartOptions.xAxis, data: dates },
        yAxis: {
            ...commonChartOptions.yAxis,
            axisLabel: {
                ...commonChartOptions.yAxis.axisLabel,
                formatter: (v) => v + '%'
            }
        },
        dataZoom: [
            { type: 'inside', start: 0, end: 100 },
            {
                type: 'slider', start: 0, end: 100, height: 18, bottom: 12,
                borderColor: '#24272E', backgroundColor: '#fff',
                fillerColor: 'rgba(255,159,28,0.3)',
                handleStyle: { color: '#FF9F1C', borderColor: '#FF9F1C' },
                textStyle: { color: '#565B64', fontSize: 9 }
            }
        ],
        series: [{
            name: '累计收益率',
            type: 'line',
            data: retData,
            symbol: 'none',
            lineStyle: { color: '#FF9F1C', width: 1.6 },
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(255,159,28,0.28)' },
                    { offset: 1, color: 'rgba(255,159,28,0.02)' }
                ])
            },
            markLine: {
                silent: true,
                symbol: 'none',
                lineStyle: { color: '#ccc', type: 'dashed', width: 1 },
                label: { show: false },
                data: [{ yAxis: 0 }]
            }
        }],
        tooltip: {
            trigger: 'axis',
            backgroundColor: '#fff',
            borderColor: '#bbb',
            borderWidth: 1,
            padding: 12,
            textStyle: { color: '#222', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 },
            formatter: (params) => {
                const s = series[params[0].dataIndex];
                const green = 'var(--green, #22c55e)';
                const red = 'var(--red, #ef4444)';
                const curIdx = dateIndex.get(s.date);
                const prevClose = curIdx > 0 ? priceData[curIdx - 1].close : null;
                const dailyRet = prevClose ? (s.close - prevClose) / prevClose : 0;
                const priceRatio = s.close / series[0].close;

                return `
              <div class="fl-date">${s.date}</div>
              <div class="fl"><span>收盘价</span><b>${fmtMoney2.format(s.close)}</b></div>
              <div class="fl"><span>日涨幅</span><b style="color:${dailyRet >= 0 ? green : red};">${prevClose ? fmtPct(dailyRet) : '—'}</b></div>
              <div class="fl"><span>总涨幅</span><b style="color:${priceRatio >= 1 ? green : red};">${fmtPct(priceRatio - 1)}</b></div>
              <div class="fl"><span>累计投入</span><b>${fmtMoney.format(s.invested)}</b></div>
              <div class="fl"><span>当前市值</span><b>${fmtMoney.format(s.value)}</b></div>
              <div class="fl"><span>总收益率</span><b style="color:${s.ret >= 0 ? green : red};">${fmtPct(s.ret)}</b></div>
              <div class="fl"><span>浮盈金额</span><b style="color:${s.ret >= 0 ? green : red};">${fmtMoney.format(s.value - s.invested)}</b></div>
            `;
            }
        }
    };

    chartInstance.setOption(option, true);
}

function renderEmpty(msg) {
    DOM.chartDom.style.display = 'none';
    DOM.emptyState.style.display = 'block';
    DOM.emptyState.innerHTML = `<b>无法计算</b><br>${msg}`;
}

// ─────────────────────────────────────────────
// 7. 初始化与股票池载入
// ─────────────────────────────────────────────
async function initStockList() {
    const codeList = ['qqq', 'tqqq', 'spy'];
    const i = codeList.length;
    codeList.push(...hst);

    DOM.codeListBox.innerHTML = '';
    const frag = document.createDocumentFragment();

    codeList.forEach((code, index) => {
        const span = createElementA(code);
        if (index >= i) span.dataset.cache = 'true';
        frag.appendChild(span);
    });

    DOM.codeListBox.appendChild(frag);
    hashchange();
}

function createElementA(code) {
    const a = document.createElement('a');
    a.textContent = code.toUpperCase();
    a.classList.add('code');
    a.href = '#' + code;
    return a;
}

initStockList();

DOM.csh.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && DOM.csh.value) {
        window.location.hash = DOM.csh.value.toLowerCase();
    }
});
DOM.shBtn.addEventListener('click', () => {
    if (DOM.csh.value) {
        window.location.hash = DOM.csh.value.toLowerCase();
    }
});
DOM.csh.addEventListener('input', (e) => {
    const start = DOM.csh.selectionStart;
    const end = DOM.csh.selectionEnd;
    const value = DOM.csh.value;
    const newValue = value.replace(/[^A-Za-z0-9.-]/g, '').toUpperCase().slice(0, 10);
    if (value !== newValue) {
        DOM.csh.value = newValue;
        const newStart = Math.min(start, newValue.length);
        const newEnd = Math.min(end, newValue.length);
        DOM.csh.setSelectionRange(newStart, newEnd);
    }
});

DOM.swBtn.addEventListener('click', () => {
    statusA = !statusA;
    recompute();
});
DOM.okBtn.addEventListener('click', () => {
    statusA = false;
    recompute();
});

// DOM.amountInput.addEventListener('input', debounce(recompute, 300));
// DOM.dividendInput.addEventListener('input', debounce(recompute, 300));
DOM.freqSelect.addEventListener('change', recompute);

window.addEventListener('hashchange', hashchange);
async function hashchange() {
    DOM.summaryEl.style.opacity = 0;
    DOM.chartHead.style.opacity = 0;
    let code = window.location.hash.substring(1);
    const els = DOM.codeListBox.querySelectorAll('.code');
    // if (!code && els.length > 0) code = els[0].textContent;
    if (!code) return;
    activeCode = code.toUpperCase();
    els.forEach(el => el.classList.toggle('code-active', el.textContent.toUpperCase() === activeCode));
    fetchStockData(code);
}

const fsBtn = document.getElementById('fsBtn');
const chartPanel = document.getElementById('chart-panel');

fsBtn.addEventListener('click', () => {
    const isFullscreen = chartPanel.classList.toggle('web-fullscreen');
    if (isFullscreen) {
        fsBtn.innerText = '退出横屏';
        document.body.style.overflow = 'hidden';
        triggerChartResize();
    } else {
        fsBtn.innerText = '横屏';
        document.body.style.overflow = '';
        triggerChartResize();
    }
});

// document.addEventListener('keydown', (e) => {
//     if (e.key === 'Escape' && chartPanel.classList.contains('web-fullscreen')) {
//         fsBtn.click();
//     }
// });

function triggerChartResize() {
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
    }, 300);
}
