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
    amountInput: document.getElementById('amountInput'),
    emptyState: document.getElementById('emptyState'),
    chartDom: document.getElementById('chart'),
    chartPanel: document.getElementById('chart-panel'),
    chartTitle: document.getElementById('chartTitle'),
    codeListBox: document.getElementById('CodeListBox'),
    okBtn: document.getElementById('okBtn'),
    swBtn: document.getElementById('swBtn'),
    fsBtn: document.getElementById('fsBtn'),
    shBtn: document.getElementById('shBtn'),
    labels: {
        invested: document.getElementById('labelInvested'),
        value: document.getElementById('labelValue'),
        returnAbs: document.getElementById('labelReturnAbs'),
        returnPct: document.getElementById('labelReturn'),
        count: document.getElementById('labelCount'),
    },
    stats: {
        invested: document.getElementById('statInvested'),
        value: document.getElementById('statValue'),
        returnPct: document.getElementById('statReturn'),
        returnAbs: document.getElementById('statReturnAbs'),
        count: document.getElementById('statCount'),
    }
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
// console.log(hst)

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
    if (hst.length > 5) hst.shift();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hst));
}
// ─────────────────────────────────────────────
// 2. 数据请求与解析（含 AbortController 防竞态）
// ─────────────────────────────────────────────
async function fetchStockData(dataName) {
    if (!dataName) return;
    if (currentAbortController) {
        currentAbortController.abort(); // 取消正在进行的请求
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

        // selectedDate = priceData[0].date;
        // DOM.datePickerBtn.textContent = selectedDate;
        // const prevDate = DOM.datePickerBtn.textContent.trim();
        selectedDate = dateIndex.has(StartDate) ? StartDate : priceData[0].date;
        DOM.datePickerBtn.textContent = selectedDate;

        initChart();
        recompute();

        const els = DOM.codeListBox.querySelectorAll('.code');
        const hasMatch = Array.from(els).some(
            el => el.textContent.trim().toLowerCase() === dataName.toLowerCase()
        );
        if (!hasMatch) {
            const els = DOM.codeListBox.querySelectorAll('[data-cashe="true"]');
            if (els.length > 4) els[0].remove();
            const span = createElementA(dataName);
            span.dataset.cashe = true;
            span.classList.add('code-active');
            DOM.codeListBox.appendChild(span);
            addHistory(dataName);
        };
    } catch (err) {
        if (err.name === 'AbortError') return; // 用户切换新标的主动取消，忽略报错
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
// 3. 日期选择器（使用 DocumentFragment 优化渲染）
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
    // 1. 面包屑
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

    // 2. 节点网格（Fragment 批量添加）
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
// 4. 回测计算与 UI 同步
// ─────────────────────────────────────────────
// DOM.amountInput.addEventListener('input', debounce(recompute, 250));

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
    DOM.chartTitle.innerHTML = `${activeCode} 定投收益曲线`;
    computeDCA(startIdx, amount);
}

// 统一更新数据看板，避免冗余
function updateMetricUI({ labels, values, ret, retAbs, count, isStock }) {
    DOM.labels.invested.textContent = labels.invested;
    DOM.labels.value.textContent = labels.value;
    DOM.labels.returnAbs.textContent = labels.returnAbs;
    DOM.labels.returnPct.textContent = labels.returnPct;
    DOM.labels.count.textContent = labels.count;

    DOM.stats.invested.textContent = isStock ? '$' + fmtMoney2.format(values.invested) : fmtMoney.format(values.invested);
    DOM.stats.value.textContent = isStock ? '$' + fmtMoney2.format(values.value) : fmtMoney.format(values.value);

    const cls = ret > 0 ? 'pos' : (ret < 0 ? 'neg' : 'neutral');
    DOM.stats.returnPct.textContent = fmtPct(ret);
    DOM.stats.returnPct.className = `v ${cls}`;
    DOM.stats.value.className = `v ${cls}`;

    DOM.stats.returnAbs.textContent = (isStock ? fmtMoney2.format(retAbs) : fmtMoney.format(retAbs));
    DOM.stats.returnAbs.className = `v ${cls}`;
    DOM.stats.count.textContent = count;
}

function computeStockPrice(startIdx) {
    // DOM.chartTitle.innerHTML = `${activeCode} 股价曲线`;
    const series = priceData.slice(startIdx);
    const first = series[0];
    const last = series[series.length - 1];
    const diff = last.close - first.close;

    updateMetricUI({
        labels: { invested: '起始价格', value: '最新价格', returnAbs: '涨跌额', returnPct: '涨跌幅', count: '交易天数' },
        values: { invested: first.close, value: last.close },
        ret: diff / first.close,
        retAbs: diff,
        count: series.length,
        isStock: true
    });

    updateStockChart(series);
}

function computeDCA(startIdx, amount) {
    //       DOM.chartTitle.innerHTML = `${activeCode} 定投收益曲线`;
    let shares = 0;
    let invested = 0;
    const series = new Array(priceData.length - startIdx);

    for (let i = startIdx, k = 0; i < priceData.length; i++, k++) {
        const row = priceData[i];
        shares += amount / row.close;
        invested += amount;
        const value = shares * row.close;
        series[k] = {
            date: row.date,
            close: row.close,
            invested: invested,
            value: value,
            ret: (value - invested) / invested,
            shares: shares
        };
    }

    const last = series[series.length - 1];
    updateMetricUI({
        labels: { invested: '累计投入', value: '当前市值', returnAbs: '浮盈', returnPct: '总收益率', count: '定投次数' },
        values: { invested: last.invested, value: last.value },
        ret: last.ret,
        retAbs: last.value - last.invested,
        count: series.length,
        isStock: false
    });

    updateChart(series);
}

// ─────────────────────────────────────────────
// 5. ECharts 实例管理与渲染优化
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
    grid: { left: 56, right: 24, top: 20, bottom: 64 },
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
                formatter: (v) => '$' + v.toFixed(0)
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
              <div class="fl"><span>收盘价</span><b>$${fmtMoney2.format(s.close)}</b></div>
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
              <div class="fl"><span>收盘价</span><b>$${fmtMoney2.format(s.close)}</b></div>
              <div class="fl"><span>日涨幅</span><b style="color:${dailyRet >= 0 ? green : red};">${prevClose ? fmtPct(dailyRet) : '—'}</b></div>
              <div class="fl"><span>总涨幅</span><b style="color:${priceRatio >= 1 ? green : red};">${fmtPct(priceRatio - 1)}</b></div>
              <div class="fl"><span>投入</span><b>${fmtMoney.format(s.invested)}</b></div>
              <div class="fl"><span>市值</span><b>${fmtMoney.format(s.value)}</b></div>
              <div class="fl"><span>浮盈</span><b style="color:${s.ret >= 0 ? green : red};">${fmtPct(s.ret)}</b></div>
              <div class="fl"><span></span><b style="color:${s.ret >= 0 ? green : red};">${fmtMoney.format(s.value - s.invested)}</b></div>
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

// 6. 初始化与股票池载入
// ─────────────────────────────────────────────
async function initStockList() {
    const codeList = ['qqq', 'tqqq', 'spy']
    const i = codeList.length;
    codeList.push(...hst);

    DOM.codeListBox.innerHTML = '';
    const frag = document.createDocumentFragment();

    codeList.forEach((code, index) => {
        const span = createElementA(code);
        if (index >= i) span.dataset.cashe = true;
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
    const newValue = value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 5);
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
})
DOM.okBtn.addEventListener('click', () => {
    statusA = false;
    recompute();
});

window.addEventListener('hashchange', hashchange);
async function hashchange() {
    let code = window.location.hash.substring(1);
    const els = DOM.codeListBox.querySelectorAll('.code')
    if (!code) code = els[0].textContent;
    activeCode = code.toUpperCase();
    els.forEach(el => el.classList.toggle('code-active', el.textContent.toUpperCase() === activeCode));
    fetchStockData(code);
}


const fsBtn = document.getElementById('fsBtn'); // 开关按钮
const chartPanel = document.getElementById('chart-panel'); // 要全屏的元素

fsBtn.addEventListener('click', () => {
    const isFullscreen = chartPanel.classList.toggle('web-fullscreen');
    if (isFullscreen) {
        fsBtn.innerText = '退出全屏';
        document.body.style.overflow = 'hidden';
        triggerChartResize();
    } else {
        fsBtn.innerText = '全屏';
        document.body.style.overflow = '';
        triggerChartResize();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && chartPanel.classList.contains('web-fullscreen')) {
        fsBtn.click();
    }
});

function triggerChartResize() {
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
    }, 300);
}

