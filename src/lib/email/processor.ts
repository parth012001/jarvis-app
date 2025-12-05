import { mastra } from '@/mastra';
import { RuntimeContext } from '@mastra/core/runtime-context';
import { db } from '@/lib/db';
import { emailDrafts, emails } from '@/lib/db/schema';
import { storeEmailEmbedding } from './embeddings';
import { buildEmailContext, formatContextForPrompt } from './context-builder';

/**
 * Email Processor
 *
 * Processes incoming emails and generates AI draft responses using Mastra agents.
 * This is called asynchronously from the Composio webhook handler.
 */

export interface IncomingEmail {
  messageId: string;
  threadId?: string;
  from: string;
  to?: string;
  subject: string;
  body: string;
  snippet?: string;
  receivedAt?: string;
  labels?: string[];
}

/**
 * Store an incoming email in the database for RAG
 *
 * This is called before draft generation. Storing emails enables
 * semantic search for context in future responses.
 *
 * @returns The stored email ID, or null if already exists
 */
async function storeEmail(
  userId: string,
  email: IncomingEmail
): Promise<string | null> {
  try {
    // Check if email already stored (idempotent)
    const existing = await db.query.emails.findFirst({
      where: (e, { and, eq }) =>
        and(eq(e.userId, userId), eq(e.messageId, email.messageId)),
    });

    if (existing) {
      console.log(`[EmailProcessor] Email already stored: ${email.messageId}`);
      return existing.id;
    }

    // Parse received date
    let receivedAt: Date | null = null;
    if (email.receivedAt) {
      const parsed = new Date(email.receivedAt);
      if (!isNaN(parsed.getTime())) {
        receivedAt = parsed;
      }
    }

    // Store the email
    const [stored] = await db.insert(emails).values({
      userId,
      messageId: email.messageId,
      threadId: email.threadId || null,
      fromAddress: email.from,
      toAddress: email.to || null,
      subject: email.subject || null,
      body: email.body || null,
      snippet: email.snippet || null,
      receivedAt,
      labels: email.labels || null,
    }).returning({ id: emails.id });

    console.log(`[EmailProcessor] Email stored: ${email.messageId} -> ${stored.id}`);

    // Generate and store embedding (async, non-blocking)
    storeEmailEmbedding(stored.id, userId, {
      from: email.from,
      subject: email.subject,
      body: email.body,
      messageId: email.messageId,
      threadId: email.threadId,
      receivedAt: email.receivedAt,
    }).catch((err) => {
      // Log but don't fail - embedding is enhancement
      console.error(`[EmailProcessor] Embedding failed:`, err);
    });

    return stored.id;
  } catch (error) {
    // Log but don't fail - storage is enhancement, not critical path
    console.error(`[EmailProcessor] Failed to store email:`, {
      error: error instanceof Error ? error.message : error,
      messageId: email.messageId,
    });
    return null;
  }
}

/**
 * Process an incoming email and generate an AI draft response
 *
 * @param userId - The user ID who received the email
 * @param email - The incoming email data
 */
export async function processEmailWithAgent(
  userId: string,
  email: IncomingEmail
): Promise<void> {
  console.log(`[EmailProcessor] Processing email for user ${userId}:`, {
    from: email.from,
    subject: email.subject,
    messageId: email.messageId,
  });

  try {
    // Step 1: Store email for RAG (idempotent - safe to call multiple times)
    await storeEmail(userId, email);

    // Step 2: Check if we already processed this email (avoid duplicates)
    const existingDraft = await db.query.emailDrafts.findFirst({
      where: (drafts, { and, eq }) =>
        and(
          eq(drafts.userId, userId),
          eq(drafts.originalEmailId, email.messageId)
        ),
    });

    if (existingDraft) {
      console.log(`[EmailProcessor] Draft already exists for email ${email.messageId}, skipping`);
      return;
    }

    // Get email drafter agent from Mastra instance
    const agent = mastra.getAgent('emailDrafterAgent');

    // Create RuntimeContext with userId for dynamic tool loading
    // and filter for email search (scopes searches to this user's emails)
    const runtimeContext = new RuntimeContext();
    runtimeContext.set('userId', userId);
    runtimeContext.set('filter', { userId });

    // Build context (thread history + sender history)
    console.log(`[EmailProcessor] Building context for email: ${email.subject}`);
    const context = await buildEmailContext(userId, email);
    console.log(`[EmailProcessor] Context built in ${context.metadata.contextBuildTimeMs}ms`, {
      threadEmails: context.metadata.threadEmailsLoaded,
      senderEmails: context.metadata.senderEmailsLoaded,
      tokenEstimate: context.metadata.tokenEstimate,
      truncated: context.metadata.truncated,
    });

    // Format context for prompt injection
    const contextSection = formatContextForPrompt(context);

    // Build the prompt with pre-loaded context
    const emailBody = email.body || email.snippet || '(No content)';
    const prompt = `You are drafting a reply to an incoming email. I have pre-loaded relevant context for you.

${contextSection}
=== INCOMING EMAIL (REPLY TO THIS) ===
From: ${email.from}
Subject: ${email.subject}

${emailBody}
---

Generate a professional and helpful reply. Consider the context above when crafting your response:
- If this is part of a thread, maintain continuity with previous messages
- If you've corresponded with this sender before, match the established tone
- Reference past conversations when relevant

You still have access to the searchEmails tool if you need additional context not provided above.

Remember to:
1. Match the appropriate tone
2. Be concise but complete
3. Include greeting and sign-off
4. Write as the person replying (first person)`;

    console.log(`[EmailProcessor] Generating draft for: ${email.subject}`);

    // Generate the draft response with RuntimeContext
    const response = await agent.generate(prompt, { runtimeContext });
    const draftContent = response.text;

    if (!draftContent || draftContent.trim().length === 0) {
      console.error(`[EmailProcessor] Empty draft generated for: ${email.subject}`);
      return;
    }

    // Extract sender email address from "Name <email>" format
    const senderEmail = extractEmailAddress(email.from);

    // Generate reply subject
    const replySubject = email.subject.startsWith('Re:')
      ? email.subject
      : `Re: ${email.subject}`;

    // Save the draft to database
    await db.insert(emailDrafts).values({
      userId,
      subject: replySubject,
      body: draftContent,
      recipient: senderEmail,
      originalEmailId: email.messageId,
      originalThreadId: email.threadId || null,
      status: 'pending',
    });

    console.log(`[EmailProcessor] Draft created successfully:`, {
      userId,
      recipient: senderEmail,
      subject: replySubject,
      originalEmailId: email.messageId,
    });
  } catch (error) {
    console.error(`[EmailProcessor] Failed to process email:`, {
      error: error instanceof Error ? error.message : error,
      userId,
      subject: email.subject,
      messageId: email.messageId,
    });

    // Don't re-throw - we don't want to crash the webhook handler
    // The email will just not have a draft generated
  }
}

/**
 * Extract email address from various formats
 *
 * Handles:
 * - "Display Name <email@domain.com>"
 * - "email@domain.com"
 * - "<email@domain.com>"
 */
function extractEmailAddress(fromString: string): string {
  if (!fromString) return 'unknown@unknown.com';

  // Try to match email in angle brackets
  const bracketMatch = fromString.match(/<([^>]+)>/);
  if (bracketMatch) {
    return bracketMatch[1].trim();
  }

  // Try to match just an email address
  const emailMatch = fromString.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) {
    return emailMatch[0].trim();
  }

  // Return as-is if nothing matches
  return fromString.trim();
}

/**
 * Extract display name from email string
 *
 * @param fromString - Email string like "John Doe <john@example.com>"
 * @returns Display name or email if no name found
 */
export function extractDisplayName(fromString: string): string {
  if (!fromString) return 'Unknown';

  // Try to extract name before angle brackets
  const nameMatch = fromString.match(/^([^<]+)</);
  if (nameMatch) {
    return nameMatch[1].trim().replace(/"/g, '');
  }

  // Return the email address if no name
  return extractEmailAddress(fromString);
}
