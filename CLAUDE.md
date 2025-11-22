# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jarvis is a Next.js 16 application using the App Router with TypeScript, Tailwind CSS, and several key integrations. The app provides authenticated access to memory and integration services.

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

# Testing database connection
node check-db.mjs              # Quick DB connection test
```

## Architecture

### Authentication & Authorization
- **Clerk**: Handles all authentication (sign-in, sign-up, user management)
- Middleware (`src/middleware.ts`) protects all routes except `/`, `/sign-in`, `/sign-up`, and `/api/webhooks`
- Clerk webhooks (`src/app/api/webhooks/clerk/route.ts`) sync user data to database
- User IDs from Clerk are used as primary keys in the users table

### Database Layer
- **Drizzle ORM** with **Neon PostgreSQL** (serverless HTTP)
- Schema: `src/lib/db/schema.ts`
  - `users` table: Synced from Clerk via webhooks
  - `integrations` table: Tracks Hyperspell/Composio connections per user
- Database client: `src/lib/db/index.ts`
- Config: `drizzle.config.ts` (uses `.env.local` for DATABASE_URL)

### API Layer (tRPC)
- tRPC v11 with App Router integration
- **Structure:**
  - `src/lib/trpc/init.ts`: Core setup with `publicProcedure` and `protectedProcedure`
  - `src/lib/trpc/context.ts`: Creates context with `userId` from Clerk and `db` client
  - `src/lib/trpc/router.ts`: Main router combining all sub-routers
  - `src/lib/trpc/routers/`: Individual routers (user, integrations)
  - `src/app/api/trpc/[trpc]/route.ts`: HTTP handler for tRPC
- **Client-side:**
  - `src/lib/trpc/client.ts`: Browser tRPC client
  - `src/lib/trpc/provider.tsx`: React Query provider wrapper
- Uses `superjson` for data transformation
- Protected procedures automatically validate authentication via context

### Integrations
- **Hyperspell**: Memory/context API for connected services (Gmail, Calendar, Notion, Slack)
  - OAuth flow: `/api/integrations/hyperspell/connect` → `/api/integrations/hyperspell/callback`
  - Client: `src/lib/hyperspell/client.ts`
  - Tokens managed server-side by Hyperspell
  - Functions: `searchMemories()`, `addMemory()`, `getConnectUrl()`

### Frontend Structure
- App Router with `src/app/` directory
- Protected routes: `/dashboard`, `/dashboard/onboarding`
- Auth pages: `/sign-in`, `/sign-up` (Clerk components)
- Components: `src/components/` (e.g., `onboarding/integration-card.tsx`)

## Environment Variables

Required in `.env.local`:
- `DATABASE_URL`: Neon PostgreSQL connection string
- `HYPERSPELL_API_KEY`: Hyperspell API key
- Clerk keys: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`

## Key Dependencies
- Next.js 16 with React 19
- @clerk/nextjs (authentication)
- @trpc/server, @trpc/client, @trpc/react-query (API)
- @tanstack/react-query (data fetching)
- drizzle-orm + @neondatabase/serverless (database)
- hyperspell (memory/integration API)
- zod (validation)
- tailwindcss (styling)

## Development Notes

- Use `@/` import alias for `src/` directory
- Protected tRPC procedures throw `UNAUTHORIZED` if `userId` is null
- All database operations should use the Drizzle client from `src/lib/db`
- Hyperspell integration tracks connection status in database but tokens are managed externally
