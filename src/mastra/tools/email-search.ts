/**
 * Email Search Tool
 *
 * Exposes the email embeddings RAG system as an explicit Mastra tool.
 * Agents can use this to search past emails for context when drafting replies
 * or answering questions about email history.
 *
 * Uses existing PgVector + embeddings infrastructure.
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { searchSimilarEmails } from '@/lib/email/embeddings';

/**
 * Email search tool for semantic search over user's email history
 *
 * @example
 * Agent can call:
 * ```
 * searchEmails({ query: "emails from John about the project", limit: 5 })
 * ```
 *
 * Returns:
 * ```
 * {
 *   results: [
 *     {
 *       emailId: "uuid",
 *       messageId: "gmail-id",
 *       from: "John Doe <john@example.com>",
 *       subject: "Project Update",
 *       snippet: "First 200 chars of email...",
 *       score: 0.87
 *     }
 *   ]
 * }
 * ```
 */
export const emailSearchTool = createTool({
  id: 'searchEmails',
  description: `Search past emails using semantic search. Use this to find relevant context from previous conversations before drafting replies or answering questions about email history.

Examples:
- "emails from John about the project deadline"
- "meeting invitations from last month"
- "conversations about budget approvals"

Returns matching emails with sender, subject, and snippet.`,

  inputSchema: z.object({
    query: z
      .string()
      .describe(
        'Natural language search query (e.g., "emails from Alice about the contract")'
      ),
    limit: z
      .number()
      .optional()
      .default(5)
      .describe('Maximum number of results to return (default: 5)'),
  }),

  execute: async ({ context, runtimeContext }) => {
    // Get userId from RuntimeContext (passed by agent at runtime)
    const userId = runtimeContext.get('userId') as string;

    if (!userId) {
      console.error('[Email Search Tool] No userId in RuntimeContext');
      return {
        success: false,
        error: 'User context not available',
        results: [],
      };
    }

    console.log(
      `[Email Search Tool] Searching for user ${userId}: "${context.query}" (limit: ${context.limit})`
    );

    try {
      // Use existing embeddings search function
      const results = await searchSimilarEmails(
        userId,
        context.query,
        context.limit
      );

      console.log(
        `[Email Search Tool] Found ${results.length} matching emails`
      );

      return {
        success: true,
        results: results.map((r) => ({
          emailId: r.emailId,
          messageId: r.messageId,
          from: r.from,
          subject: r.subject,
          snippet: r.snippet,
          relevanceScore: r.score,
        })),
        count: results.length,
      };
    } catch (error) {
      console.error('[Email Search Tool] Search failed:', error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown search error',
        results: [],
      };
    }
  },
});
