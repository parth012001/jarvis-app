# Jarvis Memory & RAG Architecture Research

> Research conducted: December 2, 2024
> Status: Ready for implementation

---

## Executive Summary

**Mastra has excellent built-in RAG and Memory systems that directly support our use case.** No need for external solutions. The framework provides:
- Full RAG pipeline (chunking, embedding, vector storage, retrieval)
- Agent Memory with semantic recall
- Native `@mastra/pg` package for pgvector integration with existing Neon DB
- Graph-based retrieval for relationship discovery

**Recommendation:** Use Mastra's native Memory + RAG with pgvector in existing Neon DB.

---

## Part 1: Mastra's RAG & Memory System

### What Mastra Provides Out of the Box

| Feature | Description | Our Use Case |
|---------|-------------|--------------|
| **Semantic Recall** | Vector-based search of past messages | "Find emails about Project X" |
| **Working Memory** | Persistent user profile (Markdown or schema) | "User prefers formal tone, works at Acme" |
| **Conversation History** | Recent messages in context | Immediate conversation flow |
| **GraphRAG** | Relationship discovery between documents | "How does this email relate to past conversations?" |

### Key Packages

```bash
pnpm add @mastra/memory @mastra/pg @mastra/rag
```

### Memory Configuration Example

```typescript
import { Memory } from "@mastra/memory";
import { PgVector, PostgresStore } from "@mastra/pg";
import { openai } from "@ai-sdk/openai";

const memory = new Memory({
  storage: new PostgresStore({ connectionString: process.env.DATABASE_URL }),
  vector: new PgVector({ connectionString: process.env.DATABASE_URL }),
  embedder: openai.embedding("text-embedding-3-small"),
  options: {
    lastMessages: 10,
    semanticRecall: {
      topK: 5,           // Find 5 most similar past messages
      messageRange: 2,    // Include 2 messages before/after for context
      scope: "resource",  // Search across ALL user threads
    },
    workingMemory: {
      enabled: true,
      template: `# User Profile
- **Name**:
- **Communication Style**:
- **Key Contacts**:
- **Ongoing Projects**:
`,
    },
  },
});
```

### How Semantic Recall Works for Email Context

```
Email arrives: "Hey, any update on the proposal?"
                    ↓
┌─────────────────────────────────────────────────────┐
│ 1. Semantic Recall searches vector DB              │
│    → Finds: "Sent proposal to John on Nov 15"      │
│    → Finds: "John asked for revisions on Nov 20"   │
│    → Finds: "Completed revisions Nov 22"           │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│ 2. Working Memory provides user context            │
│    → User: Parth, prefers concise responses        │
│    → John is a key client contact                  │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│ 3. Agent generates informed response               │
│    "Hi John, yes! I sent the revised proposal on   │
│     Nov 22. Let me know if you need anything else."│
└─────────────────────────────────────────────────────┘
```

### Mastra RAG Pipeline

1. **Document Processing**: `MDocument` class handles chunking
   - Strategies: recursive, character, token, markdown, semantic-markdown, html, json, latex, sentence
   - Configurable chunk size, overlap, metadata extraction

2. **Embedding Generation**: AI SDK compatible
   - OpenAI: `text-embedding-3-small` (1536 dims), `text-embedding-3-large`
   - Configurable dimensions for storage optimization

3. **Vector Storage**: Multiple backends supported
   - **PgVector** (our choice) - uses existing Neon DB
   - Pinecone, Qdrant, Chroma, MongoDB, etc.

4. **Retrieval**: Query with filters and re-ranking
   - Metadata filtering (by sender, date, labels)
   - Re-ranking for better relevance
   - GraphRAG for relationship queries

---

## Part 2: pgvector with Neon

### Why This Is The Right Choice

1. **Already have Neon** - no new infrastructure
2. **Mastra native support** - `@mastra/pg` package
3. **Neon optimized pgvector** - 30x faster HNSW index builds
4. **Scales to zero** - cost-effective
5. **Single source of truth** - emails, users, vectors all in one place

### Index Types

| Index Type | Best For | Trade-offs |
|------------|----------|------------|
| **HNSW** | Our use case (10K-100K emails) | Better recall, higher memory |
| **IVFFlat** | Large datasets (1M+) | Requires training data |

### Recommended HNSW Configuration

```typescript
indexConfig: {
  type: "hnsw",
  metric: "dotproduct",  // Best for OpenAI embeddings
  m: 16,                 // Bi-directional links per node
  efConstruction: 64,    // Build-time candidate list size
}
```

### PgVector Methods

- `createIndex()` - Create vector index with dimension and metric
- `upsert()` - Store embeddings with metadata
- `query()` - Similarity search with filters
- `updateVector()` - Update existing vectors
- `deleteVector()` - Remove vectors
- `buildIndex()` - Rebuild index with new config

---

## Part 3: Knowledge Graphs - Future Consideration

### The Cutting Edge: Graphiti/Zep Architecture

Recent research shows knowledge graphs outperform pure vector search for:
- Temporal queries ("What did we discuss last month?")
- Relationship queries ("Who introduced me to John?")
- Multi-hop reasoning ("What project connects email X to meeting Y?")

### Key Projects

- **Zep** - Memory layer service with Graphiti engine
- **Graphiti** - Temporally-aware knowledge graph framework
- **Neo4j** - Graph database with AI integrations

### Recommendation: Not Yet (Phase 2+)

**For Phase 1, skip knowledge graphs.** Reasons:
1. Mastra's semantic recall + working memory covers 80% of needs
2. GraphRAG is available in Mastra when needed
3. Knowledge graphs add complexity
4. Vector search with good chunking handles most scenarios

**When to add knowledge graphs:**
- Relationship questions: "How do I know this person?"
- Timeline views: "What happened with Project X over time?"
- Cross-app relationships (Calendar + Slack + Notion)

### Mastra GraphRAG (Available Now)

```typescript
import { createGraphRAGTool } from "@mastra/rag";

const graphTool = createGraphRAGTool({
  vectorStoreName: "pgVector",
  indexName: "emails",
  model: openai.embedding("text-embedding-3-small"),
  graphOptions: {
    dimension: 1536,
    threshold: 0.7,        // Similarity threshold for edges
    randomWalkSteps: 100,  // Graph traversal steps
    restartProb: 0.15,     // Random walk restart probability
  },
});
```

---

## Part 4: Recommended Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    NEON POSTGRES (Existing)                  │
├──────────────────────────────────────────────────────────────┤
│  users          │  integrations    │  emails (new)           │
│  id, email...   │  userId, app...  │  userId, threadId,      │
│                 │                  │  subject, body, from,   │
│                 │                  │  receivedAt, embedding  │
├──────────────────────────────────────────────────────────────┤
│  email_chunks (new)              │  mastra_memory (auto)     │
│  emailId, chunkIndex, text,      │  threads, messages,       │
│  embedding (vector)              │  working_memory           │
└──────────────────────────────────────────────────────────────┘
                           ↑
                   pgvector extension
                           ↑
┌──────────────────────────────────────────────────────────────┐
│                    MASTRA LAYER                              │
├──────────────────────────────────────────────────────────────┤
│  Memory                          │  RAG Tools                │
│  - PostgresStore (storage)       │  - createVectorQueryTool  │
│  - PgVector (vector)             │  - Email embedding        │
│  - Semantic recall               │  - Context retrieval      │
│  - Working memory                │                           │
├──────────────────────────────────────────────────────────────┤
│                    JARVIS AGENT                              │
│  - Email processing              │  - Draft generation       │
│  - Context-aware responses       │  - Voice (future)         │
└──────────────────────────────────────────────────────────────┘
```

---

## Part 5: Implementation Roadmap

### Phase 1: Core Memory (1-2 days)
- [ ] Enable pgvector extension in Neon
- [ ] Add `@mastra/pg` to project
- [ ] Configure Memory with PgVector + PostgresStore
- [ ] Add working memory template for user profile
- [ ] Test basic semantic recall

### Phase 2: Email Embedding (2-3 days)
- [ ] Create email chunking pipeline
- [ ] Embed emails on webhook receipt
- [ ] Create context retrieval tool for agent
- [ ] Test semantic search on past emails
- [ ] Add to draft generation flow

### Phase 3: Enhanced Context (1-2 days)
- [ ] Add metadata filtering (by sender, date range, labels)
- [ ] Tune HNSW index parameters
- [ ] Add GraphRAG for relationship queries (optional)
- [ ] Performance optimization

### Phase 4: Voice Interface (Future)
- Once memory is solid, voice is just I/O
- Options: ElevenLabs, OpenAI Realtime, Deepgram

---

## Code Snippets for Implementation

### Enable pgvector in Neon

```sql
-- Run in Neon SQL console
CREATE EXTENSION IF NOT EXISTS vector;
```

### Email Chunking

```typescript
import { MDocument } from "@mastra/rag";

async function chunkEmail(email: { subject: string; body: string; from: string }) {
  const content = `From: ${email.from}\nSubject: ${email.subject}\n\n${email.body}`;
  const doc = MDocument.fromText(content);

  const chunks = await doc.chunk({
    strategy: "recursive",
    maxSize: 512,
    overlap: 50,
  });

  return chunks;
}
```

### Email Embedding

```typescript
import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";

async function embedChunks(chunks: { text: string }[]) {
  const { embeddings } = await embedMany({
    model: openai.embedding("text-embedding-3-small"),
    values: chunks.map(chunk => chunk.text),
  });

  return embeddings;
}
```

### Store in PgVector

```typescript
import { PgVector } from "@mastra/pg";

const pgVector = new PgVector({
  connectionString: process.env.DATABASE_URL,
});

// Create index (once)
await pgVector.createIndex({
  indexName: "email_embeddings",
  dimension: 1536,
  metric: "dotproduct",
  indexConfig: { type: "hnsw", hnsw: { m: 16, efConstruction: 64 } },
});

// Store embeddings
await pgVector.upsert({
  indexName: "email_embeddings",
  vectors: embeddings,
  metadata: chunks.map((chunk, i) => ({
    text: chunk.text,
    emailId: email.id,
    userId: email.userId,
    from: email.from,
    subject: email.subject,
    receivedAt: email.receivedAt,
  })),
});
```

### Query for Context

```typescript
import { embed } from "ai";

async function findRelatedEmails(query: string, userId: string) {
  const { embedding } = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value: query,
  });

  const results = await pgVector.query({
    indexName: "email_embeddings",
    vector: embedding,
    topK: 5,
    filter: { userId },
    minScore: 0.7,
  });

  return results;
}
```

### Agent with Memory

```typescript
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { PgVector, PostgresStore } from "@mastra/pg";

const memory = new Memory({
  storage: new PostgresStore({ connectionString: process.env.DATABASE_URL }),
  vector: new PgVector({ connectionString: process.env.DATABASE_URL }),
  embedder: openai.embedding("text-embedding-3-small"),
  options: {
    lastMessages: 10,
    semanticRecall: { topK: 5, messageRange: 2, scope: "resource" },
    workingMemory: { enabled: true },
  },
});

const jarvisAgent = new Agent({
  name: "Jarvis",
  instructions: "You are Jarvis, an AI assistant with memory...",
  model: openai("gpt-4o"),
  memory,
  tools: { findRelatedEmails, ... },
});
```

---

## Sources

### Mastra Documentation
- [RAG Overview](https://mastra.ai/docs/rag/overview)
- [Memory Overview](https://mastra.ai/docs/memory/overview)
- [Semantic Recall](https://mastra.ai/docs/memory/semantic-recall)
- [Working Memory](https://mastra.ai/docs/memory/working-memory)
- [PgVector Reference](https://mastra.ai/reference/vectors/pg)
- [GraphRAG Reference](https://mastra.ai/reference/rag/graph-rag)

### Neon & pgvector
- [Neon pgvector Extension](https://neon.com/docs/extensions/pgvector)
- [Vector Search in Postgres](https://neon.com/guides/vector-search)
- [pgvector 30x Faster Index Build](https://neon.com/blog/pgvector-30x-faster-index-build-for-your-vector-embeddings)
- [AI Embeddings with Neon](https://neon.com/guides/ai-embeddings-postgres-search)
- [Neon in OpenAI Cookbook](https://cookbook.openai.com/examples/vector_databases/neon/readme)

### Knowledge Graph Research
- [Zep: Temporal Knowledge Graph Architecture](https://arxiv.org/abs/2501.13956)
- [Graphiti: Real-Time Knowledge Graphs](https://github.com/getzep/graphiti)
- [Building Memory-Aware AI with Knowledge Graphs](https://medium.com/@mailtoksingh08/building-a-memory-aware-ai-with-knowledge-graphs-a-technical-deep-dive-b9908b3edf94)
- [AI Agents: Memory Systems and Graph Database Integration](https://www.falkordb.com/blog/ai-agents-memory-systems/)
- [Graphiti for Agentic World (Neo4j)](https://neo4j.com/blog/developer/graphiti-knowledge-graph-memory/)

---

## Next Steps

When ready to implement, start with:
1. Enable pgvector in Neon SQL console
2. Install packages: `pnpm add @mastra/memory @mastra/pg @mastra/rag`
3. Create Memory configuration
4. Test with existing agent

---

*Last updated: December 2, 2024*
