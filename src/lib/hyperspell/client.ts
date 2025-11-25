import Hyperspell from 'hyperspell';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Hyperspell client
export function getHyperspellClient(userId: string = 'anonymous') {
  if (!process.env.HYPERSPELL_API_KEY) {
    throw new Error('HYPERSPELL_API_KEY is not set in environment variables');
  }

  return new Hyperspell({
    apiKey: process.env.HYPERSPELL_API_KEY,
    userID: userId
  });
}

// Generate user token for OAuth flow
export async function getUserToken(userId: string = 'anonymous') {
  if (!process.env.HYPERSPELL_API_KEY) {
    throw new Error('HYPERSPELL_API_KEY is not set in environment variables');
  }

  const hyperspell = new Hyperspell({ apiKey: process.env.HYPERSPELL_API_KEY });
  const response = await hyperspell.auth.userToken({ user_id: userId });
  return response.token;
}

// Define supported sources as const array for proper typing
const DEFAULT_SOURCES = ['google_mail', 'google_calendar', 'notion', 'slack'] as const;
type HyperspellSource = typeof DEFAULT_SOURCES[number];

// Search memories with context
export async function searchMemories(
  query: string,
  userId: string = 'anonymous',
  options: {
    answer?: boolean;
    sources?: Array<HyperspellSource | string>;
    limit?: number;
  } = {}
) {
  const {
    answer = true,
    sources = [...DEFAULT_SOURCES],
    limit = 10
  } = options;

  const hyperspell = getHyperspellClient(userId);

  const response = await hyperspell.memories.search({
    query,
    answer,
    sources: sources as any, // Type assertion needed for Hyperspell SDK union type
    options: {
      max_results: limit
    }
  });

  return {
    answer: response.answer,
    documents: response.documents, // Changed from 'memories' to 'documents' per SDK v0.26.0
  };
}

// Add a memory directly (for conversation tracking)
export async function addMemory(
  content: string,
  userId: string = 'anonymous',
  metadata?: Record<string, any>
) {
  const hyperspell = getHyperspellClient(userId);

  // SDK v0.26.0 uses 'add' instead of 'create', and 'text' instead of 'content'
  const response = await hyperspell.memories.add({
    text: content,
    title: metadata?.title || 'Jarvis Conversation',
    collection: 'jarvis_conversations',
  });

  return response;
}

// Get connection URL for user to connect their accounts
export async function getConnectUrl(
  userId: string = 'anonymous',
  redirectUri: string = 'http://localhost:3000'
) {
  const token = await getUserToken(userId);
  return `https://connect.hyperspell.com?token=${token}&redirect_uri=${encodeURIComponent(redirectUri)}`;
}
