import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

export const createUserElasticSearchPrompt = (elasticsearchResults: string, dbResults: string, userQuery: string) => `
  You are a conversational assistant. Construct a clear and informative response to the user message: "${userQuery}"

  You have access to two data sources:

  Elasticsearch results:
  "${elasticsearchResults}"

  Database results:
  "${dbResults}"

  Your response should:
  1. Analyze both data sources and determine which one(s) contain relevant information for the query
  2. If Elasticsearch results are relevant, use them as your primary source
  3. If database results are relevant, incorporate that information
  4. If both sources have relevant information, combine them coherently
  5. If neither source has relevant information, politely indicate that you cannot help with this specific query
  6. Present information in a user-friendly tone, avoiding technical jargon unless necessary
  7. Include links or metadata from the results when available
  8. Avoid speculating or including information not present in the results
  9. Always answer in the same language as the user's query
  10. Only provide information that is directly supported by either data source
`;

export const getElasticsearchResults = async (query: string) => {
  return fetch('/api/elasticsearch', {
    method: 'POST',
    body: query,
  });
};

export const generateQuery = (
  message: string
) => ` You are an expert in generating optimized Elasticsearch queries. Your task is as follows: 
1. Generate an Elasticsearch query that retrieves the most relevant documents based on the user's message: "${message}". 
2. Extract only the essential keywords from the user's message that directly relate to the content being searched (e.g., "logs," "warnings," "errors"). Ignore time-related terms (e.g., "last month," "yesterday") and filler words (e.g., "show me," "I want to see") as well as words like "visualization" and "dynamic chart" as they are not relevant to the query string.
3. Include a date range filter using the "@timestamp" field if the user's message contains time-related terms. Interpret these terms and translate them into the appropriate date range. If the user's message does not contain any time-related terms, omit the date range filter.
4. The JSON structure must strictly follow this format: 
{ 
  "query": { 
    "query_string": { 
      "query": "EXTRACTED_KEYWORDS" 
    } 
  }, 
  "post_filter": { 
    "range": { 
      "@timestamp": { 
        "gte": "START_DATE", // Replace with actual start date if relevant
        "lte": "END_DATE"    // Replace with actual end date if relevant
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
5. The "query_string.query" field must contain only the extracted keywords, and no additional fields or properties should be included.
6. Use "post_filter" for filtering by date range instead of including it in the main query, to ensure results match the query string first before applying the filter.
7. Ensure that the query structure is valid and strictly adheres to the above format without introducing any extraneous fields or invalid configurations.
8. Absolutely no explanations, comments, or text outside the JSON object should be included. Only return a valid JSON object as specified above.`;

async function getOptimizedQuery(elasticsearchPrompt: string): Promise<string | null> {
  try {
    const { text: optimizedElasticsearchQuery } = await generateText({
      model: openai('gpt-4'),
      prompt: elasticsearchPrompt,
    });
    return optimizedElasticsearchQuery;
  } catch (error) {
    console.error('Error generating text for Elasticsearch prompt:', error);
    return null;
  }
}

export type ElasticsearchQuery = {
  query: {
    multi_match: {
      query: string;
      fields: string[];
    };
  };
  sort: Array<{
    '@timestamp': {
      order: 'desc' | 'asc';
    };
  }>;
};

export async function generateElasticsearchPrompt(message: string): Promise<ElasticsearchQuery | null> {
  try {
    const elasticsearchPrompt = generateQuery(message);
    const optimizedQuery = await getOptimizedQuery(elasticsearchPrompt);

    if (!optimizedQuery) {
      console.error('Optimized Elasticsearch query is empty or null.');
      return null;
    }

    const parsedQuery: ElasticsearchQuery = JSON.parse(optimizedQuery);
    return parsedQuery;
  } catch (error) {
    console.error('Error generating Elasticsearch prompt:', error);
    return null;
  }
}

export async function fetchFromElasticsearch(query: ElasticsearchQuery): Promise<any> {
  const response = await fetch('http://localhost:9200/logs-*/_search', {
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

// FIXME: currently only necessary types are included, there are more fields in the response from elasticsearch
export type ElasticsearchResponse = {
  hits: {
    hits: Array<{
      _source: {
        '@timestamp': string;
        log_level: string;
        message: string;
      };
    }>;
  };
};
