import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

export const createUserElasticSearchPrompt = (elasticsearchResults: string, dbResults: string, userQuery: string) => `
  You are a conversational assistant. Respond only to the user message: "${userQuery}" and ignore other context unless it directly relates to the query.

  You have access to two data sources:

  Elasticsearch results:
  "${elasticsearchResults}"

  Database results:
  "${dbResults}"

  Your response should:
  1. Use relevant information from Elasticsearch or database results if they pertain to the query.
  2. If both sources contain relevant information, combine them coherently.
  3. If neither source provides relevant information, politely indicate that you cannot help with this query.
  4. Do not refer to irrelevant or previous queries—focus solely on the current user input.
  5. Maintain a user-friendly tone, avoiding technical jargon unless necessary.
  6. Provide links or metadata when available.
  7. Do not speculate or include information not explicitly found in the results.
  8. Always answer in the same language as the user's query.
  9. Only use information directly supported by either data source.
`;

export const getElasticsearchResults = async (query: string) => {
  return fetch('/api/elasticsearch', {
    method: 'POST',
    body: query,
  });
};

export const generateQueryPrompt = (
  message: string
) => `You are an expert in generating optimized Elasticsearch queries. Your task is as follows:  

1. **Generate an Elasticsearch query** that retrieves the most relevant documents based on the user's message: "${message}".  

2. **Extract only the essential keywords** that directly relate to the search query (e.g., "logs," "warnings," "errors").  
   - Ignore filler words such as "show me," "I want to see."  
   - Exclude unrelated words like "visualization" and "dynamic chart."  

3. **You must always check for and interpret time-related terms** in the user message and apply a date range filter in the "@timestamp" field:  
   - If the message contains a **month name (e.g., "January")**, assume the full month:  
     - Example: "from January" → "gte": "2024-01-01T00:00:00Z", "lte": "2024-01-31T23:59:59Z"  
   - If the message contains a **specific day (e.g., "14th of January")**, assume the full day:  
     - Example: "14th of January" → "gte": "2024-01-14T00:00:00Z", "lte": "2024-01-14T23:59:59Z"
   - If the message contains a **date range (e.g., "from Jan 10 to Jan 15")**, use the exact range.  
   - If the message contains **relative time expressions** (e.g., "last week," "past 7 days"), convert them to absolute dates.  
   - If the message does **not** contain any time-related terms, **omit** the date filter.  

4. **The JSON output must always follow this structure**:  
\`\`\`json
{
  "query": {
    "query_string": {
      "query": "EXTRACTED_KEYWORDS"
    }
  },
  "post_filter": {
    "range": {
      "@timestamp": {
        "gte": "START_DATE",  // Replace with actual start date if relevant
        "lte": "END_DATE"     // Replace with actual end date if relevant
      }
    }
  },
  "sort": [
    {
      "@timestamp": {
        "order": "desc"
      }
    }
  ],
  "size": 100
}
\`\`\`

5. **"post_filter" must always be included if a time-related term is detected.**  
6. **Ensure the output is always a valid JSON object with no additional text, explanations, or formatting errors.**  

🚨 **CRITICAL RULE:** If a date expression (month, day, range, relative time) is detected, you **must** include the "post_filter" section with the proper date range.`;

const ElasticsearchQuerySchema = z.object({
  query: z.object({
    query_string: z.object({
      query: z.string(),
    }),
  }),
  post_filter: z
    .object({
      range: z.object({
        '@timestamp': z.object({
          gte: z.string(),
          lte: z.string(),
        }),
      }),
    })
    .optional(),
  sort: z
    .array(
      z.object({
        '@timestamp': z.object({
          order: z.string(),
        }),
      })
    )
    .optional(),
  size: z.number().optional(),
});

type ElasticsearchQuery = z.infer<typeof ElasticsearchQuerySchema>;

async function getOptimizedQuery(elasticsearchPrompt: string): Promise<ElasticsearchQuery | null> {
  try {
    const response = await generateObject({
      model: openai('gpt-4'),
      prompt: elasticsearchPrompt,
      schema: ElasticsearchQuerySchema,
    });

    return response.object;
  } catch (error) {
    console.error('Error generating text for Elasticsearch prompt:', error);
    return null;
  }
}

export async function generateElasticsearchQuery(message: string): Promise<ElasticsearchQuery | null> {
  try {
    const prompt = generateQueryPrompt(message);
    const optimizedQuery = await getOptimizedQuery(prompt);

    if (!optimizedQuery) {
      console.error('Optimized Elasticsearch query is empty or null.');
      return null;
    }

    return optimizedQuery;
  } catch (error) {
    console.error('Error generating Elasticsearch prompt:', error);
    return null;
  }
}

export async function fetchFromElasticsearch(query: ElasticsearchQuery): Promise<any> {
  const elasticsearchUrl = process.env.ELASTICSEARCH_URL;
  if (elasticsearchUrl == null) {
    throw new Error('ELASTICSEARCH_URL is not defined. You have to define a ELASTICSEARCH_URL in you .env');
  }

  const response = await fetch(elasticsearchUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + btoa('elastic:changeme'), // Replace with your actual username and password
    },
    body: JSON.stringify(query),
  });

  if (!response.ok) {
    throw new Error(`Elasticsearch error: ${response.statusText}`);
  }

  return response.json();
}
