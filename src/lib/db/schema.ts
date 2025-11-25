import { pgTable, text, timestamp, uuid, index, unique } from 'drizzle-orm/pg-core';

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
 * Integrations table - tracks Hyperspell and Composio connections per user
 *
 * - Hyperspell: Single connection, manages OAuth tokens on their servers
 * - Composio: Multiple app connections (Gmail, Calendar, Slack, etc.)
 *   Each app gets its own connectedAccountId from Composio
 *
 * Schema supports:
 * - One Hyperspell connection per user (provider='hyperspell', appName=null)
 * - Multiple Composio app connections per user (provider='composio', appName='gmail'|'googlecalendar'|etc)
 */
export const integrations = pgTable('integrations', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), // 'hyperspell' or 'composio'
  appName: text('app_name'), // For Composio: 'gmail', 'googlecalendar', 'slack', etc. Null for Hyperspell
  connectedAccountId: text('connected_account_id'), // For Composio: unique ID per app connection
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

// Type exports for TypeScript
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;
