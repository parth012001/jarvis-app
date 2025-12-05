# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Jarvis** is an AI Chief of Staff - a personal AI assistant that can take real actions on your behalf across connected apps (Gmail, Calendar, Slack, Notion, GitHub). Built with Next.js 16, TypeScript, Mastra AI framework, and Composio for tool execution.

## Current Project State

### What's Working
- **Authentication**: Clerk sign-in/sign-up with webhook sync to database
- **Database**: Users, Integrations, Emails, EmailDrafts, EmailTriggers, Conversations, Messages tables with Drizzle ORM + Neon PostgreSQL
- **Composio OAuth**: Connect Gmail, Calendar, Slack, Notion, GitHub via popup flow with polling
- **Onboarding UI**: Integration cards with progress bars, connect/disconnect functionality
- **Mastra Instance**: Centralized agent registry with three specialized agents (chat, email drafter, email sender)
- **Tool Caching**: 5-minute TTL cache for Composio tools, reduces DB queries by ~80%
- **Email Intelligence**: Webhook-driven email processing with AI draft generation
- **Email RAG**: Vector embeddings with PgVector for semantic email search
- **Chat UI**: Message input, message list, message bubbles with tool call badges
- **Chat Backend**: `chat.sendMessage` tRPC mutation using centralized Mastra agents

### What's Missing
- **Conversation History**: Messages are not persisted to database
- **Streaming Responses**: Currently request/response, not streamed
- **Navigation/Sidebar**: No main navigation menu
- **Settings Page**: No user preferences
- **Multiple Conversations**: Only one chat thread

### Known Issues
- `src/lib/composio/client.ts:24` has a TypeScript error with MastraProvider types (pre-existing)
- Build may fail due to this type mismatch

## File Structure

```
src/
├── app/
│   ├── page.tsx                           # Landing page (public)
│   ├── dashboard/
│   │   ├── page.tsx                       # Dashboard home
│   │   ├── layout.tsx                     # Dashboard layout with navbar
│   │   ├── chat/page.tsx                  # Chat interface
│   │   └── onboarding/page.tsx            # Integration setup
│   └── api/
│       ├── trpc/[trpc]/route.ts           # tRPC handler
│       ├── webhooks/
│       │   ├── clerk/route.ts             # User sync webhook
│       │   └── composio/route.ts          # Gmail email webhook handler
│       └── integrations/composio/         # OAuth endpoints
│
├── lib/
│   ├── trpc/
│   │   ├── router.ts                      # Main router (user, integrations, chat, drafts)
│   │   ├── init.ts                        # tRPC setup, publicProcedure, protectedProcedure
│   │   ├── context.ts                     # Request context (userId, db)
│   │   └── routers/
│   │       ├── user.ts                    # user.me
│   │       ├── integrations.ts            # list, disconnect, initiateComposioConnection, pollComposioConnection
│   │       ├── chat.ts                    # sendMessage (uses mastra.getAgent)
│   │       └── drafts.ts                  # list, getById, update, send, reject
│   ├── composio/
│   │   ├── client.ts                      # Composio SDK wrapper, getComposioTools, initiateComposioConnection
│   │   └── triggers.ts                    # Gmail trigger management
│   ├── mastra/agent-factory.ts            # getUserComposioIntegrations, getUserAvailableApps (utility functions only)
│   ├── email/
│   │   ├── processor.ts                   # Webhook email processing with AI draft generation
│   │   └── embeddings.ts                  # PgVector email embeddings for RAG
│   └── db/
│       ├── schema.ts                      # users, integrations, emails, emailDrafts, emailTriggers, conversations, messages
│       └── index.ts                       # Drizzle client
│
├── mastra/                                # Centralized Mastra instance (NEW)
│   ├── index.ts                           # Main Mastra instance export
│   ├── agents/
│   │   ├── chat-agent.ts                  # General chat agent with Composio tools
│   │   ├── email-drafter.ts               # Email response drafting agent
│   │   └── email-sender.ts                # Email sending agent (GPT-4o-mini)
│   ├── cache/
│   │   └── tool-cache.ts                  # 5-min TTL cache for Composio tools
│   └── tools/
│       └── email-search.ts                # RAG email search tool for agents
│
├── components/
│   ├── chat/
│   │   ├── message-input.tsx              # Text input with send button
│   │   ├── message-list.tsx               # Message container with auto-scroll
│   │   └── message-bubble.tsx             # Individual message styling
│   └── onboarding/
│       └── integration-card.tsx           # OAuth connection card with progress
│
└── hooks/
    └── useComposioConnection.ts           # OAuth popup flow with polling
```

## Development Commands

```bash
npm run dev                    # Start dev server on http://localhost:3000
npm run build                  # Production build
npm run lint                   # Run ESLint

# Database
npm run db:generate            # Generate migration files
npm run db:migrate             # Run migrations
npm run db:push                # Push schema directly (dev only)
npm run db:studio              # Drizzle Studio on http://localhost:4983
npm run db:check               # Check DB connection
npm run db:sync                # Manually sync current user to DB
```

## Architecture

### Three-Layer Stack
1. **Frontend**: Next.js 16 + React 19, App Router, Tailwind CSS
2. **API**: tRPC v11 with React Query, Zod validation
3. **Database**: Drizzle ORM + Neon PostgreSQL (serverless)

### Authentication
- Clerk handles sign-in/sign-up
- Middleware protects routes except: `/`, `/sign-in`, `/sign-up`, `/api/webhooks`
- Clerk webhooks sync users to database
- User IDs are Clerk IDs (primary key in users table)

### Database Schema

**users** table:
- `id` (text, PK) - Clerk user ID
- `email`, `firstName`, `lastName`, `imageUrl`

**integrations** table:
- `id` (uuid, PK)
- `userId` (FK → users.id, cascade delete)
- `provider` ('composio')
- `appName` ('gmail'|'googlecalendar'|'slack'|'notion'|'github')
- `connectedAccountId` - OAuth connection ID from Composio
- `status` ('pending'|'connected'|'error')

**emails** table:
- `id` (uuid, PK)
- `userId` (FK → users.id, cascade delete)
- `messageId`, `threadId`, `fromAddress`, `toAddress`, `subject`, `body`, `snippet`
- `receivedAt`, `labels`
- Used for RAG email search with embeddings

**emailDrafts** table:
- `id` (uuid, PK)
- `userId` (FK → users.id, cascade delete)
- `subject`, `body`, `recipient`
- `originalEmailId`, `originalThreadId` - Links to triggering email
- `status` ('pending'|'approved'|'rejected'|'sent')
- `sentAt`, `feedback`

**emailTriggers** table:
- `id` (uuid, PK)
- `userId` (FK → users.id, cascade delete)
- `triggerId` - Composio trigger nano ID
- `connectedAccountId`, `appName`
- `status` ('active'|'inactive'), `lastTriggeredAt`

**conversations** table (not yet used):
- `id` (uuid, PK)
- `userId` (FK → users.id, cascade delete)
- `title` - For future multi-conversation support

**messages** table (not yet used):
- `id` (uuid, PK)
- `conversationId` (FK → conversations.id, cascade delete)
- `role` ('user'|'assistant'), `content`
- For future conversation history persistence

### Composio OAuth Flow
1. User clicks Connect → `useComposioConnection` hook calls tRPC
2. Backend creates pending integration, returns OAuth URL
3. Frontend opens popup window
4. Backend polls `waitForComposioConnection()` until ACTIVE/FAILED
5. Database updated, frontend receives result

### Mastra Agent System

**Centralized Instance Pattern** (refactored from per-request agent creation):
- Single Mastra instance (`src/mastra/index.ts`) registers all agents at startup
- Three specialized agents:
  - **chatAgent**: General conversation with Composio tools + email search
  - **emailDrafterAgent**: Drafts email responses (used by webhook processor)
  - **emailSenderAgent**: Sends approved emails (GPT-4o-mini for cost efficiency)

**Dynamic Tool Loading via RuntimeContext**:
- Tools loaded per-request based on userId, not at agent creation time
- Pattern: `runtimeContext.set('userId', userId)` → agent gets user-specific tools
- Enables single agent definition to serve all users

**Tool Caching** (`src/mastra/cache/tool-cache.ts`):
- 5-minute TTL in-memory cache for Composio tools
- Cache invalidated on integration connect/disconnect
- Reduces database queries by ~80% and improves response time

**Email RAG Tool** (`src/mastra/tools/email-search.ts`):
- Agents can explicitly search past emails using semantic search
- Uses PgVector embeddings stored in `email_embeddings` table
- Called via `searchEmails({ query, limit })` tool

**Usage Pattern**:
```typescript
import { mastra } from '@/mastra';
import { RuntimeContext } from '@mastra/core/runtime-context';

const agent = mastra.getAgent('chatAgent');
const runtimeContext = new RuntimeContext();
runtimeContext.set('userId', userId);
const response = await agent.generate(message, { runtimeContext });
```

### Email Intelligence System

**Webhook-Driven Processing** (`src/app/api/webhooks/composio/route.ts`):
- Composio Gmail trigger fires on new emails
- Webhook payload contains email metadata and content
- Trigger ID maps to user via `emailTriggers` table
- Async processing via `processEmailWithAgent()`

**Email Processing Flow** (`src/lib/email/processor.ts`):
1. **Store Email**: Save to `emails` table (idempotent)
2. **Generate Embedding**: Create vector embedding for RAG (async, non-blocking)
3. **Check Duplicate**: Skip if draft already exists for this email
4. **Generate Draft**: Use `emailDrafterAgent` to create response
5. **Save Draft**: Store in `emailDrafts` table with 'pending' status

**Email Embeddings** (`src/lib/email/embeddings.ts`):
- Uses `@mastra/pg` PgVector for vector storage
- Embedding model: `text-embedding-3-small` (OpenAI)
- Index name: `email_embeddings`
- Searchable fields: from, subject, body (combined)
- Function: `searchSimilarEmails(userId, query, topK)` for semantic search

**Draft Management** (`src/lib/trpc/routers/drafts.ts`):
- List pending drafts for user
- Edit draft content (subject/body)
- Approve and send via `emailSenderAgent`
- Reject with optional feedback
- Track status: pending → sent/rejected

## Environment Variables

```bash
# Database
DATABASE_URL=                          # Neon PostgreSQL connection string (with pgvector support)

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=

# Composio
COMPOSIO_API_KEY=
COMPOSIO_GMAIL_AUTH_CONFIG_ID=
COMPOSIO_CALENDAR_AUTH_CONFIG_ID=
COMPOSIO_SLACK_AUTH_CONFIG_ID=
COMPOSIO_NOTION_AUTH_CONFIG_ID=
COMPOSIO_GITHUB_AUTH_CONFIG_ID=

# OpenAI (for agents and embeddings)
OPENAI_API_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Key Patterns

### Mastra Instance Pattern
- **Single instance, multiple users**: One agent definition serves all users
- **Agent access**: `mastra.getAgent('agentName')` - no creation, just retrieval
- **Never recreate agents**: Agents registered once at app startup in `src/mastra/index.ts`
- **Specialized agents**: Use different agents for different tasks (chat, email drafting, sending)

### RuntimeContext for Dynamic Tools
- **Per-request context**: `new RuntimeContext()` for each request
- **User identification**: `runtimeContext.set('userId', userId)` enables per-user tool loading
- **Tool function pattern**: Agents define `tools: async ({ runtimeContext }) => {...}`
- **Cache benefits**: Combined with tool caching, enables fast per-user tool resolution

### Tool Caching
- **Cache layer**: `src/mastra/cache/tool-cache.ts` wraps Composio tool loading
- **TTL**: 5 minutes, auto-cleanup of expired entries
- **Invalidation**: Call `invalidateUserCache(userId)` when integrations change
- **Cache points**:
  - Connect integration: invalidate after status → 'connected'
  - Disconnect integration: invalidate after deletion
- **Performance**: First request ~2-3s (cache miss), subsequent ~0.5-1s (cache hit)

### tRPC
- `protectedProcedure` for authenticated endpoints (auto-throws if no userId)
- Zod schemas for input validation
- Type-safe client with React Query hooks

### OAuth
- Polling over callbacks for reliability
- Popup windows (600x700px) for better UX
- Progress simulation during polling (0-90%, 100% on success)

### Database
- Foreign key constraints enforced with cascade deletes
- Users must exist before creating integrations
- Use `npm run db:sync` if webhook fails
- PgVector extension required for email embeddings

### Email Processing
- **Async webhook handling**: Don't block webhook response waiting for draft generation
- **Idempotency**: Check for existing drafts before creating new ones
- **Non-blocking embeddings**: Generate embeddings async, don't fail if it errors
- **Agent specialization**: Use `emailDrafterAgent` for drafts, `emailSenderAgent` for sending

## Key Dependencies

- Next.js 16 + React 19
- @clerk/nextjs (authentication)
- @trpc/server, @trpc/client, @trpc/react-query (API)
- drizzle-orm + @neondatabase/serverless (database)
- @composio/core + @composio/mastra (tool execution)
- @mastra/core v0.24.5 (AI agent framework)
- @mastra/pg v0.17.9 (PgVector for embeddings)
- @mastra/memory v0.15.12 (for future conversation history)
- @mastra/rag v1.3.6 (RAG utilities)
- @ai-sdk/openai (GPT-4o, GPT-4o-mini models)
- ai v5.0.106 (Vercel AI SDK for embeddings)
- zod (validation)
