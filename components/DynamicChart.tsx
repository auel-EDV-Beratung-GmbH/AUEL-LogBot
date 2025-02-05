'use client';

import { Bar, BarChart, XAxis, YAxis, CartesianGrid, Legend, Label } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { ChartConfigFromSchema } from './types/chart';
import { MinimizedLogData } from '@/lib/tools';

function toTitleCase(str: string): string {
  return str
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
export function DynamicChart({
  chartData,
  chartConfig,
}: {
  chartData: MinimizedLogData;
  chartConfig: ChartConfigFromSchema;
}) {
  const renderChart = () => {
    if (!chartData || !chartConfig) return <div>No chart data</div>;

    const dataOrderedByXKey = Object.groupBy(chartData, (item) => chartConfig.xKey);

    const data = Object.entries(dataOrderedByXKey).map(([month, items]) => {
      const counts = items?.reduce<Record<string, number>>((acc, item) => {
        const key = item[chartConfig.yKeys[0] as keyof typeof item];
        if (!acc[key]) {
          acc[key] = 0;
        }
        acc[key]++;
        return acc;
      }, {});

      return {
        [chartConfig.xKey]: month,
        ...counts,
      };
    });

    const barKeys = Array.from(new Set(chartData.map((item) => item[chartConfig.yKeys[0] as keyof typeof item])));

    switch (chartConfig.type) {
      case 'bar':
        return (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={chartConfig.xKey}>
              <Label value={toTitleCase(chartConfig.xKey)} offset={0} position="insideBottom" />
            </XAxis>
            <YAxis>
              <Label value={toTitleCase(chartConfig.yKeys[0])} angle={-90} position="insideLeft" />
            </YAxis>
            <ChartTooltip content={<ChartTooltipContent />} />
            {chartConfig.legend && <Legend />}
            {barKeys.map((key, index) => (
              <Bar key={key} dataKey={key} fill={chartConfig.colors[key]} />
            ))}
          </BarChart>
        );
      // case 'line':
      //   return (
      //     <LineChart data={chartData}>
      //       <CartesianGrid strokeDasharray="3 3" />
      //       <XAxis dataKey={chartConfig.xKey}>
      //         <Label value={toTitleCase(chartConfig.xKey)} offset={0} position="insideBottom" />
      //       </XAxis>
      //       <YAxis>
      //         <Label value={toTitleCase(chartConfig.yKeys[0])} angle={-90} position="insideLeft" />
      //       </YAxis>
      //       <ChartTooltip content={<ChartTooltipContent />} />
      //       {chartConfig.legend && <Legend />}
      //       {chartConfig.yKeys.map((key, index) => {
      //         console.log('render key: ', key);
      //         console.log('render with color: ', chartConfig.colors[key]);
      //         return <Line key={key} type="monotone" dataKey={key} stroke={chartConfig.colors[key]} />;
      //       })}
      //     </LineChart>
      //   );
      // case 'area':
      //   return (
      //     <AreaChart data={chartData}>
      //       <CartesianGrid strokeDasharray="3 3" />
      //       <XAxis dataKey={chartConfig.xKey} />
      //       <YAxis />
      //       <ChartTooltip content={<ChartTooltipContent />} />
      //       {chartConfig.legend && <Legend />}
      //       {chartConfig.yKeys.map((key, index) => (
      //         <Area
      //           key={key}
      //           type="monotone"
      //           dataKey={key}
      //           fill={chartConfig.colors[key]}
      //           stroke={chartConfig.colors[key]}
      //         />
      //       ))}
      //     </AreaChart>
      //   );
      // case 'pie':
      //   return (
      //     <PieChart>
      //       <Pie
      //         data={chartData}
      //         dataKey={chartConfig.yKeys[0]}
      //         nameKey={chartConfig.xKey}
      //         cx="50%"
      //         cy="50%"
      //         outerRadius={120}
      //       >
      //         {chartData.map((_, index) => (
      //           <Cell key={`cell-${index}`} fill={chartConfig.colors[key]} />
      //         ))}
      //       </Pie>
      //       <ChartTooltip content={<ChartTooltipContent />} />
      //       {chartConfig.legend && <Legend />}
      //     </PieChart>
      //   );
      default:
        return <div>Unsupported chart type: {chartConfig.type}</div>;
    }
  };

  return (
    <div className="w-full flex flex-col justify-center items-center">
      <h2 className="text-lg font-bold mb-2">{chartConfig.title}</h2>
      {chartConfig && chartData.length > 0 && (
        <ChartContainer
          config={chartConfig.yKeys.reduce(
            (acc, key, index) => {
              acc[key] = {
                label: key,
                color: chartConfig.colors[key],
              };
              return acc;
            },
            {} as Record<string, { label: string; color: string }>
          )}
          className="h-[320px] w-full"
        >
          {renderChart()}
        </ChartContainer>
      )}
      <div className="w-full">
        <p className="mt-4 text-sm">{chartConfig.description}</p>
        <p className="mt-4 text-sm">{chartConfig.takeaway}</p>
      </div>
    </div>
  );
}
