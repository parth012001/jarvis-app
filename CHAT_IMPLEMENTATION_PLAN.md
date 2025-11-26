# Chat Interface Implementation Plan

## Overview
Build `/dashboard/chat` page to test the full agent system: user-specific tool loading, Composio actions, Hyperspell memory search, and tRPC integration.

## Architecture

### Backend (tRPC)
**New router**: `src/lib/trpc/routers/chat.ts`
- **Endpoint**: `chat.streamMessage` (protectedProcedure.subscription)
- **Input**: `{ message: string }`
- **Logic**:
  1. Create user agent via `createUserAgent(userId)`
  2. Call `agent.stream(message)` to get stream
  3. Yield text chunks from `stream.textStream` using async generator
  4. Yield final tool calls when stream completes
- **Implementation**: Use async generator function `async function*` with `yield`
- **Pattern**: tRPC subscription with SSE transport

### Frontend
**Page**: `src/app/dashboard/chat/page.tsx`
- Client component with tRPC subscription
- Chat UI: message list + input form
- Display user/assistant messages with distinct styling
- Show tool call indicators when tools are invoked

**Components** (in `src/components/chat/`):
- `message-list.tsx` - Scrollable message area
- `message-input.tsx` - Input + send button
- `message-bubble.tsx` - Individual message with tool call badges

## Implementation Steps

### 1. Backend Setup
- Create `src/lib/trpc/routers/chat.ts`
- Add `streamMessage` subscription using async generator
- Use `agent.stream(message)` and iterate `stream.textStream`
- Yield chunks as `{ type: 'text', content: string }`
- Yield tool calls as `{ type: 'tools', calls: [...] }` when complete
- Register router in `src/lib/trpc/router.ts`

### 2. tRPC Client Configuration
- Update `src/lib/trpc/provider.tsx`
- Add `httpSubscriptionLink` for SSE support
- Use `splitLink` to route subscriptions separately from queries/mutations
- Keep existing `httpBatchLink` for standard requests

### 3. Frontend Components
- Create `src/components/chat/` directory
- Build message input with form handling
- Build message list with auto-scroll
- Build message bubble with tool call display
- Style using existing Tailwind patterns (blue-600, gray-50, white cards)

### 4. Chat Page
- Create `src/app/dashboard/chat/page.tsx`
- Use `trpc.chat.streamMessage.useSubscription()` for streaming
- Accumulate text chunks in real-time using state
- Handle text chunks and tool call events separately
- Auto-scroll as chunks arrive
- Show typing indicator while streaming

### 5. UI Patterns
- Message bubbles: user (right, blue), assistant (left, gray)
- Tool calls: small badges showing executed tools
- Loading: spinner with "Thinking..." text
- Errors: red alert banner
- Empty state: prompt suggestions

## Key Technical Details

**Mastra Agent API** (from docs + types):
- `agent.stream(message)` returns stream with `textStream` async iterable
- Iterate with `for await (const chunk of stream.textStream)`
- Stream includes `onFinish()` callback for tool results
- Tools auto-execute based on user's connected apps

**tRPC Subscription Pattern**:
- Use `protectedProcedure.subscription(async function* (opts) { ... })`
- Yield chunks with `yield { type, content }` structure
- Add `httpSubscriptionLink` to tRPC client for SSE transport
- Frontend uses `useSubscription()` hook with `onData` callback

**Stream Event Types**:
```typescript
{ type: 'text', content: string }      // Text chunk
{ type: 'tools', calls: ToolCall[] }   // Tool execution results
{ type: 'done' }                        // Stream complete
```

**Client Setup Changes**:
```typescript
// Add to provider.tsx
import { httpSubscriptionLink, splitLink } from '@trpc/client';

links: [
  splitLink({
    condition: (op) => op.type === 'subscription',
    true: httpSubscriptionLink({
      url: `${process.env.NEXT_PUBLIC_APP_URL}/api/trpc`,
    }),
    false: httpBatchLink({
      url: `${process.env.NEXT_PUBLIC_APP_URL}/api/trpc`,
      transformer: superjson,
    }),
  }),
]
```

**Styling**:
- Follow dashboard patterns: white cards, blue CTAs, gray backgrounds
- Inline SVGs for icons (spinner, send, tool badges)
- Responsive: single column on mobile, max-w-4xl centered

## Testing Strategy
Once implemented, test with:
1. "What tools do I have?" - Verifies agent knows connected apps
2. "List my recent emails" - Tests Gmail tool (if connected)
3. "Search my memories for X" - Tests Hyperspell (if connected)
4. General queries - Tests basic agent responses

## Implementation Notes

**User Choices Made**:
- ✅ **Streaming**: Use `agent.stream()` + tRPC subscriptions (SSE)
- ✅ **History**: Keep messages in React state (no DB persistence)

**Technical Requirements**:
1. `@trpc/client` httpSubscriptionLink (already in v11.7.1)
2. Modify tRPC provider to support subscriptions
3. Create async generator subscription in router
4. Use `useSubscription()` hook in component

## Files to Create/Modify

**New Files**:
- `src/lib/trpc/routers/chat.ts` - Subscription router
- `src/app/dashboard/chat/page.tsx` - Chat interface
- `src/components/chat/message-list.tsx` - Message display
- `src/components/chat/message-input.tsx` - Input form
- `src/components/chat/message-bubble.tsx` - Single message

**Modified Files**:
- `src/lib/trpc/provider.tsx` - Add httpSubscriptionLink + splitLink
- `src/lib/trpc/router.ts` - Register chat router

## Progress Tracking

- [ ] Backend: Create chat router with subscription
- [ ] Backend: Register router
- [ ] Client: Update tRPC provider with subscription support
- [ ] Components: Message bubble
- [ ] Components: Message input
- [ ] Components: Message list
- [ ] Page: Chat interface with streaming
- [ ] Testing: Verify tool loading
- [ ] Testing: Test Composio actions
- [ ] Testing: Test Hyperspell search
