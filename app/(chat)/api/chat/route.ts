import { type Message, StreamData, convertToCoreMessages, generateText, streamObject, streamText } from 'ai';
import { z } from 'zod';

import { auth } from '@/app/(auth)/auth';
import { customModel } from '@/lib/ai';
import { models } from '@/lib/ai/models';
import { deleteChatById, getChatById, saveChat, saveMessages } from '@/lib/db/queries';
import { generateUUID, getMostRecentUserMessage, sanitizeResponseMessages } from '@/lib/utils';

import { generateTitleFromUserMessage } from '../../actions';
import {
  createUserElasticSearchPrompt,
  fetchFromElasticsearch,
  generateElasticsearchQuery,
} from '@/lib/elasticsearch/helper';
import { generateMysqlQuery, runGenerateSQLQuery } from '@/lib/atlasdb/natural-language-to-mysql';

export const maxDuration = 60;

type AllowedTools = 'createDocument' | 'updateDocument' | 'requestSuggestions' | 'getWeather';

const blocksTools: AllowedTools[] = ['createDocument', 'updateDocument', 'requestSuggestions'];

const weatherTools: AllowedTools[] = ['getWeather'];

const allTools: AllowedTools[] = [...blocksTools, ...weatherTools];

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

  // fetch and store data from elasticsearch
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

  // database
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
    onFinish: async ({ response }) => {
      if (session.user?.id) {
        try {
          const responseMessagesWithoutIncompleteToolCalls = sanitizeResponseMessages(response.messages);

          await saveMessages({
            messages: responseMessagesWithoutIncompleteToolCalls.map((message) => {
              const messageId = generateUUID();

              if (message.role === 'assistant') {
                streamingData.appendMessageAnnotation({
                  messageIdFromServer: messageId,
                });
              }

              return {
                id: messageId,
                chatId: id,
                role: message.role,
                content: message.content,
                createdAt: new Date(),
              };
            }),
          });
        } catch (error) {
          console.error('Failed to save chat');
        }
      }

      streamingData.close();
    },
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'stream-text',
    },
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
