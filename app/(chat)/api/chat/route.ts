import { type Message, StreamData, convertToCoreMessages, generateText, streamText, tool } from 'ai';
import { auth } from '@/app/(auth)/auth';
import { customModel } from '@/lib/ai';
import { models } from '@/lib/ai/models';
import { deleteChatById, getChatById, saveChat, saveMessages } from '@/lib/db/queries';
import { generateUUID, getMostRecentUserMessage } from '@/lib/utils';

import { generateChartConfig, generateTitleFromUserMessage } from '../../actions';
import {
  createUserElasticSearchPrompt,
  fetchFromElasticsearch,
  generateElasticsearchQuery,
} from '@/lib/elasticsearch/helper';
import { generateMysqlQuery, runGenerateSQLQuery } from '@/lib/atlasdb/natural-language-to-mysql';
import {
  logDataSchema,
  minimizeElasticsearchResponse,
  reduceChartDataForMothlyVisualization,
  visualizeLogLevels,
} from '@/lib/tools';
import { z } from 'zod';

export const maxDuration = 60;

export async function POST(request: Request) {
  const { id, messages, modelId }: { id: string; messages: Array<Message>; modelId: string } = await request.json();

  const session = await auth();

  if (!session || !session.user || !session.user.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const model = models.find((model) => model.id === modelId);

  if (!model) {
    return new Response('Model not found', { status: 404 });
  }

  const coreMessages = convertToCoreMessages(messages);
  const userMessage = getMostRecentUserMessage(coreMessages);

  if (!userMessage) {
    return new Response('No user message found', { status: 400 });
  }

  const chat = await getChatById({ id });

  if (!chat) {
    const title = await generateTitleFromUserMessage({ message: userMessage });
    await saveChat({ id, userId: session.user.id, title });
  }

  await saveMessages({
    messages: [{ ...userMessage, id: generateUUID(), createdAt: new Date(), chatId: id }],
  });

  // Store search results from different sources
  const searchResults: Record<'elasticsearch' | 'database', any> = {
    elasticsearch: null,
    database: null,
  };

  // FIXME: THIS IS EXPERIMENTAL CODE
  // elasticsearch
  try {
    const optimizedQuery = await generateElasticsearchQuery(userMessage.content.toString());
    if (!optimizedQuery) {
      return new Response('Failed to generate Elasticsearch prompt', { status: 500 });
    }
    const elasticsearchResults = await fetchFromElasticsearch(optimizedQuery);
    searchResults.elasticsearch = elasticsearchResults;
  } catch (error) {
    console.error('Error fetching from Elasticsearch:', error);
  }

  // FIXME: this is experimental code for visualization of log data
  if (userMessage.content.toString().includes('visualization') && searchResults.elasticsearch != null) {
    // pre-process log data to avoid sending large data to the model
    const preprocessedLogData = reduceChartDataForMothlyVisualization(searchResults.elasticsearch);

    const result = streamText({
      model: customModel(model.apiIdentifier),
      system: `Here is the log data: ${JSON.stringify(preprocessedLogData)}. Use the "visualizeLogs" tool to create a visualization.`,
      messages: coreMessages,
      tools: {
        visualizeLogs: visualizeLogLevels,
      },
    });

    return result.toDataStreamResponse();
  }

  // FIXME: for testing purposes of new feature: dynamic charts
  if (userMessage.content.toString().includes('dynamic chart') && searchResults.elasticsearch != null) {
    // TODO: transform this into chart data
    const minimizedData = minimizeElasticsearchResponse(searchResults.elasticsearch);

    const chartConfig = await generateChartConfig(minimizedData, userMessage.content.toString());

    const result = streamText({
      model: customModel(model.apiIdentifier),
      system: `Use the "dynamicChart" tool to create a visualization.`,
      messages: coreMessages,
      tools: {
        dynamicChart: tool({
          description: 'Create a visualization of the log data',
          parameters: z.object({
            logData: logDataSchema.describe('the log data to be visualized'),
            userQuery: z.string().describe('the original user input query'),
            chartConfig: z.any().describe('the chart configuration object'), // FIXME: any type
          }),
          execute: async () => {
            return {
              chartData: minimizedData,
              chartConfig: chartConfig,
              userQuery: userMessage.content.toString(),
            };
          },
        }),
      },
    });

    return result.toDataStreamResponse();
  }

  // FIXME: this is experimental code for fetching from database
  const databaseSearchEnabled = process.env.ENABLE_DATABASE_SEARCH === 'true';
  if (databaseSearchEnabled) {
    try {
      const atlasQuery = await generateMysqlQuery(userMessage.content.toString());
      const databaseResults = await runGenerateSQLQuery(atlasQuery);
      searchResults.database = databaseResults;
    } catch (error) {
      console.error('Error executing AtlasDB query: ', error);
    }
  }

  const systemPrompt = createUserElasticSearchPrompt(
    JSON.stringify(searchResults.elasticsearch),
    JSON.stringify(searchResults.database),
    userMessage.content.toString()
  );

  const streamingData = new StreamData();

  const result = streamText({
    model: customModel(model.apiIdentifier),
    system: systemPrompt,
    messages: coreMessages,
    maxSteps: 5,
  });

  return result.toDataStreamResponse({
    data: streamingData,
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();

  if (!session || !session.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const chat = await getChatById({ id });

    if (chat.userId !== session.user.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    await deleteChatById({ id });

    return new Response('Chat deleted', { status: 200 });
  } catch (error) {
    return new Response('An error occurred while processing your request', {
      status: 500,
    });
  }
}
