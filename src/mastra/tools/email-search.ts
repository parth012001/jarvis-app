/**
 * Email Search Tool
 *
 * Uses Mastra's built-in createVectorQueryTool for semantic search over emails.
 * Leverages the centralized PgVector instance registered in the Mastra instance.
 *
 * The tool automatically filters by userId via RuntimeContext, ensuring users
 * can only search their own emails.
 *
 * Index: email_embeddings (created by scripts/test/create-email-index.mjs)
 * Embedding model: text-embedding-3-small (1536 dimensions)
 */

import { createVectorQueryTool } from '@mastra/rag';
import { openai } from '@ai-sdk/openai';

/**
 * Email search tool for semantic search over user's email history
 *
 * Usage:
 * 1. Set userId filter in RuntimeContext before calling agent:
 *    ```typescript
 *    runtimeContext.set('filter', { userId: ctx.userId });
 *    ```
 *
 * 2. Agent can then search emails naturally:
 *    "Find emails from John about the project deadline"
 *
 * The tool will:
 * - Convert query to embedding using text-embedding-3-small
 * - Search the email_embeddings index in PgVector
 * - Filter results by userId (from RuntimeContext)
 * - Return matching emails with metadata (from, subject, snippet, score)
 */
export const emailSearchTool = createVectorQueryTool({
  id: 'searchEmails',
  vectorStoreName: 'pgVector',
  indexName: 'email_embeddings',
  model: openai.embedding('text-embedding-3-small'),
  description: `Search past emails using semantic search. Use this to find relevant context from previous conversations before drafting replies or answering questions about email history.

Examples of when to use this tool:
- User asks about past conversations: "What did John say about the deadline?"
- Drafting a reply and need context: "Find previous emails in this thread"
- Looking for specific information: "Emails about budget approvals"
- Finding emails from specific people: "Recent emails from the marketing team"

The tool returns matching emails with:
- from: Sender's email address
- subject: Email subject line
- snippet: Preview of email content
- score: Relevance score (0-1, higher is better)

Note: Results are automatically filtered to the current user's emails only.`,
});
