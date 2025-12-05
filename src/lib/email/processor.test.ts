/**
 * Email Processor Tests
 *
 * Tests for the email processor that integrates with the context builder
 * to generate AI draft responses.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processEmailWithAgent, type IncomingEmail } from './processor';

// ============================================================================
// MOCKS
// ============================================================================

// Mock dependencies
vi.mock('@/mastra', () => ({
  mastra: {
    getAgent: vi.fn(),
  },
}));

vi.mock('@mastra/core/runtime-context', () => {
  const mockSet = vi.fn();
  return {
    RuntimeContext: class RuntimeContext {
      set = mockSet;
    },
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    query: {
      emails: {
        findFirst: vi.fn(),
      },
      emailDrafts: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(),
  },
  emails: {
    id: 'id',
  },
  emailDrafts: {
    id: 'id',
  },
}));

vi.mock('./embeddings', () => ({
  storeEmailEmbedding: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./context-builder', () => ({
  buildEmailContext: vi.fn(),
  formatContextForPrompt: vi.fn(),
}));

// Import mocked modules
import { mastra } from '@/mastra';
import { RuntimeContext } from '@mastra/core/runtime-context';
import { db } from '@/lib/db';
import { buildEmailContext, formatContextForPrompt } from './context-builder';

// ============================================================================
// TEST DATA FACTORIES
// ============================================================================

function createIncomingEmail(overrides: Partial<IncomingEmail> = {}): IncomingEmail {
  return {
    messageId: 'msg-123',
    threadId: 'thread-456',
    from: 'John Doe <john@example.com>',
    to: 'user@example.com',
    subject: 'Project Update',
    body: 'Here is the project update.',
    snippet: 'Here is the project...',
    receivedAt: '2025-12-05T10:00:00Z',
    labels: ['INBOX'],
    ...overrides,
  };
}

function createMockEmailContext() {
  return {
    incomingEmail: {
      id: '',
      messageId: 'msg-123',
      from: 'John Doe <john@example.com>',
      fromEmail: 'john@example.com',
      to: 'user@example.com',
      subject: 'Project Update',
      body: 'Here is the project update.',
      snippet: 'Here is the project...',
      receivedAt: new Date('2025-12-05T10:00:00Z'),
      isCurrentEmail: true,
    },
    thread: {
      threadId: 'thread-456',
      emailCount: 2,
      emails: [
        {
          id: 'email-1',
          messageId: 'msg-1',
          from: 'Jane <jane@example.com>',
          fromEmail: 'jane@example.com',
          to: 'user@example.com',
          subject: 'Original message',
          body: 'Original body',
          snippet: null,
          receivedAt: new Date('2025-12-01T10:00:00Z'),
          isCurrentEmail: false,
        },
      ],
    },
    senderHistory: null,
    metadata: {
      contextBuildTimeMs: 150,
      threadEmailsLoaded: 2,
      senderEmailsLoaded: 0,
      tokenEstimate: 500,
      truncated: false,
    },
  };
}

// ============================================================================
// TESTS: Email Processing Flow
// ============================================================================

describe('processEmailWithAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('basic email processing', () => {
    it('should store email before processing', async () => {
      const userId = 'user-123';
      const email = createIncomingEmail();

      // Mock database responses
      vi.mocked(db.query.emails.findFirst).mockResolvedValueOnce(null); // Email doesn't exist
      vi.mocked(db.query.emailDrafts.findFirst).mockResolvedValueOnce(null); // No existing draft

      const mockReturning = vi.fn().mockResolvedValue([{ id: 'stored-email-id' }]);
      const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
      vi.mocked(db.insert).mockReturnValue({ values: mockValues } as any);

      // Mock context builder
      const mockContext = createMockEmailContext();
      vi.mocked(buildEmailContext).mockResolvedValue(mockContext);
      vi.mocked(formatContextForPrompt).mockReturnValue('Formatted context');

      // Mock agent
      const mockAgent = {
        generate: vi.fn().mockResolvedValue({
          text: 'Generated draft response',
        }),
      };
      vi.mocked(mastra.getAgent).mockReturnValue(mockAgent as any);

      await processEmailWithAgent(userId, email);

      // Verify email storage was attempted
      expect(db.query.emails.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.any(Function),
        })
      );
    });

    it('should build context before generating draft', async () => {
      const userId = 'user-123';
      const email = createIncomingEmail();

      // Setup mocks
      vi.mocked(db.query.emails.findFirst).mockResolvedValueOnce({ id: 'existing-email' } as any);
      vi.mocked(db.query.emailDrafts.findFirst).mockResolvedValueOnce(null);

      const mockContext = createMockEmailContext();
      vi.mocked(buildEmailContext).mockResolvedValue(mockContext);
      vi.mocked(formatContextForPrompt).mockReturnValue('Formatted context string');

      const mockAgent = {
        generate: vi.fn().mockResolvedValue({
          text: 'Draft response',
        }),
      };
      vi.mocked(mastra.getAgent).mockReturnValue(mockAgent as any);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      await processEmailWithAgent(userId, email);

      // Verify context was built
      expect(buildEmailContext).toHaveBeenCalledWith(userId, email);
      expect(formatContextForPrompt).toHaveBeenCalledWith(mockContext);
    });

    it('should pass formatted context to agent prompt', async () => {
      const userId = 'user-123';
      const email = createIncomingEmail({
        from: 'Alice <alice@example.com>',
        subject: 'Meeting request',
        body: 'Can we meet tomorrow?',
      });

      vi.mocked(db.query.emails.findFirst).mockResolvedValueOnce({ id: 'existing' } as any);
      vi.mocked(db.query.emailDrafts.findFirst).mockResolvedValueOnce(null);

      const mockContext = createMockEmailContext();
      vi.mocked(buildEmailContext).mockResolvedValue(mockContext);
      vi.mocked(formatContextForPrompt).mockReturnValue('=== CONTEXT ===\nThread history here');

      const mockAgent = {
        generate: vi.fn().mockResolvedValue({
          text: 'Sure, tomorrow works!',
        }),
      };
      vi.mocked(mastra.getAgent).mockReturnValue(mockAgent as any);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      await processEmailWithAgent(userId, email);

      // Verify agent was called with prompt containing context
      expect(mockAgent.generate).toHaveBeenCalledWith(
        expect.stringContaining('=== CONTEXT ===\nThread history here'),
        expect.any(Object)
      );

      // Verify prompt contains incoming email details
      const promptArg = mockAgent.generate.mock.calls[0][0];
      expect(promptArg).toContain('Alice <alice@example.com>');
      expect(promptArg).toContain('Meeting request');
      expect(promptArg).toContain('Can we meet tomorrow?');
    });

    it('should create draft with correct subject format', async () => {
      const userId = 'user-123';
      const email = createIncomingEmail({
        subject: 'Original Subject',
      });

      vi.mocked(db.query.emails.findFirst).mockResolvedValueOnce({ id: 'existing' } as any);
      vi.mocked(db.query.emailDrafts.findFirst).mockResolvedValueOnce(null);

      const mockContext = createMockEmailContext();
      vi.mocked(buildEmailContext).mockResolvedValue(mockContext);
      vi.mocked(formatContextForPrompt).mockReturnValue('Context');

      const mockAgent = {
        generate: vi.fn().mockResolvedValue({
          text: 'Draft response',
        }),
      };
      vi.mocked(mastra.getAgent).mockReturnValue(mockAgent as any);

      const mockInsert = {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      };
      vi.mocked(db.insert).mockReturnValue(mockInsert as any);

      await processEmailWithAgent(userId, email);

      // Verify draft was created with Re: prefix
      expect(mockInsert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Re: Original Subject',
          body: 'Draft response',
          recipient: 'john@example.com',
          originalEmailId: 'msg-123',
          originalThreadId: 'thread-456',
          status: 'pending',
        })
      );
    });

    it('should not add Re: prefix if already present', async () => {
      const userId = 'user-123';
      const email = createIncomingEmail({
        subject: 'Re: Original Subject',
      });

      vi.mocked(db.query.emails.findFirst).mockResolvedValueOnce({ id: 'existing' } as any);
      vi.mocked(db.query.emailDrafts.findFirst).mockResolvedValueOnce(null);

      const mockContext = createMockEmailContext();
      vi.mocked(buildEmailContext).mockResolvedValue(mockContext);
      vi.mocked(formatContextForPrompt).mockReturnValue('Context');

      const mockAgent = {
        generate: vi.fn().mockResolvedValue({
          text: 'Draft',
        }),
      };
      vi.mocked(mastra.getAgent).mockReturnValue(mockAgent as any);

      const mockInsert = {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      };
      vi.mocked(db.insert).mockReturnValue(mockInsert as any);

      await processEmailWithAgent(userId, email);

      // Should keep existing Re: prefix
      expect(mockInsert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Re: Original Subject',
        })
      );
    });

    it('should use RuntimeContext for per-user tools', async () => {
      const userId = 'user-123';
      const email = createIncomingEmail();

      vi.mocked(db.query.emails.findFirst).mockResolvedValueOnce({ id: 'existing' } as any);
      vi.mocked(db.query.emailDrafts.findFirst).mockResolvedValueOnce(null);

      const mockContext = createMockEmailContext();
      vi.mocked(buildEmailContext).mockResolvedValue(mockContext);
      vi.mocked(formatContextForPrompt).mockReturnValue('Context');

      const mockAgent = {
        generate: vi.fn().mockResolvedValue({
          text: 'Draft',
        }),
      };
      vi.mocked(mastra.getAgent).mockReturnValue(mockAgent as any);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      await processEmailWithAgent(userId, email);

      // Verify agent was called with RuntimeContext
      expect(mockAgent.generate).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          runtimeContext: expect.any(Object),
        })
      );
    });
  });

  // ============================================================================
  // TESTS: Idempotency
  // ============================================================================

  describe('idempotency', () => {
    it('should skip processing if draft already exists', async () => {
      const userId = 'user-123';
      const email = createIncomingEmail();

      vi.mocked(db.query.emails.findFirst).mockResolvedValueOnce({ id: 'existing' } as any);
      vi.mocked(db.query.emailDrafts.findFirst).mockResolvedValueOnce({
        id: 'existing-draft',
        originalEmailId: 'msg-123',
      } as any);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await processEmailWithAgent(userId, email);

      // Should log and return early
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Draft already exists for email')
      );

      // Should not call agent
      expect(mastra.getAgent).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle duplicate email storage gracefully', async () => {
      const userId = 'user-123';
      const email = createIncomingEmail();

      // Email already exists
      vi.mocked(db.query.emails.findFirst).mockResolvedValueOnce({
        id: 'existing-email-id',
      } as any);
      vi.mocked(db.query.emailDrafts.findFirst).mockResolvedValueOnce(null);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const mockContext = createMockEmailContext();
      vi.mocked(buildEmailContext).mockResolvedValue(mockContext);
      vi.mocked(formatContextForPrompt).mockReturnValue('Context');

      const mockAgent = {
        generate: vi.fn().mockResolvedValue({
          text: 'Draft',
        }),
      };
      vi.mocked(mastra.getAgent).mockReturnValue(mockAgent as any);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      await processEmailWithAgent(userId, email);

      // Should log that email already exists
      const logCalls = consoleSpy.mock.calls;
      const hasStoredMessage = logCalls.some(call =>
        call[0] && typeof call[0] === 'string' && call[0].includes('[EmailProcessor] Email already stored:')
      );
      expect(hasStoredMessage).toBe(true);

      // Should continue with draft generation
      expect(mockAgent.generate).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // TESTS: Error Handling
  // ============================================================================

  describe('error handling', () => {
    it('should handle empty draft generation', async () => {
      const userId = 'user-123';
      const email = createIncomingEmail();

      vi.mocked(db.query.emails.findFirst).mockResolvedValueOnce({ id: 'existing' } as any);
      vi.mocked(db.query.emailDrafts.findFirst).mockResolvedValueOnce(null);

      const mockContext = createMockEmailContext();
      vi.mocked(buildEmailContext).mockResolvedValue(mockContext);
      vi.mocked(formatContextForPrompt).mockReturnValue('Context');

      // Agent returns empty text
      const mockAgent = {
        generate: vi.fn().mockResolvedValue({
          text: '',
        }),
      };
      vi.mocked(mastra.getAgent).mockReturnValue(mockAgent as any);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await processEmailWithAgent(userId, email);

      // Should log error and not create draft
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[EmailProcessor] Empty draft generated for:')
      );
      expect(db.insert).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle agent generation failure', async () => {
      const userId = 'user-123';
      const email = createIncomingEmail();

      vi.mocked(db.query.emails.findFirst).mockResolvedValueOnce({ id: 'existing' } as any);
      vi.mocked(db.query.emailDrafts.findFirst).mockResolvedValueOnce(null);

      const mockContext = createMockEmailContext();
      vi.mocked(buildEmailContext).mockResolvedValue(mockContext);
      vi.mocked(formatContextForPrompt).mockReturnValue('Context');

      // Agent throws error
      const mockAgent = {
        generate: vi.fn().mockRejectedValue(new Error('AI service unavailable')),
      };
      vi.mocked(mastra.getAgent).mockReturnValue(mockAgent as any);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await processEmailWithAgent(userId, email);

      // Should catch error and log
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[EmailProcessor] Failed to process email'),
        expect.objectContaining({
          error: 'AI service unavailable',
        })
      );

      consoleSpy.mockRestore();
    });

    it('should continue processing if email storage fails', async () => {
      const userId = 'user-123';
      const email = createIncomingEmail();

      // Storage query throws error
      vi.mocked(db.query.emails.findFirst).mockRejectedValueOnce(new Error('DB error'));
      vi.mocked(db.query.emailDrafts.findFirst).mockResolvedValueOnce(null);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const mockContext = createMockEmailContext();
      vi.mocked(buildEmailContext).mockResolvedValue(mockContext);
      vi.mocked(formatContextForPrompt).mockReturnValue('Context');

      const mockAgent = {
        generate: vi.fn().mockResolvedValue({
          text: 'Draft',
        }),
      };
      vi.mocked(mastra.getAgent).mockReturnValue(mockAgent as any);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      await processEmailWithAgent(userId, email);

      // Should log error but continue
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[EmailProcessor] Failed to store email'),
        expect.any(Object)
      );

      // Should still generate draft
      expect(mockAgent.generate).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should not crash webhook if draft save fails', async () => {
      const userId = 'user-123';
      const email = createIncomingEmail();

      vi.mocked(db.query.emails.findFirst).mockResolvedValueOnce({ id: 'existing' } as any);
      vi.mocked(db.query.emailDrafts.findFirst).mockResolvedValueOnce(null);

      const mockContext = createMockEmailContext();
      vi.mocked(buildEmailContext).mockResolvedValue(mockContext);
      vi.mocked(formatContextForPrompt).mockReturnValue('Context');

      const mockAgent = {
        generate: vi.fn().mockResolvedValue({
          text: 'Draft',
        }),
      };
      vi.mocked(mastra.getAgent).mockReturnValue(mockAgent as any);

      // Draft save fails
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error('Insert failed')),
        }),
      } as any);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Should not throw
      await expect(processEmailWithAgent(userId, email)).resolves.not.toThrow();

      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // TESTS: Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('should handle email with no body (use snippet)', async () => {
      const userId = 'user-123';
      const email = createIncomingEmail({
        body: '',
        snippet: 'This is a snippet only',
      });

      vi.mocked(db.query.emails.findFirst).mockResolvedValueOnce({ id: 'existing' } as any);
      vi.mocked(db.query.emailDrafts.findFirst).mockResolvedValueOnce(null);

      const mockContext = createMockEmailContext();
      vi.mocked(buildEmailContext).mockResolvedValue(mockContext);
      vi.mocked(formatContextForPrompt).mockReturnValue('Context');

      const mockAgent = {
        generate: vi.fn().mockResolvedValue({
          text: 'Draft',
        }),
      };
      vi.mocked(mastra.getAgent).mockReturnValue(mockAgent as any);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      await processEmailWithAgent(userId, email);

      // Prompt should use snippet
      const promptArg = mockAgent.generate.mock.calls[0][0];
      expect(promptArg).toContain('This is a snippet only');
    });

    it('should handle email with neither body nor snippet', async () => {
      const userId = 'user-123';
      const email = createIncomingEmail({
        body: '',
        snippet: undefined,
      });

      vi.mocked(db.query.emails.findFirst).mockResolvedValueOnce({ id: 'existing' } as any);
      vi.mocked(db.query.emailDrafts.findFirst).mockResolvedValueOnce(null);

      const mockContext = createMockEmailContext();
      vi.mocked(buildEmailContext).mockResolvedValue(mockContext);
      vi.mocked(formatContextForPrompt).mockReturnValue('Context');

      const mockAgent = {
        generate: vi.fn().mockResolvedValue({
          text: 'Draft',
        }),
      };
      vi.mocked(mastra.getAgent).mockReturnValue(mockAgent as any);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      await processEmailWithAgent(userId, email);

      // Prompt should use fallback text
      const promptArg = mockAgent.generate.mock.calls[0][0];
      expect(promptArg).toContain('(No content)');
    });

    it('should extract email address from various formats', async () => {
      const testCases = [
        { input: 'John Doe <john@example.com>', expected: 'john@example.com' },
        { input: 'jane@example.com', expected: 'jane@example.com' },
        { input: '<bob@example.com>', expected: 'bob@example.com' },
      ];

      for (const testCase of testCases) {
        vi.clearAllMocks();

        const userId = 'user-123';
        const email = createIncomingEmail({
          from: testCase.input,
        });

        vi.mocked(db.query.emails.findFirst).mockResolvedValueOnce({ id: 'existing' } as any);
        vi.mocked(db.query.emailDrafts.findFirst).mockResolvedValueOnce(null);

        const mockContext = createMockEmailContext();
        vi.mocked(buildEmailContext).mockResolvedValue(mockContext);
        vi.mocked(formatContextForPrompt).mockReturnValue('Context');

        const mockAgent = {
          generate: vi.fn().mockResolvedValue({
            text: 'Draft',
          }),
        };
        vi.mocked(mastra.getAgent).mockReturnValue(mockAgent as any);

        const mockInsert = {
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        };
        vi.mocked(db.insert).mockReturnValue(mockInsert as any);

        await processEmailWithAgent(userId, email);

        // Verify recipient is correctly extracted
        expect(mockInsert.values).toHaveBeenCalledWith(
          expect.objectContaining({
            recipient: testCase.expected,
          })
        );
      }
    });

    it('should handle email without threadId', async () => {
      const userId = 'user-123';
      const email = createIncomingEmail({
        threadId: undefined,
      });

      vi.mocked(db.query.emails.findFirst).mockResolvedValueOnce(null);
      vi.mocked(db.query.emailDrafts.findFirst).mockResolvedValueOnce(null);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'stored' }]),
        }),
      } as any);

      const mockContext = createMockEmailContext();
      mockContext.thread = null;
      vi.mocked(buildEmailContext).mockResolvedValue(mockContext);
      vi.mocked(formatContextForPrompt).mockReturnValue('Context');

      const mockAgent = {
        generate: vi.fn().mockResolvedValue({
          text: 'Draft',
        }),
      };
      vi.mocked(mastra.getAgent).mockReturnValue(mockAgent as any);

      const mockInsert = {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      };
      vi.mocked(db.insert)
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 'stored' }]),
          }),
        } as any)
        .mockReturnValueOnce(mockInsert as any);

      await processEmailWithAgent(userId, email);

      // Should save draft with null threadId
      expect(mockInsert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          originalThreadId: null,
        })
      );
    });
  });

  // ============================================================================
  // TESTS: Logging
  // ============================================================================

  describe('logging', () => {
    it('should log context build metrics', async () => {
      const userId = 'user-123';
      const email = createIncomingEmail({
        subject: 'Test Email',
      });

      vi.mocked(db.query.emails.findFirst).mockResolvedValueOnce({ id: 'existing' } as any);
      vi.mocked(db.query.emailDrafts.findFirst).mockResolvedValueOnce(null);

      const mockContext = createMockEmailContext();
      mockContext.metadata = {
        contextBuildTimeMs: 250,
        threadEmailsLoaded: 5,
        senderEmailsLoaded: 3,
        tokenEstimate: 1200,
        truncated: true,
      };
      vi.mocked(buildEmailContext).mockResolvedValue(mockContext);
      vi.mocked(formatContextForPrompt).mockReturnValue('Context');

      const mockAgent = {
        generate: vi.fn().mockResolvedValue({
          text: 'Draft',
        }),
      };
      vi.mocked(mastra.getAgent).mockReturnValue(mockAgent as any);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await processEmailWithAgent(userId, email);

      // Verify context metrics are logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[EmailProcessor] Context built in 250ms'),
        expect.objectContaining({
          threadEmails: 5,
          senderEmails: 3,
          tokenEstimate: 1200,
          truncated: true,
        })
      );

      consoleSpy.mockRestore();
    });

    it('should log successful draft creation', async () => {
      const userId = 'user-123';
      const email = createIncomingEmail();

      vi.mocked(db.query.emails.findFirst).mockResolvedValueOnce({ id: 'existing' } as any);
      vi.mocked(db.query.emailDrafts.findFirst).mockResolvedValueOnce(null);

      const mockContext = createMockEmailContext();
      vi.mocked(buildEmailContext).mockResolvedValue(mockContext);
      vi.mocked(formatContextForPrompt).mockReturnValue('Context');

      const mockAgent = {
        generate: vi.fn().mockResolvedValue({
          text: 'Draft',
        }),
      };
      vi.mocked(mastra.getAgent).mockReturnValue(mockAgent as any);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await processEmailWithAgent(userId, email);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[EmailProcessor] Draft created successfully'),
        expect.objectContaining({
          userId,
          recipient: 'john@example.com',
        })
      );

      consoleSpy.mockRestore();
    });
  });
});
