# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jarvis is a Next.js 16 application using the App Router with TypeScript, Tailwind CSS, and AI integrations. The app provides authenticated access to AI agent services powered by Mastra, with OAuth integrations for Hyperspell (memory/context search) and Composio (action execution on Gmail, Calendar, Slack, Notion, GitHub).

## Development Commands

```bash
# Development
npm run dev                    # Start dev server on http://localhost:3000

# Build & Deploy
npm run build                  # Production build
npm run start                  # Start production server
npm run lint                   # Run ESLint

# Database (Drizzle ORM + Neon PostgreSQL)
npm run db:generate            # Generate migration files from schema
npm run db:migrate             # Run migrations
npm run db:push                # Push schema changes directly to DB (dev only)
npm run db:studio              # Open Drizzle Studio on http://localhost:4983

# Utility Scripts
node check-db.mjs              # Check database connection and view users
node quick-sync.mjs            # Manually sync current user to database
```

## Architecture

### Three-Layer Stack

1. **Frontend (Next.js 16 + React 19)**: App Router with server/client components
2. **API Layer (tRPC v11)**: Type-safe RPC with React Query
3. **Database (Drizzle ORM + Neon PostgreSQL)**: Serverless HTTP database

### Authentication & Authorization

- **Clerk**: Handles all authentication (sign-in, sign-up, user management)
- **Middleware** (`src/middleware.ts`): Protects all routes except public ones (`/`, `/sign-in`, `/sign-up`, `/api/webhooks`)
- **Clerk Webhooks** (`src/app/api/webhooks/clerk/route.ts`): Syncs user data from Clerk to database on `user.created`, `user.updated`, `user.deleted` events
- **User IDs**: Clerk user IDs are primary keys in the `users` table (foreign key constraint)

**Critical**: Users MUST exist in the database before creating integrations. If webhook sync fails, use `node quick-sync.mjs` to manually sync.

### Database Schema

**Location**: `src/lib/db/schema.ts`

**Tables**:
- `users`: Synced from Clerk via webhooks
  - `id` (text, PK): Clerk user ID
  - `email` (text, unique)
  - `firstName`, `lastName`, `imageUrl`

- `integrations`: Tracks OAuth connections per user
  - `id` (uuid, PK)
  - `userId` (text, FK → users.id, cascade delete)
  - `provider` ('hyperspell' | 'composio')
  - `appName` (null for Hyperspell, 'gmail'|'googlecalendar'|etc for Composio)
  - `connectedAccountId` (OAuth token/connection ID)
  - `status` ('pending' | 'connected' | 'error')
  - **Unique constraint**: (userId, provider, appName)
  - **Indexes**: Fast lookups by user, provider, and status

### tRPC API Architecture

**Structure**:
- `src/lib/trpc/init.ts`: Core setup with `publicProcedure` and `protectedProcedure`
- `src/lib/trpc/context.ts`: Request context with `userId` (from Clerk) and `db` (Drizzle client)
- `src/lib/trpc/router.ts`: Main router combining sub-routers
- `src/lib/trpc/routers/`: Individual routers
  - `user.ts`: User-related operations
  - `integrations.ts`: OAuth connection management
- `src/app/api/trpc/[trpc]/route.ts`: HTTP handler

**Client-side**:
- `src/lib/trpc/client.ts`: Browser tRPC client
- `src/lib/trpc/provider.tsx`: React Query provider wrapper

**Key Pattern**: Protected procedures automatically throw `UNAUTHORIZED` if `userId` is null.

### Composio Integration Architecture

**Files**:
- `src/lib/composio/client.ts`: Core Composio SDK wrapper
- `src/hooks/useComposioConnection.ts`: React hook for OAuth flow
- `src/lib/mastra/agent-factory.ts`: Creates agents with user's connected tools

**OAuth Flow (Polling-Based)**:
1. User clicks "Connect" on integration card
2. `useComposioConnection` hook calls `integrations.initiateComposioConnection` (tRPC)
3. Backend creates pending integration, returns OAuth URL + connectionId
4. Frontend opens OAuth popup window
5. Backend calls `waitForComposioConnection()` - polls Composio API until ACTIVE/FAILED
6. Database updated with final status and connectedAccountId
7. Frontend receives result via tRPC mutation

**Key Functions**:
- `initiateComposioConnection()`: Creates connection, returns OAuth URL
- `waitForComposioConnection(connectionId, timeout)`: Polls until complete (replaces callback dependency)
- `createUserAgent(userId)`: Dynamically creates Mastra agent with user's connected tools

**Supported Apps**: gmail, googlecalendar, slack, notion, github

**Environment Variables Required**:
- `COMPOSIO_API_KEY`
- `COMPOSIO_GMAIL_AUTH_CONFIG_ID`
- `COMPOSIO_CALENDAR_AUTH_CONFIG_ID`
- `COMPOSIO_SLACK_AUTH_CONFIG_ID`
- `COMPOSIO_NOTION_AUTH_CONFIG_ID`
- `COMPOSIO_GITHUB_AUTH_CONFIG_ID`

### Hyperspell Integration

**Files**:
- `src/lib/hyperspell/client.ts`: Hyperspell SDK wrapper
- OAuth endpoints: `/api/integrations/hyperspell/connect` → `/api/integrations/hyperspell/callback`

**Functions**:
- `getHyperspellClient(userId)`: Creates SDK instance
- `searchMemories(query, userId)`: Search across Gmail, Calendar, Slack, Notion
- `addMemory(content, userId)`: Store conversation context
- `getConnectUrl(userId, redirectUri)`: Generate OAuth URL

**Key Pattern**: Tokens managed server-side by Hyperspell (not stored in database).

### Mastra Agent System

**Agent Factory** (`src/lib/mastra/agent-factory.ts`):
- `createUserAgent(userId)`: Creates agent with user's connected Composio tools
- `getUserComposioIntegrations(userId)`: Fetches connected apps from database
- Dynamically loads tools based on user's OAuth connections

**Pattern**: Each user gets a personalized agent with only their authorized tools.

### Frontend Pages & Components

**Routes**:
- `/` - Landing page (public)
- `/sign-in`, `/sign-up` - Clerk auth pages
- `/dashboard` - Main dashboard (protected)
- `/dashboard/onboarding` - Integration setup (protected)

**Key Components**:
- `src/components/onboarding/integration-card.tsx`: OAuth connection UI with progress
- `src/hooks/useComposioConnection.ts`: React hook for managing OAuth flow

**Pattern**: Uses custom hook for complex OAuth state management (popup handling, polling, progress simulation).

## Environment Variables

Required in `.env.local`:

```bash
# Database
DATABASE_URL=                          # Neon PostgreSQL connection string

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=     # Public key for client-side
CLERK_SECRET_KEY=                      # Secret key for server-side
CLERK_WEBHOOK_SECRET=                  # Webhook signature verification

# Hyperspell
HYPERSPELL_API_KEY=                    # Format: hs-0-xxxxx

# Composio
COMPOSIO_API_KEY=                      # Composio API key
COMPOSIO_GMAIL_AUTH_CONFIG_ID=         # Auth config IDs from Composio dashboard
COMPOSIO_CALENDAR_AUTH_CONFIG_ID=
COMPOSIO_SLACK_AUTH_CONFIG_ID=
COMPOSIO_NOTION_AUTH_CONFIG_ID=
COMPOSIO_GITHUB_AUTH_CONFIG_ID=

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000  # For OAuth callbacks
```

## Key Patterns & Conventions

### Database Operations
- Always use Drizzle client from `src/lib/db`
- Foreign key constraints enforced (users must exist before integrations)
- Use `onConflictDoUpdate` for upserts in webhooks

### tRPC Patterns
- Use `protectedProcedure` for authenticated endpoints
- Use `z.object()` from Zod for input validation
- Return type-safe objects (auto-inferred by tRPC client)

### OAuth Integration Patterns
- **Polling over callbacks**: Use `waitForConnection()` to poll status instead of relying on OAuth redirects
- **Popup windows**: Open OAuth in centered popup (600x700px) for better UX
- **Progress feedback**: Simulate progress (0-90%) during polling, 100% on success
- **Cleanup**: Always cleanup timers, intervals, and popup refs on unmount

### React Hooks
- Custom hooks for complex state management (`useComposioConnection`)
- Return functions, state, and error handlers
- Handle cleanup in `useEffect` return function

### Import Aliases
- Use `@/` for `src/` directory imports
- Example: `import { db } from '@/lib/db'`

## Critical Development Notes

1. **User Sync**: Clerk webhook MUST sync users to database before they can create integrations. If webhook fails, use `node quick-sync.mjs`.

2. **OAuth Callbacks**: While callback endpoints exist, the primary flow uses polling (`waitForConnection`) to detect connection status.

3. **TypeScript Strict**: Project uses strict TypeScript. Composio SDK types may require `as any` casts for undocumented properties.

4. **Next.js 16 Middleware**: Deprecation warning about middleware is expected (will migrate to proxy pattern in future).

5. **Connection States**:
   - `pending`: OAuth initiated but not completed
   - `connected`: OAuth successful, has connectedAccountId
   - `error`: OAuth failed or timed out

6. **Database Constraints**: Always check users exist before inserting integrations (foreign key will fail otherwise).

## Key Dependencies

- Next.js 16 with React 19
- @clerk/nextjs 6.35.4 (authentication)
- @trpc/server, @trpc/client, @trpc/react-query 11.7.1 (API)
- @tanstack/react-query 5.90.10 (data fetching)
- drizzle-orm 0.44.7 + @neondatabase/serverless (database)
- @composio/core 0.2.5 + @mastra/composio 0.1.13 (action execution)
- @mastra/core 0.24.5 (AI agent framework)
- hyperspell 0.26.0 (memory/context search)
- zod 4.1.12 (validation)
- superjson 2.2.5 (data serialization for tRPC)
