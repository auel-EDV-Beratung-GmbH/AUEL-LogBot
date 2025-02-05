'use server';

import { type CoreUserMessage, generateObject, generateText } from 'ai';
import { cookies } from 'next/headers';
import { customModel } from '@/lib/ai';
import { configSchema } from '@/components/types/chart';

export async function saveModelId(model: string) {
  const cookieStore = await cookies();
  cookieStore.set('model-id', model);
}

export async function generateTitleFromUserMessage({ message }: { message: CoreUserMessage }) {
  const { text: title } = await generateText({
    model: customModel('gpt-4o-mini'),
    system: `\n
    - you will generate a short title based on the first message a user begins a conversation with
    - ensure it is not more than 80 characters long
    - the title should be a summary of the user's message
    - do not use quotes or colons`,
    prompt: JSON.stringify(message),
  });

  return title;
}

export async function generateChartConfig(chartData: any, userQuery: string) {
  try {
    const { object: config } = await generateObject({
      model: customModel('gpt-4o-mini'),
      system: 'You are a data visualization expert.',
      prompt: `Given the following data, generate the chart config that best visualises the data and answers the users query.
      For multiple groups use multi-lines.

      The response MUST include a colors object mapping each yKey to a hex color code.

      Here is an example complete config:
      {
      "type": "bar",
      "xKey": "month",
      "yKeys": ["log_level", "timestamp", "expenses"],
      "colors": {
        "sales": "#4CAF50",
        "profit": "#2196F3",
        "expenses": "#F44336"
      },
      "legend": true
      }

      User Query:
      ${userQuery}

      Data:
      ${JSON.stringify(chartData, null, 2)}

      Possible y-keys are:
      ${JSON.stringify(Object.keys(chartData[0]))}

      Requirements:
      1. The config MUST include a colors object
      2. Select the appropriate yKeys from the possible y-keys above.
      3. Each yKey MUST have a corresponding color in the colors object
      4. Colors should be in hex format (e.g. #4CAF50)
      5. Choose colors that meaningfully represent the data (e.g. red for errors, green for success)
      6. If no meaningful color association exists, use any appropriate color
      7. If the xKey makes sense to be time-related, choose the best range (e.g., "month", "year", "day") based on the data provided as the xKey.
      8. Return a complete JSON object with all required fields including colors.
      `,
      schema: configSchema,
    });

    // Create colors object
    const colors: Record<string, string> = {};
    config.yKeys.forEach((key: string, index: number) => {
      const fallbackColors = ['#4CAF50', '#2196F3', '#F44336', '#FFC107', '#9C27B0', '#795548'];
      colors[key] = fallbackColors[index % fallbackColors.length];
    });

    // Create new config object with all required properties
    const updatedConfig = {
      type: 'bar', // FIXME: dynamically set this
      xKey: config.xKey,
      yKeys: config.yKeys,
      colors: colors,
      legend: config.legend ?? true,
    };

    return updatedConfig;
  } catch (error) {
    console.error('Error generating chart config:', error);
    throw new Error('Failed to generate chart config');
  }
}
