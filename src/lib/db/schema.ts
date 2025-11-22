import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
 * - Hyperspell: Manages OAuth tokens on their servers, we only track status
 * - Composio: Returns connectedAccountId, manages tokens on their servers
 */
export const integrations = pgTable('integrations', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), // 'hyperspell' or 'composio'
  connectedAccountId: text('connected_account_id'), // For Composio only
  status: text('status').notNull().default('pending'), // 'pending' or 'connected'
  connectedAt: timestamp('connected_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Type exports for TypeScript
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;
