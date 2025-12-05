import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { emailTriggers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { processEmailWithAgent, type IncomingEmail } from '@/lib/email/processor';

/**
 * Composio Webhook Handler
 *
 * Receives webhook events from Composio when Gmail triggers fire.
 * Routes events to the appropriate user's email processor.
 *
 * Webhook URL: https://your-domain.com/api/webhooks/composio
 */

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  console.log('[Composio Webhook] Received request');

  try {
    // Parse the webhook payload
    const body = await req.text();
    let payload: any;

    try {
      payload = JSON.parse(body);
    } catch (parseError) {
      console.error('[Composio Webhook] Failed to parse JSON:', parseError);
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    // Log payload for debugging (remove in production)
    console.log('[Composio Webhook] Payload:', JSON.stringify(payload, null, 2));

    // Extract event type - Composio sends different formats
    const eventType = payload.type ||
      payload.event_type ||
      payload.triggerType ||
      payload.trigger_type ||
      '';

    // Check if this is a Gmail new message event
    const isGmailEvent =
      eventType.toUpperCase().includes('GMAIL') ||
      eventType.toUpperCase().includes('NEW_MESSAGE') ||
      eventType === 'GMAIL_NEW_GMAIL_MESSAGE';

    if (!isGmailEvent) {
      console.log(`[Composio Webhook] Ignoring non-Gmail event: ${eventType}`);
      return NextResponse.json({
        status: 'ignored',
        reason: 'Not a Gmail event',
        eventType,
      });
    }

    // Extract trigger ID - try multiple possible field names
    // Composio sends trigger_nano_id in payload.data for Gmail triggers
    const triggerId =
      payload.data?.trigger_nano_id ||
      payload.data?.triggerId ||
      payload.triggerId ||
      payload.trigger_id ||
      payload.triggerInstanceId ||
      payload.trigger_instance_id ||
      payload.metadata?.triggerId;

    if (!triggerId) {
      console.error('[Composio Webhook] No trigger ID found in payload');
      return NextResponse.json(
        { error: 'Missing trigger ID' },
        { status: 400 }
      );
    }

    // Look up the trigger to find the user
    const trigger = await db.query.emailTriggers.findFirst({
      where: eq(emailTriggers.triggerId, triggerId),
    });

    if (!trigger) {
      console.error(`[Composio Webhook] Unknown trigger: ${triggerId}`);
      return NextResponse.json(
        { error: 'Unknown trigger', triggerId },
        { status: 404 }
      );
    }

    const userId = trigger.userId;
    console.log(`[Composio Webhook] Found user for trigger:`, {
      triggerId,
      userId,
    });

    // Extract email data from payload - try multiple possible structures
    const emailData = extractEmailData(payload);

    if (!emailData.messageId) {
      console.error('[Composio Webhook] Could not extract email data from payload');
      return NextResponse.json(
        { error: 'Could not extract email data' },
        { status: 400 }
      );
    }

    console.log(`[Composio Webhook] Extracted email:`, {
      from: emailData.from,
      subject: emailData.subject,
      messageId: emailData.messageId,
    });

    // Process email asynchronously (don't block webhook response)
    // We use a separate promise that we don't await
    processEmailWithAgent(userId, emailData)
      .then(() => {
        console.log(`[Composio Webhook] Email processed successfully: ${emailData.messageId}`);
      })
      .catch((err) => {
        console.error(`[Composio Webhook] Email processing failed:`, err);
      });

    // Update last triggered timestamp
    await db.update(emailTriggers)
      .set({
        lastTriggeredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(emailTriggers.id, trigger.id));

    const duration = Date.now() - startTime;
    console.log(`[Composio Webhook] Request handled in ${duration}ms`);

    return NextResponse.json({
      status: 'received',
      userId,
      triggerId,
      messageId: emailData.messageId,
      processingTime: duration,
    });
  } catch (error) {
    console.error('[Composio Webhook] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Extract email data from various Composio payload formats
 */
function extractEmailData(payload: any): IncomingEmail {
  // Try different payload structures
  const data = payload.payload || payload.data || payload.message || payload;

  // Try to extract message ID
  const messageId =
    data.messageId ||
    data.message_id ||
    data.id ||
    data.emailId ||
    data.email_id ||
    payload.messageId ||
    '';

  // Try to extract thread ID
  const threadId =
    data.threadId ||
    data.thread_id ||
    data.conversationId ||
    payload.threadId ||
    '';

  // Try to extract sender
  const from =
    data.from ||
    data.sender ||
    data.fromAddress ||
    data.from_address ||
    (data.headers?.from) ||
    '';

  // Try to extract recipient
  const to =
    data.to ||
    data.recipient ||
    data.toAddress ||
    data.to_address ||
    (data.headers?.to) ||
    '';

  // Try to extract labels
  const labels =
    data.labels ||
    data.labelIds ||
    data.label_ids ||
    data.tags ||
    [];

  // Try to extract subject
  const subject =
    data.subject ||
    data.title ||
    (data.headers?.subject) ||
    '(No Subject)';

  // Try to extract body - prefer full body, fall back to snippet
  // Composio sends email body in message_text field
  const body =
    data.message_text ||
    data.body ||
    data.text ||
    data.textBody ||
    data.text_body ||
    data.content ||
    data.snippet ||
    data.preview?.body ||
    '';

  // Try to extract snippet separately
  const snippet =
    data.snippet ||
    data.preview ||
    data.summary ||
    '';

  // Try to extract received timestamp
  const receivedAt =
    data.message_timestamp ||
    data.internalDate ||
    data.internal_date ||
    data.receivedAt ||
    data.received_at ||
    data.date ||
    data.timestamp ||
    '';

  return {
    messageId,
    threadId: threadId || undefined,
    from,
    to: to || undefined,
    subject,
    body,
    snippet: snippet || undefined,
    receivedAt: receivedAt || undefined,
    labels: Array.isArray(labels) && labels.length > 0 ? labels : undefined,
  };
}

/**
 * Handle GET requests (for webhook verification)
 */
export async function GET(req: NextRequest) {
  // Some webhook systems send a GET request to verify the endpoint
  const challenge = req.nextUrl.searchParams.get('challenge');

  if (challenge) {
    return NextResponse.json({ challenge });
  }

  return NextResponse.json({
    status: 'ok',
    message: 'Composio webhook endpoint is active',
    timestamp: new Date().toISOString(),
  });
}
