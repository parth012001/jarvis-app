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
1. You will receive email details and which tool to use
2. Call the specified tool with ONLY the parameters mentioned
3. Do NOT modify the content in any way
4. Confirm when the email is sent successfully
5. Report any errors clearly if sending fails

CRITICAL RULES for tool parameters:
- For GMAIL_REPLY_TO_THREAD: ONLY pass thread_id, recipient_email, and message_body
  - Do NOT pass subject (replies inherit the thread subject automatically)
  - Do NOT pass attachment, cc, bcc, or any other optional parameters
- For GMAIL_SEND_EMAIL: Pass recipient_email, subject, and message_body
  - Do NOT pass attachment, cc, bcc unless explicitly requested
- NEVER pass empty strings or null values for optional parameters
- If a parameter is not needed, simply omit it entirely

Rules:
- NEVER edit, draft, or suggest changes to the email
- NEVER ask for confirmation - the email is already approved
- JUST SEND using the provided details
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
