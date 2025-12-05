# Jarvis Architecture Guide for Beginners

This guide explains how Jarvis works from the ground up, so you can confidently build new features.

---

## 🎯 What is Jarvis?

Jarvis is your **AI Chief of Staff** - an assistant that can actually DO things for you (not just chat). It connects to your real apps (Gmail, Calendar, Slack, etc.) and takes actions on your behalf.

**Key Capability**: When you say "Send an email to John about the meeting", Jarvis doesn't just generate a response - it actually sends the email through your Gmail account.

---

## 🏗️ The Big Picture: Three Main Systems

Think of Jarvis as three interconnected systems:

```
┌─────────────────────────────────────────────────────────────┐
│                    1. USER INTERFACE                        │
│  (What the user sees: Chat, Drafts, Onboarding)            │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    2. AI BRAIN                              │
│  (Mastra Agents that understand & take actions)            │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    3. CONNECTED APPS                        │
│  (Gmail, Calendar, Slack via Composio)                     │
└─────────────────────────────────────────────────────────────┘
```

Let's understand each system deeply.

---

## 📱 System 1: User Interface (Frontend)

### What Pages Exist?

1. **Landing Page** (`/`) - Public homepage
2. **Onboarding** (`/dashboard/onboarding`) - Connect your apps
3. **Chat** (`/dashboard/chat`) - Talk to Jarvis
4. **Drafts** (`/dashboard/drafts`) - Review AI-generated email responses

### How Does the Frontend Talk to the Backend?

We use **tRPC** - think of it as a fancy way to call backend functions from the frontend with **full type safety**.

**Example**: When you send a chat message:

```typescript
// Frontend code (no HTTP requests to write!)
const response = await trpc.chat.sendMessage.mutate({
  message: "Check my emails"
});
```

Behind the scenes, tRPC:
1. Validates your input (is `message` a string?)
2. Calls the backend function
3. Returns the response with types

**Why this matters**: You get autocomplete and type checking everywhere. No more guessing what data the API returns!

### How Does Authentication Work?

We use **Clerk** for user authentication:

1. User signs in with email/Google/etc.
2. Clerk gives us a `userId` (like `user_abc123`)
3. Every protected route automatically has `ctx.userId` available
4. Clerk webhooks sync user data to our database

**Key Pattern**:
```typescript
protectedProcedure // ← This ensures user is logged in
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.userId; // ← Always available here
    // Your code...
  })
```

---

## 🧠 System 2: The AI Brain (Mastra Agents)

This is the heart of Jarvis. Let's break it down step by step.

### What is an "Agent"?

An **agent** is an AI that can:
1. Understand natural language ("Check my emails")
2. Decide what tools to use (Gmail, Calendar, etc.)
3. Execute actions (actually read emails, send messages)
4. Return results to you

Think of an agent as a really smart assistant who has access to your apps.

### The Old Way (Before Our Refactor) ❌

Every time someone sent a message, we created a brand new agent:

```
User sends message → Create new agent → Load tools → Process → Throw away agent
User sends message → Create new agent → Load tools → Process → Throw away agent
User sends message → Create new agent → Load tools → Process → Throw away agent
```

**Problems**:
- Slow (create agent every time)
- Expensive (load tools from database every time)
- No memory between requests

### The New Way (After Our Refactor) ✅

We create agents **once** when the app starts, and reuse them:

```
App starts → Create 3 agents once
User A sends message → Use existing agent (fast!)
User B sends message → Use same agent with different tools (fast!)
User C sends message → Use same agent with different tools (fast!)
```

**How can one agent serve multiple users?** → **RuntimeContext**

### Understanding RuntimeContext (CRITICAL CONCEPT)

This is the "magic" that makes everything work:

```typescript
// Step 1: Get the pre-created agent (no creation time!)
const agent = mastra.getAgent('chatAgent');

// Step 2: Create a "context" for THIS request
const runtimeContext = new RuntimeContext();
runtimeContext.set('userId', 'user_abc123'); // ← This user's ID

// Step 3: When agent runs, it loads tools for THIS user
const response = await agent.generate(message, { runtimeContext });
```

**What happens inside the agent?**

```typescript
// Inside chat-agent.ts
export const chatAgent = new Agent({
  name: 'Jarvis Chat Agent',

  // This function runs EVERY TIME someone uses the agent
  tools: async ({ runtimeContext }) => {
    // Get the userId from the context
    const userId = runtimeContext.get('userId');

    // Load ONLY this user's connected tools
    const userTools = await getUserTools(userId); // ← Cached!

    return userTools;
  }
});
```

**Mental Model**:
- **Agent** = The AI brain (created once, shared by everyone)
- **RuntimeContext** = The user's "backpack" with their specific tools
- **Result** = Same AI brain, but different tools per user

### The Three Specialized Agents

We don't use one agent for everything. We have three specialists:

#### 1. **chatAgent** (General Purpose)
- **When**: User types in the chat interface
- **Job**: Answer questions, execute any action user requests
- **Model**: GPT-4o (smart, can handle complex tasks)
- **Tools**: All of user's connected apps + email search

#### 2. **emailDrafterAgent** (Email Specialist)
- **When**: New email arrives via webhook
- **Job**: Write a professional draft reply
- **Model**: GPT-4o (needs to understand context and tone)
- **Tools**: User's apps + email search (to find past conversations)

#### 3. **emailSenderAgent** (Simple Executor)
- **When**: User approves a draft and clicks "Send"
- **Job**: Just send the email, no thinking required
- **Model**: GPT-4o-mini (cheaper, task is simple)
- **Tools**: Only Gmail sending tools

**Why separate agents?**
- **Better prompts**: Each agent has specialized instructions
- **Cost efficiency**: Use cheaper models for simple tasks
- **Clearer debugging**: Know exactly which agent did what

### Tool Caching (Performance Boost)

Loading tools from the database and Composio API is slow. So we cache them:

```typescript
// First request for user_abc123
getUserTools('user_abc123')
→ Query database for integrations
→ Call Composio API to get tools
→ Cache result for 5 minutes
→ Return tools (slow: ~2-3 seconds)

// Second request (within 5 minutes)
getUserTools('user_abc123')
→ Return cached tools (fast: ~0.1 seconds)
```

**Cache Invalidation** (important!):
When a user connects/disconnects an app:
```typescript
// In integrations.ts, after connecting Gmail
invalidateUserCache(userId); // ← Clear cache so next request loads new tools
```

**Mental Model**: Cache is like a sticky note with user's tools. We throw it away after 5 minutes or when tools change.

---

## 🔌 System 3: Connected Apps (Composio)

### What is Composio?

Composio is a service that handles OAuth and gives us "tools" to use apps:

```
Jarvis → Composio → Gmail (send email, read inbox)
         Composio → Calendar (create event, list meetings)
         Composio → Slack (send message, read channels)
```

**Key Concept**: We don't write Gmail/Slack integration code. Composio provides pre-built "tools" that work like functions.

### OAuth Connection Flow

When user clicks "Connect Gmail":

```
1. Frontend opens popup window
2. Popup shows Google's OAuth screen
3. User approves
4. Google redirects to our callback
5. Composio gives us a "connectionId"
6. We save connectionId in database
7. We can now use Gmail tools for this user
```

**Database Record**:
```
integrations table:
- userId: 'user_abc123'
- provider: 'composio'
- appName: 'gmail'
- connectedAccountId: 'conn_xyz789' ← This is the key
- status: 'connected'
```

### How Tools Are Loaded

When an agent needs to use tools:

```typescript
// 1. Query database for user's integrations
const integrations = await db.query.integrations.findMany({
  where: { userId, status: 'connected' }
});
// Result: [ { appName: 'gmail', connectedAccountId: 'conn_xyz789' } ]

// 2. For each integration, get tools from Composio
const gmailTools = await getComposioTools('conn_xyz789', ['GMAIL']);
// Result: {
//   GMAIL_SEND_EMAIL: function(...),
//   GMAIL_READ_INBOX: function(...),
//   ...
// }

// 3. Give tools to agent
return { ...gmailTools, ...calendarTools, ... };
```

**Mental Model**:
- **Integration record** = "User has given us permission"
- **Composio tools** = "Functions we can call to use the app"
- **Agent tools** = "What the AI can actually do"

---

## 📧 Deep Dive: Email Intelligence System

This is one of Jarvis's coolest features. Let's trace the full flow:

### Step 1: User Connects Gmail

```
User clicks "Connect Gmail" on onboarding page
→ OAuth flow (described above)
→ Integration saved in database
→ We create a Composio "trigger" for new emails
→ Trigger saved in emailTriggers table
```

**What's a trigger?** It's like saying to Composio: "Hey, call this webhook whenever user_abc123 gets a new email"

### Step 2: User Receives an Email

```
1. Email arrives in user's Gmail inbox
2. Composio detects it (they monitor the Gmail account)
3. Composio sends webhook to: /api/webhooks/composio
4. Webhook payload includes:
   - triggerId (so we know which user)
   - Email content (from, subject, body)
```

### Step 3: Webhook Processing

```typescript
// src/app/api/webhooks/composio/route.ts

1. Extract triggerId from payload
2. Look up trigger in database → find userId
3. Extract email data from payload
4. Call processEmailWithAgent(userId, emailData)
5. Return 200 OK immediately (don't block webhook)
```

**Key**: We return success immediately, then process async. Why? Composio expects quick responses.

### Step 4: AI Drafting

```typescript
// src/lib/email/processor.ts

async function processEmailWithAgent(userId, email) {
  // A. Store email in database
  await storeEmail(userId, email);
  → Saves to 'emails' table
  → Generates embedding for semantic search (async)

  // B. Check if we already processed this email
  const existingDraft = await db.query.emailDrafts.findFirst(...);
  if (existingDraft) return; // Skip duplicates

  // C. Get the email drafting agent
  const agent = mastra.getAgent('emailDrafterAgent');
  const runtimeContext = new RuntimeContext();
  runtimeContext.set('userId', userId);

  // D. Build prompt with email content
  const prompt = `Draft a response to: ${email.body}...`;

  // E. Agent generates draft
  const response = await agent.generate(prompt, { runtimeContext });

  // F. Save draft to database
  await db.insert(emailDrafts).values({
    userId,
    subject: `Re: ${email.subject}`,
    body: response.text,
    status: 'pending' // ← User needs to approve
  });
}
```

### Step 5: User Reviews Draft

User goes to `/dashboard/drafts` page:

```
Frontend calls: trpc.drafts.list()
→ Returns all drafts with status='pending'
→ User sees draft and can:
  - Edit it
  - Approve and send
  - Reject it
```

### Step 6: Sending the Email

User clicks "Send":

```typescript
// Frontend
await trpc.drafts.send.mutate({ id: draftId });

// Backend (src/lib/trpc/routers/drafts.ts)
1. Get draft from database
2. Get emailSenderAgent
3. Create RuntimeContext with userId
4. Tell agent: "Send email to X with subject Y and body Z"
5. Agent calls GMAIL_SEND_EMAIL tool
6. Update draft status to 'sent'
```

**Complete Flow Visualization**:

```
New Email → Webhook → Store Email → Generate Draft → User Reviews → Send Email
   ↓           ↓           ↓              ↓              ↓             ↓
 Gmail     Composio    Database    emailDrafterAgent  Frontend  emailSenderAgent
```

---

## 🔍 Email RAG (Retrieval-Augmented Generation)

This lets agents search past emails for context.

### What Problem Does This Solve?

Imagine drafting a reply to: *"What did we decide about the project timeline?"*

Without RAG: Agent has no idea, makes up an answer ❌
With RAG: Agent searches past emails, finds the decision, references it ✅

### How It Works

#### 1. Storing Embeddings

When an email is stored:

```typescript
// After saving email to database
storeEmailEmbedding(emailId, userId, {
  from: "john@example.com",
  subject: "Project Timeline Discussion",
  body: "We agreed to finish by June 30th..."
});
```

What happens:
```
1. Combine from + subject + body into one text
2. Send to OpenAI: "Create embedding for this text"
3. OpenAI returns a vector (array of 1536 numbers)
4. Store vector in PgVector database with metadata
```

**What's a vector?** It's like a GPS coordinate for meaning. Similar emails have nearby coordinates.

#### 2. Searching Emails

Agent can use the `searchEmails` tool:

```typescript
// Agent decides: "I need context about project timeline"
const results = await searchEmails({
  query: "project timeline discussion",
  limit: 5
});

// Behind the scenes:
1. Convert query to vector
2. Find 5 closest vectors in database
3. Return matching emails with metadata
```

#### 3. Using Results

```typescript
// Agent now has context:
results = [
  {
    from: "john@example.com",
    subject: "Project Timeline Discussion",
    snippet: "We agreed to finish by June 30th...",
    score: 0.89 // ← How similar (0-1)
  }
]

// Agent can now draft accurate reply:
"Based on our previous discussion, we agreed on June 30th..."
```

**Mental Model**:
- **Embeddings** = GPS coordinates for email meaning
- **Search** = Find emails near the query's GPS coordinate
- **Result** = Most relevant past emails for context

---

## 💾 Database Architecture

### Core Tables Relationships

```
users (Clerk IDs)
  ├─→ integrations (What apps are connected?)
  ├─→ emails (All received emails for RAG)
  ├─→ emailDrafts (AI-generated drafts)
  ├─→ emailTriggers (Composio webhook configs)
  └─→ conversations (Future: chat history)
      └─→ messages (Future: individual messages)
```

### Key Design Decisions

#### 1. Cascade Deletes

```sql
userId FK → users.id ON DELETE CASCADE
```

**What this means**: If user deletes their account, ALL their data is automatically deleted. No orphaned records.

#### 2. Status Enums

```typescript
status: 'pending' | 'connected' | 'error' // integrations
status: 'pending' | 'approved' | 'rejected' | 'sent' // emailDrafts
```

**Why**: Makes it easy to filter and show UI states.

#### 3. Idempotency Keys

```typescript
messageId: string; // Unique Gmail message ID
```

**Why**: If webhook fires twice for same email, we don't create duplicate drafts.

---

## 🎨 How to Think About Adding New Features

Let's say you want to add a new feature. Here's the thought process:

### Example: "Add Slack Message Summarization"

**Step 1: What system does this touch?**
- UI: New page to show summaries
- AI Brain: Need agent to summarize messages
- Connected Apps: Already have Slack integration ✓

**Step 2: Do I need a new agent?**

Ask yourself:
- Is this a specialized task? (Yes - summarization is different from chat)
- Does it need different instructions? (Yes - "summarize concisely" vs "answer questions")
- Should it use a different model? (Maybe - could use GPT-4o-mini for cost)

**Decision**: Create `slackSummarizerAgent`

**Step 3: What database changes?**

```
New table: slackSummaries
- id (uuid)
- userId (FK)
- channelId
- summary (text)
- summarizedAt (timestamp)
```

**Step 4: What's the flow?**

```
User clicks "Summarize #general channel"
→ Frontend calls trpc.slack.summarize({ channelId })
→ Backend:
  1. Get slackSummarizerAgent
  2. Create RuntimeContext with userId
  3. Agent loads Slack tools
  4. Agent calls SLACK_READ_MESSAGES({ channelId, limit: 50 })
  5. Agent summarizes messages
  6. Save summary to database
  7. Return summary
→ Frontend displays summary
```

**Step 5: Implementation checklist**

```
[ ] Create src/mastra/agents/slack-summarizer.ts
[ ] Register in src/mastra/index.ts
[ ] Add slackSummaries table to schema.ts
[ ] Create src/lib/trpc/routers/slack.ts
[ ] Add to main router
[ ] Create frontend page/component
[ ] Test with RuntimeContext pattern
```

---

## 🧪 Key Patterns to Remember

### 1. Never Create Agents in Request Handlers

❌ **Wrong**:
```typescript
async function handleRequest() {
  const agent = new Agent({ ... }); // BAD!
  return agent.generate(message);
}
```

✅ **Right**:
```typescript
async function handleRequest() {
  const agent = mastra.getAgent('chatAgent'); // GOOD!
  const runtimeContext = new RuntimeContext();
  runtimeContext.set('userId', userId);
  return agent.generate(message, { runtimeContext });
}
```

### 2. Always Invalidate Cache on Integration Changes

```typescript
// After connecting app
await db.update(integrations).set({ status: 'connected' });
invalidateUserCache(userId); // ← Don't forget!

// After disconnecting app
await db.delete(integrations).where(...);
invalidateUserCache(userId); // ← Don't forget!
```

### 3. Async Webhook Processing

```typescript
// Webhook handler
export async function POST(req: NextRequest) {
  const payload = await req.json();

  // Process async (don't await!)
  processWebhook(payload).catch(console.error);

  // Return immediately
  return NextResponse.json({ status: 'received' });
}
```

### 4. Idempotency for Webhooks

```typescript
// Always check if already processed
const existing = await db.query.emailDrafts.findFirst({
  where: { originalEmailId: email.messageId }
});

if (existing) return; // Skip duplicate
```

### 5. Tools Are User-Specific

```typescript
// Agent definition
tools: async ({ runtimeContext }) => {
  const userId = runtimeContext.get('userId'); // ← Always get userId
  const userTools = await getUserTools(userId); // ← Load their tools
  return userTools;
}
```

---

## 🎓 Mental Models Recap

### 1. The Layer Cake

```
Frontend (React/Next.js)
    ↕ tRPC (type-safe API)
Backend (tRPC routers)
    ↕ RuntimeContext
Agents (Mastra)
    ↕ Tools
Composio/APIs (Gmail, Slack, etc.)
```

Each layer talks to the layer below it. Never skip layers.

### 2. The Agent Assembly Line

```
Request comes in → Get agent → Create context → Load tools → Process → Return result
     ↓               ↓            ↓              ↓           ↓         ↓
  (Fast)         (Instant)    (Instant)      (Cached)    (Slow)   (Fast)
```

The only slow part is the AI processing. Everything else is optimized.

### 3. The Cache Strategy

```
First request: Miss → Load → Cache → Return (slow)
Next requests: Hit → Return (fast, fast, fast...)
5 minutes later: Expired → Miss → Load → Cache → Return (slow again)
Integration change: Invalidate → Miss → Load → Cache → Return
```

---

## 🚀 Advanced Concepts (When You're Ready)

### 1. Streaming Responses

Currently: Wait for full response, then return
Future: Stream response word-by-word

```typescript
const stream = await agent.stream(message, { runtimeContext });
for await (const chunk of stream) {
  // Send chunk to frontend in real-time
}
```

### 2. Conversation History

Currently: No memory between messages
Future: Load past conversation from database

```typescript
const conversation = await db.query.conversations.findFirst({
  where: { userId },
  with: { messages: true }
});

const prompt = buildPromptWithHistory(message, conversation.messages);
```

### 3. Multi-Agent Workflows

Currently: One agent per request
Future: Chain multiple agents

```
researchAgent → Find information
  ↓
draftAgent → Write draft
  ↓
reviewAgent → Check quality
  ↓
sendAgent → Send result
```

---

## ✅ You're Ready When You Can Answer:

1. **Why don't we create new agents for each request?**
   → Too slow, inefficient. We reuse agents with RuntimeContext.

2. **How does one agent serve multiple users with different tools?**
   → RuntimeContext carries userId, agent loads user-specific tools dynamically.

3. **What happens when a user connects Gmail?**
   → OAuth flow → Save to DB → Cache invalidated → Next request loads Gmail tools.

4. **How does email intelligence work end-to-end?**
   → Webhook → Process → Store → Draft → User approves → Send.

5. **What is tool caching and why do we need it?**
   → Cache tools for 5 min to avoid slow DB/API calls on every request.

---

## 📚 Next Steps

1. **Read the code**: Start with `src/mastra/index.ts` and follow the imports
2. **Trace a request**: Add console.logs and watch a chat message flow through
3. **Modify something small**: Add a new instruction to chatAgent
4. **Build a feature**: Try the Slack summarizer example
5. **Ask questions**: The architecture is here to support you!

**Remember**: Every complex system is just simple pieces connected together. You now understand all the pieces! 🎉
