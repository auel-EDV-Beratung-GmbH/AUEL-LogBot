'use server';

import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import { atlasdb } from './connector';
import { sql } from 'drizzle-orm';

export async function generateMysqlQuery(prompt: string) {
  const query = `
    You are an expert MySQL query generator. Your task is to:
    1. ou are a SQL (postgres) and data visualization expert. Your job is to help the user write a SQL query to retrieve the data they need. 
    2. The table schema is as follows:
       users (
         id PRIMARY KEY,
         name VARCHAR(255),
         email VARCHAR(255), 
         last_updated timestamp
       )
    3. If the user request cannot be fulfilled using the available table/columns, return an empty string
    4. Return only the raw MySQL query without any explanations or comments
    5. Use proper MySQL syntax and ensure queries are secure
    6. Never rename tables or columns
    7. For timestamp comparisons, use proper MySQL datetime functions
    8. Keep queries efficient and avoid unnecessary complexity

    Output the MySQL query now.`;

  try {
    const result = await generateObject({
      model: openai('gpt-4'),
      system: query,
      prompt: prompt,
      schema: z.object({
        query: z.string(),
      }),
    });

    return result.object.query;
  } catch (error) {
    console.error('Error generating MySQL query:', error);
    throw new Error('Error generating MySQL query');
  }
}

export const runGenerateSQLQuery = async (query: string) => {
  'use server';
  // Check if the query is a SELECT statement
  if (
    !query.trim().toLowerCase().startsWith('select') ||
    query.trim().toLowerCase().includes('drop') ||
    query.trim().toLowerCase().includes('delete') ||
    query.trim().toLowerCase().includes('insert') ||
    query.trim().toLowerCase().includes('update') ||
    query.trim().toLowerCase().includes('alter') ||
    query.trim().toLowerCase().includes('truncate') ||
    query.trim().toLowerCase().includes('create') ||
    query.trim().toLowerCase().includes('grant') ||
    query.trim().toLowerCase().includes('revoke')
  ) {
    throw new Error('Only SELECT queries are allowed');
  }

  let data: any;
  try {
    data = await atlasdb.execute(sql.raw(query));
  } catch (e: any) {
    console.log('Error executing query:', e);
    throw e;
  }

  return data;
};
