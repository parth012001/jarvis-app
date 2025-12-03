import { createUserAgent } from '@/lib/mastra/agent-factory';
import { db } from '@/lib/db';
import { emailDrafts, emails } from '@/lib/db/schema';

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

    // Create a specialized email drafting agent
    const agent = await createUserAgent(userId, {
      name: 'Email Draft Assistant',
      instructions: `You are an email assistant. Your job is to draft professional, helpful responses to incoming emails.

Instructions:
- Analyze the email content and generate an appropriate reply
- Be concise but thorough
- Match the tone of the original email (formal/casual)
- Include an appropriate greeting and sign-off
- Generate ONLY the email body - no "Subject:" line
- Do not include phrases like "Here's a draft response:"
- Write as if you ARE the person replying

If the email is:
- A newsletter/promotional: Generate a brief acknowledgment or suggest unsubscribing
- A meeting request: Confirm availability or ask for alternatives
- A question: Provide a helpful answer
- A notification: Acknowledge receipt appropriately
- Spam/irrelevant: Generate a polite decline or suggest marking as spam`,
    });

    // Build the prompt with email context
    const emailBody = email.body || email.snippet || '(No content)';
    const prompt = `Please draft a response to this incoming email:

From: ${email.from}
Subject: ${email.subject}

Email Content:
---
${emailBody}
---

Generate a professional and helpful reply. Remember to:
1. Match the appropriate tone
2. Be concise but complete
3. Include greeting and sign-off
4. Write as the person replying (first person)`;

    console.log(`[EmailProcessor] Generating draft for: ${email.subject}`);

    // Generate the draft response
    const response = await agent.generate(prompt);
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
