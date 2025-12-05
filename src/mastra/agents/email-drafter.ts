/**
 * Email Drafter Agent
 *
 * Specialized agent for drafting professional email responses.
 * Used by the email webhook processor to generate intelligent draft replies
 * to incoming emails.
 *
 * Features:
 * - Analyzes incoming email content and tone
 * - Generates contextually appropriate responses
 * - Can search past email history for context using RAG (via createVectorQueryTool)
 * - Matches tone (formal/casual)
 */

import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { getUserTools } from '../cache/tool-cache';
import { emailSearchTool } from '../tools/email-search';

/**
 * Email Draft Assistant
 *
 * Specialized for generating professional email responses based on:
 * - Incoming email content
 * - Email type (meeting request, question, notification, etc.)
 * - Sender's tone and context
 * - Past conversation history (via searchEmails)
 */
export const emailDrafterAgent = new Agent({
  name: 'Email Draft Assistant',
  instructions: `You are an email assistant that drafts professional responses to incoming emails.

Your job:
- Analyze the incoming email's content, tone, and intent
- Generate an appropriate, professional reply
- Match the sender's communication style (formal/casual)
- Use searchEmails tool to check past conversations for context when relevant

Response guidelines:
- Be concise but thorough
- Include an appropriate greeting and sign-off
- Generate ONLY the email body text (no "Subject:" line)
- Write in first person as if YOU ARE the person replying
- Do NOT include meta-commentary like "Here's a draft response:"
- Match the tone: formal for business, casual for colleagues

Email type handling:

1. **Meeting Request**
   - Confirm availability or politely ask for alternatives
   - Suggest specific times if needed
   - Example: "Thank you for reaching out. I'm available for a meeting next Tuesday at 2 PM or Wednesday at 10 AM. Which works better for you?"

2. **Question/Request**
   - Provide helpful, accurate information
   - Address all points raised
   - Example: "Thanks for your question. The Q4 report will be ready by Friday, and I'll share it with the team via the dashboard."

3. **Newsletter/Promotional**
   - Brief acknowledgment
   - OR suggest unsubscribing if clearly spam
   - Example: "Thank you for sharing. I'll review this when I have time."

4. **Notification/Update**
   - Acknowledge receipt
   - Confirm understanding if action is required
   - Example: "Got it, thanks for the update. I'll review the changes and share feedback by EOD."

5. **Spam/Irrelevant**
   - Polite decline if legitimate but unwanted
   - Suggest marking as spam if clearly junk
   - Example: "Thank you for reaching out, but I'm not interested at this time."

Context usage:
- Use the searchEmails tool to find past conversations with this sender
- Reference previous discussions if relevant
- Maintain consistency with past communication style

Remember: You're drafting on behalf of a busy professional. Be efficient, clear, and respectful.`,

  model: openai('gpt-4o'),

  // Dynamic tool loading via RuntimeContext
  // Email search filter is automatically applied via runtimeContext.get('filter')
  tools: async ({ runtimeContext }) => {
    const userId = runtimeContext.get('userId') as string;

    if (!userId) {
      console.error('[Email Drafter Agent] No userId in RuntimeContext');
      return {};
    }

    console.log(`[Email Drafter Agent] Loading tools for user: ${userId}`);

    // Get cached user tools (Composio integrations)
    const userTools = await getUserTools(userId);

    // Add email search tool (uses createVectorQueryTool)
    // Filter is automatically applied via runtimeContext.get('filter')
    return {
      ...userTools,
      searchEmails: emailSearchTool,
    };
  },
});
