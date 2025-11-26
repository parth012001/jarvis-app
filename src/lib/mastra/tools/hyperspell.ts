import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { searchMemories } from '@/lib/hyperspell/client';

/**
 * Hyperspell Memory Search Tool
 *
 * Searches user's connected accounts (Gmail, Calendar, Slack, Notion) via Hyperspell
 * to retrieve relevant historical information and context.
 *
 * This tool enables the agent to access user's past emails, meetings, messages,
 * and documents to provide contextual responses.
 */
export const hyperspellSearchTool = createTool({
  id: 'hyperspell-search-memories',
  description: `Search user's connected accounts (Gmail, Calendar, Slack, Notion) for relevant information.

Use this tool when the user asks about:
- Past emails or conversations
- Previous meetings or calendar events
- Messages from Slack channels
- Documents or notes from Notion
- Any historical information from their connected accounts

The tool will return relevant documents with context and an AI-generated answer summarizing the findings.`,

  inputSchema: z.object({
    query: z.string().describe('The search query to find relevant memories and information'),
    sources: z
      .array(z.enum(['google_mail', 'google_calendar', 'slack', 'notion']))
      .optional()
      .describe('Specific sources to search. If not provided, searches all connected sources.'),
    limit: z
      .number()
      .min(1)
      .max(50)
      .default(10)
      .describe('Maximum number of results to return (1-50, default: 10)'),
  }),

  outputSchema: z.object({
    answer: z
      .string()
      .optional()
      .describe('AI-generated answer summarizing the search results'),
    documents: z
      .array(
        z.object({
          content: z.string().describe('The document content'),
          source: z.string().optional().describe('Source of the document'),
          title: z.string().optional().describe('Title of the document'),
        })
      )
      .describe('Array of relevant documents found'),
    documentCount: z.number().describe('Total number of documents returned'),
  }),

  execute: async ({ context, runtimeContext }) => {
    // Get userId from runtimeContext
    const userId = runtimeContext.get('userId') as string;

    if (!userId) {
      throw new Error(
        'User ID is required for Hyperspell memory search. Ensure userId is set in runtimeContext.'
      );
    }

    try {
      console.log('[Hyperspell Tool] Searching memories:', {
        userId,
        query: context.query,
        sources: context.sources,
        limit: context.limit,
      });

      // Search memories using Hyperspell client
      const results = await searchMemories(context.query, userId, {
        answer: true,
        sources: context.sources,
        limit: context.limit,
      });

      console.log('[Hyperspell Tool] Search completed:', {
        userId,
        documentCount: results.documents.length,
        hasAnswer: !!results.answer,
      });

      return {
        answer: results.answer || undefined,
        documents: results.documents.map((doc: any) => ({
          content: doc.content || doc.text || '',
          source: doc.source || doc.metadata?.source || undefined,
          title: doc.title || doc.metadata?.title || undefined,
        })),
        documentCount: results.documents.length,
      };
    } catch (error) {
      console.error('[Hyperspell Tool] Search failed:', error);

      // Provide helpful error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`Failed to search Hyperspell memories: ${errorMessage}`);
    }
  },
});
