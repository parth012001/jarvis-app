import { router, protectedProcedure } from '../init';
import { z } from 'zod';
import { createUserAgent } from '@/lib/mastra/agent-factory';
import { RuntimeContext } from '@mastra/core/runtime-context';

/**
 * Chat router - handles AI agent conversations
 */
export const chatRouter = router({
  /**
   * Send a message to the user's AI agent and get a response
   * Uses a simple request/response pattern (no streaming)
   */
  sendMessage: protectedProcedure
    .input(
      z.object({
        message: z.string().min(1).max(5000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      console.log(`[Chat] Processing message for user ${ctx.userId}`);
      console.log(`[Chat] Message: "${input.message}"`);

      try {
        // Create agent with user's connected tools
        const agent = await createUserAgent(ctx.userId);
        console.log(`[Chat] Agent created successfully`);

        // Create RuntimeContext with userId for tools that need it
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('userId', ctx.userId);

        // Call the agent and get the response
        console.log(`[Chat] Calling agent.stream()...`);
        const stream = await agent.stream(input.message, { runtimeContext });

        // Wait for the complete response
        const text = await stream.text;
        console.log(`[Chat] Got response (${text?.length || 0} chars)`);

        if (!text) {
          throw new Error('No response generated');
        }

        return {
          success: true,
          content: text,
        };
      } catch (error) {
        console.error('[Chat] Error:', error);

        return {
          success: false,
          content: '',
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }
    }),
});
