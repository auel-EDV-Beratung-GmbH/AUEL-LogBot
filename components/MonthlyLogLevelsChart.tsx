'use client';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from './ui/chart';

const monthlyLogLevelChartConfig = {
  INFO: {
    label: 'INFO',
    color: '#60a5fa', // Lighter blue
  },

  WARN: {
    label: 'WARN',
    color: '#fbbf24', // Lighter orange
  },

  DEBUG: {
    label: 'DEBUG',
    color: '#bfdbfe', // Even lighter blue
  },

  ERROR: {
    label: 'ERROR',
    color: '#fecaca', // Lighter red
  },
} satisfies ChartConfig;

export const MonthlyLogLevelChart = ({
  data,
}: {
  data: {
    month: string;
    INFO: number;
    WARN: number;
    DEBUG: number;
    ERROR: number;
  }[];
}) => {
  return (
    <ChartContainer config={monthlyLogLevelChartConfig} className="min-h-[200px] w-full max-w-lg mx-auto">
      <BarChart accessibilityLayer data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} tickMargin={10} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar key="INFO" dataKey="INFO" fill="var(--color-INFO)" radius={4} />
        <Bar key="WARN" dataKey="WARN" fill="var(--color-WARN)" radius={4} />
        <Bar key="DEBUG" dataKey="DEBUG" fill="var(--color-DEBUG)" radius={4} />
        <Bar key="ERROR" dataKey="ERROR" fill="var(--color-ERROR)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
};
