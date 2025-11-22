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

// Search memories with context
export async function searchMemories(
  query: string,
  userId: string = 'anonymous',
  options: {
    answer?: boolean;
    sources?: string[];
    limit?: number;
  } = {}
) {
  const {
    answer = true,
    sources = ['google_mail', 'google_calendar', 'notion', 'slack'],
    limit = 10
  } = options;

  const hyperspell = getHyperspellClient(userId);

  const response = await hyperspell.memories.search({
    query,
    answer,
    sources,
    limit
  });

  return {
    answer: response.answer,
    memories: response.memories,
    sources: response.sources
  };
}

// Add a memory directly (for conversation tracking)
export async function addMemory(
  content: string,
  userId: string = 'anonymous',
  metadata?: Record<string, any>
) {
  const hyperspell = getHyperspellClient(userId);

  const response = await hyperspell.memories.create({
    content,
    metadata: {
      source: 'jarvis_conversation',
      timestamp: new Date().toISOString(),
      ...metadata
    }
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
