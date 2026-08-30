function transformData(data) {
    return data.map(item => {
      // 确保 date 是 Date 对象，如果已经是字符串则转换
      const dateObj = new Date(item.date);
      
      return {
        // 提取 YYYY-MM-DD
        date: dateObj.toISOString().split('T')[0],
        // 对 close 进行四舍五入取整
        close: Math.round(item.close) 
      };
    });
  }
  
  // ================= 测试用例 =================
  const rawData = [
    {
      date: new Date("2000-01-01T05:00:00.000Z"),
      high: 97.625,
      volume: 583431800,
      open: 96.1875,
      low: 79.75,
      close: 89.6875,
      adjclose: 75.57381439208984
    },
    {
      date: new Date("2000-01-02T05:00:00.000Z"),
      high: 99.0,
      volume: 400000000,
      open: 90.0,
      low: 88.0,
      close: 95.2,
      adjclose: 80.0
    }
  ];
  
  const result = transformData(rawData);
  console.log(result);
  