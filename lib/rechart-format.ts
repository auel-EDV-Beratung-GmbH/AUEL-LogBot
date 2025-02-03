interface ChartConfig {
  multipleLines?: boolean;
  measurementColumn?: string;
  xKey: string;
  yKeys: string[];
}

export function transformDataForMultiLineChart(data: any[], config: ChartConfig) {
  const xAxisField = config.xKey;
  const lineFields = [...new Set(data.map((item) => item[config.measurementColumn || '']))];

  const transformedData = data.reduce((acc: any[], curr) => {
    const existingEntry = acc.find((item) => item[xAxisField] === curr[xAxisField]);
    if (existingEntry) {
      existingEntry[curr[config.measurementColumn || '']] = curr[config.yKeys[0]];
    } else {
      const newEntry = { [xAxisField]: curr[xAxisField] };
      newEntry[curr[config.measurementColumn || '']] = curr[config.yKeys[0]];
      acc.push(newEntry);
    }
    return acc;
  }, []);

  return { data: transformedData, xAxisField, lineFields };
}
