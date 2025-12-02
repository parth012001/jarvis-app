import { router, protectedProcedure } from '../init';
import { z } from 'zod';
import { emailDrafts, emailTriggers, integrations } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { createGmailTrigger, deleteGmailTrigger } from '@/lib/composio/triggers';
import { createUserAgent } from '@/lib/mastra/agent-factory';
import { TRPCError } from '@trpc/server';

/**
 * Drafts Router
 *
 * Handles email draft management and trigger configuration.
 * All endpoints are protected and scoped to the current user.
 */
export const draftsRouter = router({
  /**
   * List all email drafts for current user
   * Ordered by most recent first
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const drafts = await ctx.db.query.emailDrafts.findMany({
      where: eq(emailDrafts.userId, ctx.userId),
      orderBy: [desc(emailDrafts.createdAt)],
    });

    return drafts;
  }),

  /**
   * Get a single draft by ID
   * Returns null if not found or doesn't belong to user
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const draft = await ctx.db.query.emailDrafts.findFirst({
        where: and(
          eq(emailDrafts.id, input.id),
          eq(emailDrafts.userId, ctx.userId)
        ),
      });

      return draft || null;
    }),

  /**
   * Update draft content (subject, body)
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        subject: z.string().optional(),
        body: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      // Verify ownership
      const draft = await ctx.db.query.emailDrafts.findFirst({
        where: and(
          eq(emailDrafts.id, id),
          eq(emailDrafts.userId, ctx.userId)
        ),
      });

      if (!draft) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Draft not found',
        });
      }

      if (draft.status !== 'pending') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Can only edit pending drafts',
        });
      }

      await ctx.db
        .update(emailDrafts)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(emailDrafts.id, id));

      return { success: true };
    }),

  /**
   * Send the draft email via Composio Gmail
   */
  send: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Get the draft
      const draft = await ctx.db.query.emailDrafts.findFirst({
        where: and(
          eq(emailDrafts.id, input.id),
          eq(emailDrafts.userId, ctx.userId)
        ),
      });

      if (!draft) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Draft not found',
        });
      }

      if (draft.status === 'sent') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Email already sent',
        });
      }

      try {
        // Create agent with Gmail tools to send the email
        const agent = await createUserAgent(ctx.userId, {
          name: 'Email Sender',
          instructions: `You are an email sending assistant. Your only job is to send emails using the Gmail send email tool.
When asked to send an email, use the GMAIL_SEND_EMAIL tool with the exact parameters provided.
Do not modify the content. Just send it as-is.`,
        });

        // Build the send prompt
        const sendPrompt = draft.originalThreadId
          ? `Send a reply email with these exact details:
To: ${draft.recipient}
Subject: ${draft.subject}
Body:
${draft.body}

This is a reply to thread ID: ${draft.originalThreadId}
Use the Gmail reply functionality if available.`
          : `Send an email with these exact details:
To: ${draft.recipient}
Subject: ${draft.subject}
Body:
${draft.body}`;

        console.log(`[Drafts] Sending email to ${draft.recipient}`);

        // Send via agent and capture the response
        const response = await agent.generate(sendPrompt);

        // Verify that a Gmail send tool was actually called
        // The response contains toolCalls array with the tools that were invoked
        const toolCalls = response.toolCalls || [];
        const gmailSendTools = ['GMAIL_SEND_EMAIL', 'GMAIL_REPLY_TO_THREAD'];

        const sendToolCalled = toolCalls.some((call: any) => {
          const toolName = call.toolName || call.name || '';
          return gmailSendTools.some(t => toolName.toUpperCase().includes(t));
        });

        console.log(`[Drafts] Agent response:`, {
          text: response.text?.substring(0, 100),
          toolCallsCount: toolCalls.length,
          toolNames: toolCalls.map((c: any) => c.toolName || c.name),
          sendToolCalled,
        });

        if (!sendToolCalled) {
          console.error(`[Drafts] No Gmail send tool was called. Tool calls:`, toolCalls);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Email could not be sent: Gmail send tool was not available or not called. Please ensure Gmail is connected.',
          });
        }

        // Update draft status
        await ctx.db
          .update(emailDrafts)
          .set({
            status: 'sent',
            sentAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(emailDrafts.id, input.id));

        console.log(`[Drafts] Email sent successfully: ${draft.id}`);

        return { success: true };
      } catch (error) {
        console.error(`[Drafts] Failed to send email:`, error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  /**
   * Reject/discard a draft with optional feedback
   */
  reject: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        feedback: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const draft = await ctx.db.query.emailDrafts.findFirst({
        where: and(
          eq(emailDrafts.id, input.id),
          eq(emailDrafts.userId, ctx.userId)
        ),
      });

      if (!draft) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Draft not found',
        });
      }

      await ctx.db
        .update(emailDrafts)
        .set({
          status: 'rejected',
          userFeedback: input.feedback || null,
          updatedAt: new Date(),
        })
        .where(eq(emailDrafts.id, input.id));

      return { success: true };
    }),

  /**
   * Get trigger status for current user
   */
  getTriggerStatus: protectedProcedure.query(async ({ ctx }) => {
    const trigger = await ctx.db.query.emailTriggers.findFirst({
      where: eq(emailTriggers.userId, ctx.userId),
    });

    return {
      enabled: !!trigger,
      status: trigger?.status || null,
      lastTriggeredAt: trigger?.lastTriggeredAt || null,
      triggerId: trigger?.triggerId || null,
    };
  }),

  /**
   * Enable Gmail trigger for auto-drafting
   */
  enableTrigger: protectedProcedure.mutation(async ({ ctx }) => {
    // Check if trigger already exists
    const existing = await ctx.db.query.emailTriggers.findFirst({
      where: eq(emailTriggers.userId, ctx.userId),
    });

    if (existing) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Trigger already enabled',
      });
    }

    // Verify Gmail is connected
    const gmail = await ctx.db.query.integrations.findFirst({
      where: and(
        eq(integrations.userId, ctx.userId),
        eq(integrations.appName, 'gmail'),
        eq(integrations.status, 'connected')
      ),
    });

    if (!gmail?.connectedAccountId) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Please connect Gmail first before enabling auto-drafting',
      });
    }

    try {
      // Create trigger in Composio
      const { triggerId } = await createGmailTrigger(
        ctx.userId,
        gmail.connectedAccountId
      );

      // Save to database
      await ctx.db.insert(emailTriggers).values({
        userId: ctx.userId,
        triggerId,
        connectedAccountId: gmail.connectedAccountId,
        status: 'active',
      });

      console.log(`[Drafts] Trigger enabled for user ${ctx.userId}: ${triggerId}`);

      return { success: true, triggerId };
    } catch (error) {
      console.error(`[Drafts] Failed to enable trigger:`, error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to enable trigger: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }),

  /**
   * Disable Gmail trigger
   */
  disableTrigger: protectedProcedure.mutation(async ({ ctx }) => {
    const trigger = await ctx.db.query.emailTriggers.findFirst({
      where: eq(emailTriggers.userId, ctx.userId),
    });

    if (!trigger) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'No trigger found to disable',
      });
    }

    try {
      // Delete from Composio
      await deleteGmailTrigger(trigger.triggerId);

      // Delete from database
      await ctx.db
        .delete(emailTriggers)
        .where(eq(emailTriggers.id, trigger.id));

      console.log(`[Drafts] Trigger disabled for user ${ctx.userId}`);

      return { success: true };
    } catch (error) {
      console.error(`[Drafts] Failed to disable trigger:`, error);

      // Even if Composio deletion fails, clean up our database
      await ctx.db
        .delete(emailTriggers)
        .where(eq(emailTriggers.id, trigger.id));

      return { success: true };
    }
  }),

  /**
   * Get count of pending drafts
   */
  getPendingCount: protectedProcedure.query(async ({ ctx }) => {
    const drafts = await ctx.db.query.emailDrafts.findMany({
      where: and(
        eq(emailDrafts.userId, ctx.userId),
        eq(emailDrafts.status, 'pending')
      ),
      columns: { id: true },
    });

    return { count: drafts.length };
  }),
});
