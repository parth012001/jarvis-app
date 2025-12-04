/**
 * Email Sender Agent
 *
 * Specialized agent for sending pre-approved emails via Gmail.
 * Used when user approves a draft and wants to send it.
 *
 * This is a simple, focused agent that:
 * - Takes email details (to, subject, body)
 * - Uses Gmail tools to send
 * - Confirms success or reports errors
 * - Does NOT modify content or make decisions
 */

import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { getUserTools } from '../cache/tool-cache';

/**
 * Email Sender Agent
 *
 * Ultra-focused agent with ONE job: send emails using Gmail tool.
 * Uses GPT-4o-mini for cost efficiency (simple task).
 */
export const emailSenderAgent = new Agent({
  name: 'Email Sender',
  instructions: `You are an email sender. Your ONLY job is to send emails using the Gmail tool.

Your process:
1. You will receive email details: recipient, subject, and body
2. Use the GMAIL_SEND_EMAIL tool (or similar Gmail action tool) with the EXACT details provided
3. Do NOT modify the content in any way
4. Confirm when the email is sent successfully
5. Report any errors clearly if sending fails

Rules:
- NEVER edit, draft, or suggest changes to the email
- NEVER ask for confirmation - the email is already approved
- JUST SEND using the provided details
- Use the exact subject and body as given
- If the tool fails, explain the error clearly

You are a simple execution agent - no thinking, no editing, just sending.`,

  // Use cheaper model for this simple task
  model: openai('gpt-4o-mini'),

  // Dynamic tool loading via RuntimeContext
  tools: async ({ runtimeContext }) => {
    const userId = runtimeContext.get('userId') as string;

    if (!userId) {
      console.error('[Email Sender Agent] No userId in RuntimeContext');
      return {};
    }

    console.log(`[Email Sender Agent] Loading tools for user: ${userId}`);

    // Get cached user tools (Composio integrations)
    // We only need Gmail tools, but loading all is fine (cached)
    return await getUserTools(userId);
  },
});
