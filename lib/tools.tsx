import { tool } from 'ai';
import { z } from 'zod';
import { ElasticsearchResponse } from './elasticsearch/helper';
import { format } from 'date-fns';

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const reduceChartDataForMothlyVisualization = (elasticsearchResponse: ElasticsearchResponse) => {
  const hits = elasticsearchResponse.hits['hits'];
  if (hits.length === 0) {
    return [];
  }

  const minimalChartData = hits
    .sort((a, b) => new Date(a._source['@timestamp']).getTime() - new Date(b._source['@timestamp']).getTime())
    .map((hit) => {
      const _source = hit['_source'];
      const timestamp = new Date(_source['@timestamp']);
      const year = timestamp.getFullYear();
      const month = timestamp.getMonth();

      return {
        month: `${monthNames[month]} ${year}`, // FIXME: this is just a temporary solution to differentiate between months
        log_level: _source.log_level,
        timestamp: _source['@timestamp'],
      };
    });

  const reducedChartData = minimalChartData.reduce<
    Array<{
      month: string;
      INFO: number;
      WARN: number;
      DEBUG: number;
      ERROR: number;
    }>
  >((acc, curr) => {
    const existingIndex = acc.findIndex((item) => item.month === curr.month);

    if (existingIndex === -1) {
      acc.push({
        month: curr.month,
        INFO: curr.log_level === 'INFO' ? 1 : 0,
        WARN: curr.log_level === 'WARN' ? 1 : 0,
        DEBUG: curr.log_level === 'DEBUG' ? 1 : 0,
        ERROR: curr.log_level === 'ERROR' ? 1 : 0,
      });
    } else {
      const existingMonthRecord = acc[existingIndex];
      acc[existingIndex] = {
        ...existingMonthRecord,
        [curr.log_level as keyof typeof existingMonthRecord]:
          existingMonthRecord[curr.log_level as keyof typeof existingMonthRecord] + 1,
      };
    }

    return acc;
  }, []);

  return reducedChartData;
};

export const minimizeElasticsearchResponse = (elasticsearchResponse: ElasticsearchResponse): MinimizedLogData => {
  return elasticsearchResponse.hits['hits'].map((hit) => {
    const { log_level, ['@timestamp']: timestampStr, message } = hit._source;

    const timestamp = new Date(timestampStr);
    const day = format(timestamp, 'EEEE');
    const month = format(timestamp, 'MMM');
    const year = format(timestamp, 'yyy');

    return {
      log_level: log_level || 'UNKNOWN',
      timestamp: timestampStr,
      message,
      day,
      month,
      year,
    };
  });
};

const visualizeLogLevels = tool({
  description: 'Create a visualization of the log levels ',
  parameters: z.object({
    logData: z.any(), // FIXME: any type
  }),
  execute: async (props) => {
    const { logData } = props;

    return logData;
  },
});

export const chartConfigSchema = z.object({
  type: z.literal('bar').or(z.literal('line')).or(z.literal('area')).or(z.literal('pie')),
  xKey: z.string(),
  yKeys: z.array(z.string()),
  colors: z.record(z.string(), z.string()),
  legend: z.boolean(),
});

export const logDataSchema = z.array(
  z.object({
    log_level: z.string().describe('the log level'),
    timestamp: z.string().describe('the timestamp of the log'),
    message: z.string().describe('the message of the log'),
    month: z.string().describe('the month of the log extracted from timestamp'),
    year: z.string().describe('the year of the log extracted from timestamp'),
    day: z.string().describe('the year of the log, extracted from timestamp'),
  })
);

export type MinimizedLogData = z.infer<typeof logDataSchema>;

export const dynamicallyVisualizeLogs = tool({
  description: 'Create a visualization of the logs',
  parameters: z.object({
    logData: logDataSchema.describe('the log data to be visualized'),
    userQuery: z.string().describe('the original user input query'),
    chartConfig: chartConfigSchema.describe('the chart configuration object for recharts'),
  }),
  execute: async (props) => {
    const { logData, userQuery, chartConfig } = props;

    return logData;
  },
});

export { visualizeLogLevels };
