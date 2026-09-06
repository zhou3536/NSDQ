const fsBtn = document.getElementById('fsBtn'); // 开关按钮
const chartPanel = document.getElementById('chart-panel'); // 要全屏的元素

fsBtn.addEventListener('click', () => {
    // 切换全屏 class
    const isFullscreen = chartPanel.classList.toggle('web-fullscreen');

    if (isFullscreen) {
        fsBtn.innerText = '退出全屏';
        // 防止页面在全屏时还能上下滚动
        document.body.style.overflow = 'hidden';

        // （可选）如果你的图表是 ECharts 等，需要触发 resize 重新计算宽高
        triggerChartResize();
    } else {
        fsBtn.innerText = '全屏';
        // 恢复页面滚动
        document.body.style.overflow = '';

        // （可选）退出后恢复图表尺寸
        triggerChartResize();
    }
});

// 监听按 ESC 键退出全屏
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && chartPanel.classList.contains('web-fullscreen')) {
        fsBtn.click();
    }
});

// 辅助函数：如果是 Canvas 或 ECharts 图表，全屏时需要重新适应大小
function triggerChartResize() {
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
        // 如果是 echarts: myChart.resize();
    }, 300); // 配合 CSS transition 动画时间
}
