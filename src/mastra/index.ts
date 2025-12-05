/**
 * Centralized Mastra Instance
 *
 * This is the main Mastra instance for Jarvis.
 * Agents are registered here once at application startup, not per-request.
 *
 * Benefits:
 * - Single agent definition (no recreation on every request)
 * - Tool caching (5-min TTL reduces DB queries by ~80%)
 * - Dynamic tool loading via RuntimeContext (user-specific tools)
 * - Better performance and resource usage
 * - Centralized vector store for RAG (email search)
 * - Easier to extend (add workflows, memory, etc. in Phase 2)
 */

import { Mastra } from '@mastra/core/mastra';
import { PgVector } from '@mastra/pg';
import { chatAgent } from './agents/chat-agent';
import { emailDrafterAgent } from './agents/email-drafter';
import { emailSenderAgent } from './agents/email-sender';

/**
 * Centralized PgVector instance for RAG
 *
 * Used by:
 * - Email search tool (semantic search over past emails)
 * - Future: conversation memory semantic recall
 */
const pgVector = new PgVector({
  connectionString: process.env.DATABASE_URL!,
});

/**
 * Main Mastra instance
 *
 * Registers all agents and provides centralized access.
 *
 * Usage:
 * ```typescript
 * import { mastra } from '@/mastra';
 *
 * const agent = mastra.getAgent('chatAgent');
 * const runtimeContext = new RuntimeContext();
 * runtimeContext.set('userId', userId);
 * const response = await agent.generate(prompt, { runtimeContext });
 * ```
 */
export const mastra = new Mastra({
  agents: {
    chatAgent,
    emailDrafterAgent,
    emailSenderAgent,
  },

  // Centralized vector store for RAG tools
  vectors: {
    pgVector,
  },

  // Optional: Add telemetry for debugging (disabled in development)
  telemetry: {
    serviceName: 'jarvis-app',
    enabled: process.env.NODE_ENV === 'production',
  },
});

// Re-export agents for convenience
export { chatAgent, emailDrafterAgent, emailSenderAgent };

// Export PgVector for direct access if needed (e.g., storing embeddings)
export { pgVector };

// Export helper for easy agent access
export function getAgent(name: 'chatAgent' | 'emailDrafterAgent' | 'emailSenderAgent') {
  return mastra.getAgent(name);
}
