/**
 * Email Context Builder
 *
 * Pre-loads deterministic context for email draft generation:
 * 1. Thread History - All previous emails in the same thread
 * 2. Sender History - Recent emails from the same sender
 *
 * This ensures the agent always has critical context, rather than
 * relying on the agent to search for it.
 */

import { db } from '@/lib/db';
import { emails } from '@/lib/db/schema';
import { eq, and, desc, ne, sql, lt, or, isNull } from 'drizzle-orm';
import type { IncomingEmail } from './processor';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Simplified email representation for LLM consumption
 */
export interface ContextEmail {
  id: string;
  messageId: string;
  from: string;
  fromEmail: string;
  to: string | null;
  subject: string;
  body: string | null;
  snippet: string | null;
  receivedAt: Date | null;
  isCurrentEmail: boolean;
}

/**
 * Thread context - all emails in the same conversation
 */
export interface ThreadContext {
  threadId: string;
  emailCount: number;
  emails: ContextEmail[];
}

/**
 * Sender context - recent emails from the same sender
 */
export interface SenderContext {
  senderEmail: string;
  senderName: string;
  emailCount: number;
  emails: ContextEmail[];
}

/**
 * Complete pre-loaded context for email drafting
 */
export interface EmailContext {
  incomingEmail: ContextEmail;
  thread: ThreadContext | null;
  senderHistory: SenderContext | null;
  metadata: {
    contextBuildTimeMs: number;
    threadEmailsLoaded: number;
    senderEmailsLoaded: number;
    tokenEstimate: number;
    truncated: boolean;
  };
}

/**
 * Configuration for context building
 */
export interface ContextBuilderConfig {
  maxThreadEmails: number;
  maxSenderEmails: number;
  senderLookbackDays: number;
  totalTokenBudget: number;
  threadPriority: boolean;
}

/**
 * Default configuration (based on user preferences)
 */
export const DEFAULT_CONTEXT_CONFIG: ContextBuilderConfig = {
  maxThreadEmails: 10,
  maxSenderEmails: 5,
  senderLookbackDays: 30,
  totalTokenBudget: 8000,
  threadPriority: true,
};

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Build context for an incoming email
 *
 * @param userId - The user who received the email
 * @param incomingEmail - The email being replied to
 * @param config - Optional configuration overrides
 * @returns Complete email context for the agent
 */
export async function buildEmailContext(
  userId: string,
  incomingEmail: IncomingEmail,
  config: Partial<ContextBuilderConfig> = {}
): Promise<EmailContext> {
  const startTime = Date.now();
  const cfg = { ...DEFAULT_CONTEXT_CONFIG, ...config };

  // Normalize sender email for consistent matching
  const senderEmail = extractEmailAddress(incomingEmail.from);

  // Run both queries in parallel for performance
  const [threadEmails, senderEmails] = await Promise.all([
    incomingEmail.threadId
      ? fetchThreadEmails(userId, incomingEmail.threadId, incomingEmail.messageId, cfg).catch(
          (err) => {
            console.error('[ContextBuilder] Thread fetch failed:', err);
            return [];
          }
        )
      : Promise.resolve([]),
    fetchSenderEmails(userId, senderEmail, incomingEmail.messageId, cfg).catch((err) => {
      console.error('[ContextBuilder] Sender fetch failed:', err);
      return [];
    }),
  ]);

  // Build the incoming email context object
  const incomingContext = mapIncomingToContextEmail(incomingEmail);

  // Build thread context
  const threadContext = buildThreadContext(incomingEmail.threadId, threadEmails);

  // Build sender context (excluding emails already in thread)
  const threadMessageIds = new Set(threadEmails.map((e) => e.messageId));
  const nonThreadSenderEmails = senderEmails.filter((e) => !threadMessageIds.has(e.messageId));
  const senderContext = buildSenderContext(senderEmail, incomingEmail.from, nonThreadSenderEmails);

  // Calculate tokens and apply truncation if needed
  const { tokenEstimate, truncated, thread, sender } = applyTokenBudget(
    threadContext,
    senderContext,
    cfg
  );

  return {
    incomingEmail: incomingContext,
    thread: thread,
    senderHistory: sender,
    metadata: {
      contextBuildTimeMs: Date.now() - startTime,
      threadEmailsLoaded: threadEmails.length,
      senderEmailsLoaded: nonThreadSenderEmails.length,
      tokenEstimate,
      truncated,
    },
  };
}

// ============================================================================
// DATABASE QUERIES
// ============================================================================

/**
 * Fetch all emails in a thread (excluding the current email)
 */
async function fetchThreadEmails(
  userId: string,
  threadId: string,
  excludeMessageId: string,
  config: ContextBuilderConfig
): Promise<ContextEmail[]> {
  const threadEmails = await db.query.emails.findMany({
    where: and(
      eq(emails.userId, userId),
      eq(emails.threadId, threadId),
      ne(emails.messageId, excludeMessageId)
    ),
    orderBy: [emails.receivedAt], // Chronological order (oldest first)
    limit: config.maxThreadEmails + 2, // Fetch extra for potential filtering
  });

  return threadEmails.map((e) => mapDbEmailToContextEmail(e));
}

/**
 * Fetch recent emails from the same sender
 */
async function fetchSenderEmails(
  userId: string,
  senderEmail: string,
  excludeMessageId: string,
  config: ContextBuilderConfig
): Promise<ContextEmail[]> {
  const lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - config.senderLookbackDays);

  // Use case-insensitive LIKE for email matching
  // This handles "John Smith <john@example.com>" containing "john@example.com"
  const senderEmails = await db.query.emails.findMany({
    where: and(
      eq(emails.userId, userId),
      sql`LOWER(${emails.fromAddress}) LIKE LOWER(${'%' + senderEmail + '%'})`,
      ne(emails.messageId, excludeMessageId),
      or(lt(emails.receivedAt, new Date()), isNull(emails.receivedAt))
    ),
    orderBy: [desc(emails.receivedAt)], // Most recent first
    limit: config.maxSenderEmails,
  });

  return senderEmails.map((e) => mapDbEmailToContextEmail(e));
}

// ============================================================================
// CONTEXT BUILDERS
// ============================================================================

/**
 * Build thread context from fetched emails
 */
function buildThreadContext(
  threadId: string | undefined,
  threadEmails: ContextEmail[]
): ThreadContext | null {
  if (!threadId || threadEmails.length === 0) {
    return null;
  }

  return {
    threadId,
    emailCount: threadEmails.length,
    emails: threadEmails,
  };
}

/**
 * Build sender context from fetched emails
 */
function buildSenderContext(
  senderEmail: string,
  senderFullString: string,
  senderEmails: ContextEmail[]
): SenderContext | null {
  if (senderEmails.length === 0) {
    return null;
  }

  return {
    senderEmail,
    senderName: extractDisplayName(senderFullString),
    emailCount: senderEmails.length,
    emails: senderEmails,
  };
}

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

/**
 * Estimate tokens for a string (rough approximation: ~4 chars per token)
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Estimate tokens for a context email
 */
function estimateEmailTokens(email: ContextEmail): number {
  const content = [
    `From: ${email.from}`,
    `Subject: ${email.subject}`,
    email.body || email.snippet || '',
  ].join('\n');
  return estimateTokens(content);
}

/**
 * Apply token budget, truncating if necessary
 */
function applyTokenBudget(
  threadContext: ThreadContext | null,
  senderContext: SenderContext | null,
  config: ContextBuilderConfig
): {
  tokenEstimate: number;
  truncated: boolean;
  thread: ThreadContext | null;
  sender: SenderContext | null;
} {
  // Budget allocation (based on user preference: 8000 total)
  const THREAD_BUDGET = 5000;
  const SENDER_BUDGET = 2000;
  const RESERVE = 1000; // For prompt template

  let totalTokens = 0;
  let truncated = false;

  // Process thread context (priority)
  let truncatedThread = threadContext;
  if (threadContext) {
    let threadTokens = 0;
    const includedEmails: ContextEmail[] = [];

    // Include emails until we hit the budget (most recent first for threads)
    // We reverse because we want to keep the most recent, but display chronologically
    const reversedEmails = [...threadContext.emails].reverse();

    for (const email of reversedEmails) {
      const emailTokens = estimateEmailTokens(email);
      if (threadTokens + emailTokens <= THREAD_BUDGET) {
        includedEmails.unshift(email); // Add to front to maintain chronological order
        threadTokens += emailTokens;
      } else {
        truncated = true;
      }
    }

    if (includedEmails.length > 0) {
      truncatedThread = {
        ...threadContext,
        emailCount: includedEmails.length,
        emails: includedEmails,
      };
      totalTokens += threadTokens;
    } else {
      truncatedThread = null;
    }
  }

  // Process sender context (if budget remains)
  let truncatedSender = senderContext;
  const remainingBudget = config.totalTokenBudget - totalTokens - RESERVE;

  if (senderContext && remainingBudget > 0) {
    let senderTokens = 0;
    const includedEmails: ContextEmail[] = [];

    for (const email of senderContext.emails) {
      const emailTokens = estimateEmailTokens(email);
      if (senderTokens + emailTokens <= Math.min(SENDER_BUDGET, remainingBudget)) {
        includedEmails.push(email);
        senderTokens += emailTokens;
      } else {
        truncated = true;
      }
    }

    if (includedEmails.length > 0) {
      truncatedSender = {
        ...senderContext,
        emailCount: includedEmails.length,
        emails: includedEmails,
      };
      totalTokens += senderTokens;
    } else {
      truncatedSender = null;
    }
  } else if (senderContext) {
    // No budget for sender - truncate entirely
    truncatedSender = null;
    truncated = true;
  }

  return {
    tokenEstimate: totalTokens,
    truncated,
    thread: truncatedThread,
    sender: truncatedSender,
  };
}

// ============================================================================
// FORMATTERS
// ============================================================================

/**
 * Format context for LLM prompt injection
 */
export function formatContextForPrompt(context: EmailContext): string {
  const parts: string[] = [];

  // Thread context
  if (context.thread && context.thread.emails.length > 0) {
    parts.push('=== THREAD HISTORY ===');
    parts.push(
      `This email is part of a conversation with ${context.thread.emailCount} previous message${context.thread.emailCount > 1 ? 's' : ''}.`
    );
    parts.push('');

    for (const email of context.thread.emails) {
      parts.push(`--- Previous Email ---`);
      parts.push(`From: ${email.from}`);
      parts.push(`Subject: ${email.subject}`);
      if (email.receivedAt) {
        parts.push(`Date: ${formatDate(email.receivedAt)}`);
      }
      parts.push('');
      parts.push(email.body || email.snippet || '(No content)');
      parts.push('');
    }
  }

  // Sender history (non-thread emails)
  if (context.senderHistory && context.senderHistory.emails.length > 0) {
    parts.push('=== OTHER EMAILS FROM THIS SENDER ===');
    parts.push(
      `You have ${context.senderHistory.emailCount} other email${context.senderHistory.emailCount > 1 ? 's' : ''} from ${context.senderHistory.senderName} (not in this thread).`
    );
    parts.push('');

    for (const email of context.senderHistory.emails.slice(0, 3)) {
      parts.push(
        `- "${email.subject}" (${email.receivedAt ? formatDate(email.receivedAt) : 'unknown date'})`
      );
      if (email.snippet) {
        parts.push(`  Preview: ${email.snippet.substring(0, 100)}...`);
      }
    }
    parts.push('');
  }

  // First-time sender note
  if (!context.thread && !context.senderHistory) {
    parts.push('NOTE: This appears to be the first email from this sender.');
    parts.push('');
  }

  // Metadata note if truncated
  if (context.metadata.truncated) {
    parts.push(
      `[Context truncated to fit token budget. ${context.metadata.threadEmailsLoaded} thread emails, ${context.metadata.senderEmailsLoaded} sender emails available.]`
    );
    parts.push('');
  }

  return parts.join('\n');
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Map incoming email to context email format
 */
function mapIncomingToContextEmail(email: IncomingEmail): ContextEmail {
  return {
    id: '', // Not stored yet
    messageId: email.messageId,
    from: email.from,
    fromEmail: extractEmailAddress(email.from),
    to: email.to || null,
    subject: email.subject,
    body: email.body,
    snippet: email.snippet || null,
    receivedAt: email.receivedAt ? new Date(email.receivedAt) : null,
    isCurrentEmail: true,
  };
}

/**
 * Map database email to context email format
 */
function mapDbEmailToContextEmail(
  email: typeof emails.$inferSelect
): ContextEmail {
  return {
    id: email.id,
    messageId: email.messageId,
    from: email.fromAddress,
    fromEmail: extractEmailAddress(email.fromAddress),
    to: email.toAddress,
    subject: email.subject || '(No subject)',
    body: email.body,
    snippet: email.snippet,
    receivedAt: email.receivedAt,
    isCurrentEmail: false,
  };
}

/**
 * Extract email address from various formats
 */
function extractEmailAddress(fromString: string): string {
  if (!fromString) return 'unknown@unknown.com';

  const bracketMatch = fromString.match(/<([^>]+)>/);
  if (bracketMatch) {
    return bracketMatch[1].trim().toLowerCase();
  }

  const emailMatch = fromString.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) {
    return emailMatch[0].trim().toLowerCase();
  }

  return fromString.trim().toLowerCase();
}

/**
 * Extract display name from email string
 */
function extractDisplayName(fromString: string): string {
  if (!fromString) return 'Unknown';

  const nameMatch = fromString.match(/^([^<]+)</);
  if (nameMatch) {
    return nameMatch[1].trim().replace(/"/g, '');
  }

  return extractEmailAddress(fromString);
}

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `Today at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  } else if (diffDays === 1) {
    return `Yesterday at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  } else if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' });
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  }
}
