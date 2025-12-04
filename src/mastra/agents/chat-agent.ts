/**
 * Chat Agent
 *
 * Main conversational agent for Jarvis.
 * Handles general questions, tool usage, and interactions with user's connected apps.
 *
 * Uses dynamic tool loading via RuntimeContext to access user-specific Composio tools.
 */

import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { getUserTools } from '../cache/tool-cache';
import { emailSearchTool } from '../tools/email-search';

/**
 * Jarvis Chat Agent
 *
 * Features:
 * - Answers general questions
 * - Executes actions on connected apps (Gmail, Calendar, Slack, Notion, GitHub)
 * - Searches past emails for context using RAG
 * - Professional, helpful, and context-aware
 */
export const chatAgent = new Agent({
  name: 'Jarvis Chat Agent',
  instructions: `You are Jarvis, an AI Chief of Staff assistant for busy professionals.

Your capabilities:
- Answer questions and provide information
- Manage emails, calendar, Slack, Notion, and GitHub on behalf of the user
- Search past emails for context (use the searchEmails tool when relevant)
- Execute actions using connected integrations

Guidelines:
- Be professional, concise, and helpful
- When asked to perform actions, use the available tools
- If you need context from past emails, use the searchEmails tool
- Always confirm before taking significant actions (like sending emails or deleting content)
- Respect the user's privacy and handle data carefully
- If a tool isn't available, suggest the user connect the relevant app

Communication style:
- Clear and direct
- Professional but friendly
- Focus on getting things done efficiently`,

  model: openai('gpt-4o'),

  // Dynamic tool loading via RuntimeContext
  // Tools are loaded at runtime based on userId, enabling:
  // 1. User-specific Composio integrations
  // 2. Tool caching (5-min TTL)
  // 3. No agent recreation on every request
  tools: async ({ runtimeContext }) => {
    const userId = runtimeContext.get('userId') as string;

    if (!userId) {
      console.error('[Chat Agent] No userId in RuntimeContext');
      return {};
    }

    console.log(`[Chat Agent] Loading tools for user: ${userId}`);

    // Get cached user tools (Composio integrations)
    const userTools = await getUserTools(userId);

    // Add email search tool (always available if emails table has data)
    return {
      ...userTools,
      emailSearchTool,
    };
  },
});
