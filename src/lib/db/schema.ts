import { pgTable, text, timestamp, uuid, index, unique, jsonb, pgEnum } from 'drizzle-orm/pg-core';

/**
 * Users table - synced from Clerk via webhooks
 */
export const users = pgTable('users', {
  id: text('id').primaryKey(), // Clerk user ID
  email: text('email').notNull().unique(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  imageUrl: text('image_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Integrations table - tracks Composio connections per user
 *
 * Composio: Multiple app connections (Gmail, Calendar, Slack, etc.)
 * Each app gets its own connectedAccountId from Composio
 */
export const integrations = pgTable('integrations', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), // 'composio'
  appName: text('app_name'), // 'gmail', 'googlecalendar', 'slack', 'notion', 'github'
  connectedAccountId: text('connected_account_id'), // Unique ID per app connection from Composio
  status: text('status').notNull().default('pending'), // 'pending', 'connected', or 'error'
  connectedAt: timestamp('connected_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  // Ensure one connection per user+provider+app combination
  uniqueUserProviderApp: unique().on(table.userId, table.provider, table.appName),
  // Index for fast lookups by user
  userIdIdx: index('integrations_user_id_idx').on(table.userId),
  // Index for finding user's connected apps
  userProviderStatusIdx: index('integrations_user_provider_status_idx').on(table.userId, table.provider, table.status),
}));

// ============================================================================
// CONVERSATIONS & MESSAGES
// ============================================================================

/**
 * Message role enum - matches AI SDK conventions
 */
export const messageRoleEnum = pgEnum('message_role', ['user', 'assistant', 'system', 'tool']);

/**
 * Conversations table - groups messages into threads
 *
 * Each conversation belongs to a user and represents a chat session.
 * Maps to Mastra Memory's "thread" concept.
 */
export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title'), // Auto-generated or user-defined title
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  // Fast lookup of user's conversations
  userIdIdx: index('conversations_user_id_idx').on(table.userId),
  // Sort by most recent
  userIdUpdatedAtIdx: index('conversations_user_updated_idx').on(table.userId, table.updatedAt),
}));

/**
 * Messages table - individual messages within a conversation
 *
 * Stores all message types: user input, assistant responses, tool calls/results.
 * Designed to be compatible with AI SDK message format.
 */
export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: messageRoleEnum('role').notNull(),
  content: text('content'), // Text content (may be null for tool-only messages)
  // Tool call information (for assistant messages that invoke tools)
  toolCalls: jsonb('tool_calls').$type<Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>>(),
  // Tool result (for tool messages responding to a tool call)
  toolCallId: text('tool_call_id'), // References the tool call this is responding to
  toolName: text('tool_name'),
  toolResult: jsonb('tool_result').$type<unknown>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  // Fast lookup of messages in a conversation
  conversationIdIdx: index('messages_conversation_id_idx').on(table.conversationId),
  // Ordered retrieval within a conversation
  conversationIdCreatedAtIdx: index('messages_conversation_created_idx').on(table.conversationId, table.createdAt),
}));

// ============================================================================
// EMAIL DRAFTS (for human-in-the-loop email approval)
// ============================================================================

/**
 * Email draft status enum
 */
export const emailDraftStatusEnum = pgEnum('email_draft_status', [
  'pending',    // Awaiting user review
  'approved',   // User approved, ready to send
  'sent',       // Successfully sent
  'rejected',   // User rejected the draft
  'revised',    // User requested revisions
]);

/**
 * Email drafts table - stores AI-generated email drafts pending approval
 *
 * This is the core of the human-in-the-loop email workflow.
 * Drafts are created by the agent and require user approval before sending.
 */
export const emailDrafts = pgTable('email_drafts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id')
    .references(() => conversations.id, { onDelete: 'set null' }), // Optional: which chat created this

  // Email metadata
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  recipient: text('recipient').notNull(), // To: email address
  cc: text('cc'), // CC addresses (comma-separated)
  bcc: text('bcc'), // BCC addresses (comma-separated)

  // Context from original email (if this is a reply)
  originalEmailId: text('original_email_id'), // Gmail message ID if replying
  originalThreadId: text('original_thread_id'), // Gmail thread ID

  // Status tracking
  status: emailDraftStatusEnum('status').notNull().default('pending'),

  // User feedback (when rejected/revised)
  userFeedback: text('user_feedback'),

  // Composio draft ID (after creating in Gmail)
  composioDraftId: text('composio_draft_id'),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  sentAt: timestamp('sent_at'), // When actually sent
}, (table) => ({
  // User's drafts lookup
  userIdIdx: index('email_drafts_user_id_idx').on(table.userId),
  // Filter by status (pending drafts for approval UI)
  userIdStatusIdx: index('email_drafts_user_status_idx').on(table.userId, table.status),
  // Find drafts for a conversation
  conversationIdIdx: index('email_drafts_conversation_id_idx').on(table.conversationId),
}));

// ============================================================================
// EMAIL TRIGGERS (Composio webhook subscriptions)
// ============================================================================

/**
 * Email trigger status enum
 */
export const emailTriggerStatusEnum = pgEnum('email_trigger_status', [
  'active',   // Trigger is active and receiving events
  'paused',   // Temporarily paused
  'error',    // Trigger encountered an error
]);

/**
 * Email triggers table - tracks per-user Composio trigger subscriptions
 *
 * Each user can have one Gmail trigger that notifies our webhook
 * when new emails arrive. The triggerId is used to map incoming
 * webhook events back to the correct user.
 */
export const emailTriggers = pgTable('email_triggers', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  triggerId: text('trigger_id').notNull().unique(), // Composio trigger ID
  connectedAccountId: text('connected_account_id').notNull(), // Gmail connection ID
  status: emailTriggerStatusEnum('status').notNull().default('active'),
  lastTriggeredAt: timestamp('last_triggered_at'), // Last webhook received
  errorMessage: text('error_message'), // Error details if status is 'error'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  // One trigger per user
  uniqueUserTrigger: unique().on(table.userId),
  // Fast lookup by user
  userIdIdx: index('email_triggers_user_id_idx').on(table.userId),
  // Fast lookup by triggerId (for webhook routing)
  triggerIdIdx: index('email_triggers_trigger_id_idx').on(table.triggerId),
}));

// ============================================================================
// EMAILS (stored for RAG context)
// ============================================================================

/**
 * Emails table - stores incoming emails for semantic search
 *
 * Emails are stored when received via Composio webhook.
 * This enables RAG: the agent can search past emails for context
 * when drafting responses.
 *
 * Note: Embedding column will be added in Step 2 once storage is verified.
 */
export const emails = pgTable('emails', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  messageId: text('message_id').notNull(),      // Gmail's unique message ID
  threadId: text('thread_id'),                   // Gmail's thread ID
  fromAddress: text('from_address').notNull(),
  toAddress: text('to_address'),
  subject: text('subject'),
  body: text('body'),                            // Full email content
  snippet: text('snippet'),                      // Short preview
  receivedAt: timestamp('received_at'),
  labels: text('labels').array(),                // Gmail labels
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  // Prevent duplicate emails per user
  uniqueUserMessage: unique().on(table.userId, table.messageId),
  // Fast user lookups
  userIdIdx: index('emails_user_id_idx').on(table.userId),
  // Chronological sorting
  userReceivedIdx: index('emails_user_received_idx').on(table.userId, table.receivedAt),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

// User types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// Integration types
export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;

// Conversation types
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

// Message types
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

// Email draft types
export type EmailDraft = typeof emailDrafts.$inferSelect;
export type NewEmailDraft = typeof emailDrafts.$inferInsert;

// Email trigger types
export type EmailTrigger = typeof emailTriggers.$inferSelect;
export type NewEmailTrigger = typeof emailTriggers.$inferInsert;

// Email types (for RAG)
export type Email = typeof emails.$inferSelect;
export type NewEmail = typeof emails.$inferInsert;
