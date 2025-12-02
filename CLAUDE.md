# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Jarvis** is an AI Chief of Staff - a personal AI assistant that can take real actions on your behalf across connected apps (Gmail, Calendar, Slack, Notion, GitHub). Built with Next.js 16, TypeScript, Mastra AI framework, and Composio for tool execution.

## Current Project State

### What's Working
- **Authentication**: Clerk sign-in/sign-up with webhook sync to database
- **Database**: Users + Integrations tables with Drizzle ORM + Neon PostgreSQL
- **Composio OAuth**: Connect Gmail, Calendar, Slack, Notion, GitHub via popup flow with polling
- **Onboarding UI**: Integration cards with progress bars, connect/disconnect functionality
- **Agent Factory**: Creates per-user Mastra agents with their connected Composio tools
- **Chat UI**: Message input, message list, message bubbles with tool call badges
- **Chat Backend**: `chat.sendMessage` tRPC mutation that calls the Mastra agent

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
│       ├── webhooks/clerk/route.ts        # User sync webhook
│       └── integrations/composio/         # OAuth endpoints
│
├── lib/
│   ├── trpc/
│   │   ├── router.ts                      # Main router (user, integrations, chat)
│   │   ├── init.ts                        # tRPC setup, publicProcedure, protectedProcedure
│   │   ├── context.ts                     # Request context (userId, db)
│   │   └── routers/
│   │       ├── user.ts                    # user.me
│   │       ├── integrations.ts            # list, disconnect, initiateComposioConnection, pollComposioConnection
│   │       └── chat.ts                    # sendMessage
│   ├── composio/client.ts                 # Composio SDK wrapper, getComposioTools, initiateComposioConnection
│   ├── mastra/agent-factory.ts            # createUserAgent, getUserComposioIntegrations
│   └── db/
│       ├── schema.ts                      # users, integrations tables
│       └── index.ts                       # Drizzle client
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

### Composio OAuth Flow
1. User clicks Connect → `useComposioConnection` hook calls tRPC
2. Backend creates pending integration, returns OAuth URL
3. Frontend opens popup window
4. Backend polls `waitForComposioConnection()` until ACTIVE/FAILED
5. Database updated, frontend receives result

### Mastra Agent System
- `createUserAgent(userId)` creates GPT-4o agent with user's Composio tools
- Agent can execute actions on connected apps (send emails, create events, etc.)
- Tools loaded dynamically based on user's OAuth connections

## Environment Variables

```bash
# Database
DATABASE_URL=                          # Neon PostgreSQL connection string

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

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Key Patterns

### tRPC
- `protectedProcedure` for authenticated endpoints (auto-throws if no userId)
- Zod schemas for input validation
- Type-safe client with React Query hooks

### OAuth
- Polling over callbacks for reliability
- Popup windows (600x700px) for better UX
- Progress simulation during polling (0-90%, 100% on success)

### Database
- Foreign key constraints enforced
- Users must exist before creating integrations
- Use `npm run db:sync` if webhook fails

## Key Dependencies

- Next.js 16 + React 19
- @clerk/nextjs (authentication)
- @trpc/server, @trpc/client, @trpc/react-query (API)
- drizzle-orm + @neondatabase/serverless (database)
- @composio/core + @composio/mastra (tool execution)
- @mastra/core (AI agent framework)
- @ai-sdk/openai (GPT-4o model)
- zod (validation)
