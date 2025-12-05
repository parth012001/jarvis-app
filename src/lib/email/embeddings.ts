/**
 * Email Embeddings Service
 *
 * Handles generating and storing embeddings for emails.
 * Uses the centralized PgVector instance from Mastra for storage.
 *
 * Note: Search functionality is now handled by createVectorQueryTool
 * in src/mastra/tools/email-search.ts - this file only handles storage.
 */
import { pgVector } from '@/mastra';
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';

// Constants
const INDEX_NAME = 'email_embeddings';
const EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * Prepare email content for embedding
 * Combines subject, from, and body into a single string
 */
function prepareEmailContent(email: {
  from: string;
  subject: string;
  body: string;
}): string {
  // Combine key fields into searchable content
  // Format: "From: sender\nSubject: subject\n\nbody"
  const parts = [];

  if (email.from) {
    parts.push(`From: ${email.from}`);
  }
  if (email.subject) {
    parts.push(`Subject: ${email.subject}`);
  }
  if (email.body) {
    parts.push('', email.body); // Empty string adds newline separator
  }

  return parts.join('\n').trim();
}

/**
 * Generate embedding for email content
 */
async function generateEmbedding(content: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding(EMBEDDING_MODEL),
    value: content,
  });
  return embedding;
}

/**
 * Store email embedding in vector database
 *
 * Uses the centralized PgVector instance from Mastra.
 * Called when new emails arrive via webhook.
 *
 * @param emailId - UUID from emails table
 * @param userId - User ID who owns the email
 * @param email - Email content for embedding
 */
export async function storeEmailEmbedding(
  emailId: string,
  userId: string,
  email: {
    from: string;
    subject: string;
    body: string;
    messageId: string;
    threadId?: string;
    receivedAt?: string;
  }
): Promise<void> {
  try {
    // Prepare content for embedding
    const content = prepareEmailContent(email);

    if (!content || content.length < 10) {
      console.log(`[Embeddings] Skipping empty/short email: ${emailId}`);
      return;
    }

    console.log(`[Embeddings] Generating embedding for email: ${emailId}`);

    // Generate embedding
    const embedding = await generateEmbedding(content);

    // Store in vector DB with metadata
    // The userId is stored in metadata for filtering during search
    await pgVector.upsert({
      indexName: INDEX_NAME,
      vectors: [embedding],
      metadata: [
        {
          emailId,
          userId,
          messageId: email.messageId,
          threadId: email.threadId || null,
          from: email.from,
          subject: email.subject,
          receivedAt: email.receivedAt || null,
          // Store a snippet for retrieval display (first 200 chars)
          snippet: content.substring(0, 200),
        },
      ],
    });

    console.log(`[Embeddings] Stored embedding for email: ${emailId}`);
  } catch (error) {
    // Log but don't fail - embeddings are enhancement
    console.error(`[Embeddings] Failed to store embedding:`, {
      error: error instanceof Error ? error.message : error,
      emailId,
    });
  }
}
