# Mastra Instance Refactor Plan - Minimal Risk Approach

**Goal**: Refactor Jarvis to use a centralized Mastra instance instead of creating agents per request, with minimal changes and maximum safety.

**Strategy**: Minimize risk by keeping changes focused on just moving to Mastra instance pattern. Defer memory/conversation history to Phase 2.

---

## User Requirements

Based on clarification:
- ✅ **Tool caching with 5-min TTL** - Better performance
- ✅ **Email search as agent tool** - Explicit RAG access
- ❌ **Skip conversation history** - Keep it simple for now
- ❌ **Skip semantic recall** - Add in Phase 2
- 🎯 **Priority: Minimize risk** - Only essential changes

---

## Phase 1: Foundation Setup (1-2 hours)

### 1.1 Install Missing Packages

```bash
npm install @mastra/memory@latest
```

### 1.2 Create Directory Structure

```
src/mastra/
├── index.ts              # Main Mastra instance (NEW)
├── agents/
│   ├── chat-agent.ts     # Chat agent (NEW)
│   ├── email-drafter.ts  # Email drafting agent (NEW)
│   └── email-sender.ts   # Email sending agent (NEW)
├── cache/
│   └── tool-cache.ts     # Tool caching layer (NEW)
└── tools/
    └── email-search.ts   # Email RAG search tool (NEW)
```

### 1.3 Verify Dependencies

Check that these are installed:
- `@mastra/core` v0.24.5 ✅
- `@mastra/pg` v0.17.9 ✅
- `@mastra/memory` (new install)

---

## Phase 2: Tool Caching Layer (2-3 hours)

**File**: `src/mastra/cache/tool-cache.ts` (NEW, ~120 lines)

### Purpose
Cache Composio tools per user with 5-minute TTL to avoid repeated DB queries.

### Implementation Details

```typescript
// Cache structure
type CachedTools = {
  tools: Record<string, unknown>;
  timestamp: number;
  userId: string;
};

// In-memory cache with TTL
const cache = new Map<string, CachedTools>();
const TTL = 5 * 60 * 1000; // 5 minutes

// Main functions
export async function getUserTools(userId: string): Promise<Record<string, unknown>>
export function invalidateUserCache(userId: string): void
```

### Features
- **5-minute TTL**: Tools cached for 5 minutes
- **User-scoped**: Separate cache per user
- **Auto-cleanup**: Remove expired entries
- **Manual invalidation**: When user connects/disconnects apps

### Integration Points
- Used by all agent definitions in their `tools` function
- Invalidated in `integrations.ts` when OAuth flow completes/disconnects

---

## Phase 3: Email Search Tool (1 hour)

**File**: `src/mastra/tools/email-search.ts` (NEW, ~80 lines)

### Purpose
Expose existing email embeddings system as an explicit agent tool.

### Implementation

```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { searchSimilarEmails } from '@/lib/email/embeddings';

export const emailSearchTool = createTool({
  id: 'searchEmails',
  description: 'Search past emails using semantic search for context',
  inputSchema: z.object({
    query: z.string().describe('Search query'),
    limit: z.number().optional().default(5),
  }),
  execute: async ({ context, runtimeContext }) => {
    const userId = runtimeContext.get('userId');
    const results = await searchSimilarEmails(
      userId,
      context.query,
      context.limit
    );
    return { results };
  },
});
```

### Notes
- Uses existing `searchSimilarEmails()` from `embeddings.ts`
- No changes to embeddings system needed
- Agents can call explicitly when they need context

---

## Phase 4: Agent Definitions (3-4 hours)

### 4.1 Chat Agent

**File**: `src/mastra/agents/chat-agent.ts` (NEW, ~100 lines)

```typescript
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { getUserTools } from '../cache/tool-cache';
import { emailSearchTool } from '../tools/email-search';

export const chatAgent = new Agent({
  name: 'Jarvis Chat Agent',
  instructions: `You are Jarvis, an AI Chief of Staff assistant.

You can help with:
- Answering questions
- Managing emails, calendar, Slack, Notion, GitHub
- Searching past emails for context (use searchEmails tool)

Be professional and helpful.`,

  model: openai('gpt-4o'),

  // Dynamic tool loading via RuntimeContext
  tools: async ({ runtimeContext }) => {
    const userId = runtimeContext.get('userId') as string;

    // Get cached user tools (Composio integrations)
    const userTools = await getUserTools(userId);

    // Add email search tool
    return {
      ...userTools,
      emailSearchTool,
    };
  },
});
```

**Key Pattern**: Tools loaded dynamically based on `userId` from RuntimeContext.

---

### 4.2 Email Drafter Agent

**File**: `src/mastra/agents/email-drafter.ts` (NEW, ~90 lines)

```typescript
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { getUserTools } from '../cache/tool-cache';
import { emailSearchTool } from '../tools/email-search';

export const emailDrafterAgent = new Agent({
  name: 'Email Draft Assistant',
  instructions: `You are an email assistant that drafts professional responses.

Instructions:
- Analyze email content and generate appropriate reply
- Match the tone (formal/casual)
- Be concise but thorough
- Include greeting and sign-off
- Generate ONLY the email body
- Write as if you ARE the person replying
- Use searchEmails tool to check past conversations if needed

Email types:
- Newsletter: Brief acknowledgment or suggest unsubscribing
- Meeting request: Confirm availability or ask alternatives
- Question: Provide helpful answer
- Notification: Acknowledge receipt
- Spam: Polite decline or mark as spam`,

  model: openai('gpt-4o'),

  tools: async ({ runtimeContext }) => {
    const userId = runtimeContext.get('userId') as string;
    const userTools = await getUserTools(userId);

    return {
      ...userTools,
      emailSearchTool,
    };
  },
});
```

**Specialized for**: Email drafting with context awareness

---

### 4.3 Email Sender Agent

**File**: `src/mastra/agents/email-sender.ts` (NEW, ~70 lines)

```typescript
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { getUserTools } from '../cache/tool-cache';

export const emailSenderAgent = new Agent({
  name: 'Email Sender',
  instructions: `You are an email sender. Your ONLY job is to send emails using the Gmail tool.

When given email details:
1. Use GMAIL_SEND_EMAIL tool with exact details provided
2. Do NOT modify the content
3. Confirm when sent
4. Report any errors

Do not draft, edit, or suggest changes. Just send.`,

  model: openai('gpt-4o-mini'), // Cheaper model for simple task

  tools: async ({ runtimeContext }) => {
    const userId = runtimeContext.get('userId') as string;
    return await getUserTools(userId);
  },
});
```

**Specialized for**: Sending pre-approved emails

---

## Phase 5: Mastra Instance (1 hour)

**File**: `src/mastra/index.ts` (NEW, ~60 lines)

```typescript
import { Mastra } from '@mastra/core/mastra';
import { chatAgent } from './agents/chat-agent';
import { emailDrafterAgent } from './agents/email-drafter';
import { emailSenderAgent } from './agents/email-sender';

export const mastra = new Mastra({
  agents: {
    chatAgent,
    emailDrafterAgent,
    emailSenderAgent,
  },

  // Optional: Add telemetry for debugging
  telemetry: {
    serviceName: 'jarvis-app',
    enabled: process.env.NODE_ENV === 'production',
  },
});

// Export for easy access
export { chatAgent, emailDrafterAgent, emailSenderAgent };
```

**Note**: No storage/memory yet - keeping it minimal per user requirements.

---

## Phase 6: Migrate Usage Points (4-6 hours)

### 6.1 Chat Router

**File**: `src/lib/trpc/routers/chat.ts` (MODIFY ~15 lines)

**Before**:
```typescript
const agent = await createUserAgent(ctx.userId);
const runtimeContext = new RuntimeContext();
runtimeContext.set('userId', ctx.userId);
const stream = await agent.stream(input.message, { runtimeContext });
```

**After**:
```typescript
import { mastra } from '@/lib/mastra';

const agent = mastra.getAgent('chatAgent');
const runtimeContext = new RuntimeContext();
runtimeContext.set('userId', ctx.userId);
const stream = await agent.stream(input.message, { runtimeContext });
```

**Changes**: 2 lines (import + getAgent)

---

### 6.2 Email Processor

**File**: `src/lib/email/processor.ts` (MODIFY ~20 lines)

**Before** (line 133):
```typescript
const agent = await createUserAgent(userId, {
  name: 'Email Draft Assistant',
  instructions: `...`,
});
```

**After**:
```typescript
import { mastra } from '@/lib/mastra';

const agent = mastra.getAgent('emailDrafterAgent');
const runtimeContext = new RuntimeContext();
runtimeContext.set('userId', userId);
```

**Changes**: Import + replace agent creation + add RuntimeContext

---

### 6.3 Drafts Router (Send)

**File**: `src/lib/trpc/routers/drafts.ts` (MODIFY ~20 lines)

**Before** (line 123):
```typescript
const agent = await createUserAgent(ctx.userId, {
  name: 'Email Sender',
  instructions: `...`,
});
```

**After**:
```typescript
import { mastra } from '@/lib/mastra';

const agent = mastra.getAgent('emailSenderAgent');
const runtimeContext = new RuntimeContext();
runtimeContext.set('userId', ctx.userId);
```

**Changes**: Import + replace agent creation + add RuntimeContext

---

### 6.4 Integrations Router

**File**: `src/lib/trpc/routers/integrations.ts` (MODIFY ~10 lines)

**Action**: Remove redundant chat endpoint (line 257) OR update to use mastra.getAgent()

**Recommendation**: Just delete it - duplicates functionality in chat.ts

---

### 6.5 Cache Invalidation

**File**: `src/lib/trpc/routers/integrations.ts` (ADD ~5 lines)

**In `initiateComposioConnection` callback** (when status becomes 'connected'):
```typescript
import { invalidateUserCache } from '@/lib/mastra/cache/tool-cache';

// After updating integration to 'connected'
invalidateUserCache(ctx.userId);
```

**In `disconnect` mutation** (after deleting integration):
```typescript
invalidateUserCache(ctx.userId);
```

---

## Phase 7: Cleanup Agent Factory (30 min)

**File**: `src/lib/mastra/agent-factory.ts` (REFACTOR)

### Remove (no longer needed)
- `createUserAgent()` function (lines 54-141)
- `createBasicAgent()` function (lines 144-162)

### Keep (still useful)
- `getUserComposioIntegrations()` - Used by tool-cache.ts
- `getUserAvailableApps()` - Used by onboarding UI

**Result**: File shrinks from 187 lines to ~70 lines

---

## Testing Strategy

### Test Each Migration Separately

**After Chat Router migration**:
```bash
# Test chat functionality
1. Start dev server: npm run dev
2. Go to /dashboard/chat
3. Send messages, verify responses work
4. Check logs for tool loading
5. Verify no errors in console
```

**After Email Processor migration**:
```bash
# Test webhook flow
1. Send test email to connected Gmail
2. Check webhook receives it
3. Verify draft is generated
4. Check database has draft
5. Look for errors in logs
```

**After Drafts Router migration**:
```bash
# Test email sending
1. Go to /dashboard/drafts
2. Select a pending draft
3. Click "Send"
4. Verify email is sent via Gmail
5. Check draft status updates to 'sent'
```

### Performance Validation

**Before refactor** (baseline):
- Time agent creation with: `console.time('createAgent')`
- Measure tool loading: `console.time('loadTools')`

**After refactor** (with cache):
- First request: Similar time (cache miss)
- Second+ request: Should be ~80% faster (cache hit)
- Log cache hits/misses

---

## Rollback Plan

### Option 1: Feature Flag (Recommended)

Add environment variable:
```bash
USE_MASTRA_INSTANCE=true  # Use new system
USE_MASTRA_INSTANCE=false # Use old system
```

In each migrated file:
```typescript
if (process.env.USE_MASTRA_INSTANCE === 'true') {
  // New: mastra.getAgent()
} else {
  // Old: createUserAgent()
}
```

**Benefit**: Toggle instantly without code changes

---

### Option 2: Git Revert

Each phase is a separate commit:
- Phase 1-5: Infrastructure (safe, not used yet)
- Phase 6.1: Chat router (revert if issues)
- Phase 6.2: Email processor (revert if issues)
- Phase 6.3: Drafts router (revert if issues)

**Benefit**: Granular rollback per endpoint

---

## File Checklist

### New Files (6 files, ~580 lines total)
- [ ] `src/mastra/index.ts` (~60 lines)
- [ ] `src/mastra/cache/tool-cache.ts` (~120 lines)
- [ ] `src/mastra/tools/email-search.ts` (~80 lines)
- [ ] `src/mastra/agents/chat-agent.ts` (~100 lines)
- [ ] `src/mastra/agents/email-drafter.ts` (~90 lines)
- [ ] `src/mastra/agents/email-sender.ts` (~70 lines)

### Modified Files (4 files, ~60 lines changed)
- [ ] `src/lib/trpc/routers/chat.ts` (~15 lines)
- [ ] `src/lib/email/processor.ts` (~20 lines)
- [ ] `src/lib/trpc/routers/drafts.ts` (~20 lines)
- [ ] `src/lib/trpc/routers/integrations.ts` (~15 lines)

### Refactored Files (1 file)
- [ ] `src/lib/mastra/agent-factory.ts` (delete ~100 lines)

---

## Environment Variables

No new environment variables needed! Uses existing:
- `DATABASE_URL` ✅
- `OPENAI_API_KEY` ✅
- `COMPOSIO_API_KEY` ✅
- `COMPOSIO_*_AUTH_CONFIG_ID` ✅

---

## Success Criteria

### Functional
- ✅ Chat works identically to before
- ✅ Email webhooks generate drafts
- ✅ Draft approval/sending works
- ✅ Tool loading succeeds
- ✅ No user-facing changes

### Performance
- ✅ First request: Similar speed (~2-3s)
- ✅ Cached requests: 80% faster (~0.5-1s)
- ✅ Database queries reduced by 70-80%

### Code Quality
- ✅ No TypeScript errors
- ✅ Proper error handling
- ✅ Logging for debugging
- ✅ Clean code structure

---

## Phase 2 (Future Work)

**After this refactor stabilizes**, we can add:

1. **Conversation History Persistence**
   - Wire `conversations` and `messages` tables
   - Add Mastra Memory with PostgresStore
   - Auto-save chat history

2. **Semantic Recall**
   - Add PgVector to Mastra Memory
   - Enable automatic context retrieval
   - Past conversations inform responses

3. **Streaming Responses**
   - Change chat endpoint to SSE
   - Real-time message updates
   - Better UX

4. **Workflows**
   - Multi-step email processing
   - Scheduled actions
   - Error recovery

**But NOT in this refactor** - minimize risk first!

---

## Timeline Estimate

**Phase 1-5 (Infrastructure)**: 8-10 hours
- Can work without touching existing code
- Low risk, fully reversible

**Phase 6 (Migration)**: 4-6 hours
- One endpoint at a time
- Test thoroughly between each

**Phase 7 (Cleanup)**: 30 minutes
- Remove old code
- Final testing

**Total**: 12-16 hours (~2 days)

---

## Critical Success Factors

1. ✅ **Tool cache works correctly** - No stale data issues
2. ✅ **RuntimeContext propagates userId** - Tools have user context
3. ✅ **Agent tools load dynamically** - Based on user's connections
4. ✅ **Email search tool functional** - RAG works as expected
5. ✅ **Zero breaking changes** - All endpoints work identically

---

## Notes for Implementation

### Mastra Documentation References
- Agent configuration: https://mastra.ai/docs/agents/overview
- RuntimeContext: https://mastra.ai/docs/server-db/runtime-context
- Tools: https://mastra.ai/docs/tools-mcp/overview
- Memory (Phase 2): https://mastra.ai/docs/memory/overview

### Key Patterns from Docs
- Use `async ({ runtimeContext })` for dynamic tool loading
- Cache at application layer, not Mastra layer
- Keep agents stateless, state goes in RuntimeContext
- Tools are just functions with Zod schemas

### Testing Commands
```bash
# Development
npm run dev

# Type check
npm run lint

# Database check
npm run db:check
```

---

## Questions Before Starting

Before implementing, verify:
1. ✅ User priority: Minimize risk (confirmed)
2. ✅ Tool caching: 5-min TTL (confirmed)
3. ✅ Email RAG: As agent tool (confirmed)
4. ✅ Conversation history: Skip for now (confirmed)

All decisions locked in - ready to execute!
