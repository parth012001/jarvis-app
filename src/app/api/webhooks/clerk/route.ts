import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { WebhookEvent } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Clerk webhook handler
 * Syncs user data from Clerk to our database
 * Handles: user.created, user.updated, user.deleted
 */
export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error('CLERK_WEBHOOK_SECRET is not set');
  }

  // Get headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get('svix-id');
  const svix_timestamp = headerPayload.get('svix-timestamp');
  const svix_signature = headerPayload.get('svix-signature');

  // If missing headers, error
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Error: Missing svix headers', { status: 400 });
  }

  // Get body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Create Svix instance with secret
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;

  // Verify webhook signature
  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error('Error verifying webhook:', err);
    return new Response('Error: Verification failed', { status: 400 });
  }

  // Handle the webhook
  const eventType = evt.type;

  console.log(`[Webhook] Received: ${eventType}`);

  try {
    if (eventType === 'user.created' || eventType === 'user.updated') {
      const { id, email_addresses, first_name, last_name, image_url } = evt.data;

      const primaryEmail = email_addresses.find((email) => email.id === evt.data.primary_email_address_id);

      if (!primaryEmail) {
        console.error('[Webhook] No primary email found');
        return new Response('Error: No primary email', { status: 400 });
      }

      // Upsert user to database
      await db
        .insert(users)
        .values({
          id,
          email: primaryEmail.email_address,
          firstName: first_name || null,
          lastName: last_name || null,
          imageUrl: image_url || null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            email: primaryEmail.email_address,
            firstName: first_name || null,
            lastName: last_name || null,
            imageUrl: image_url || null,
            updatedAt: new Date(),
          },
        });

      console.log(`[Webhook] User synced: ${id} (${primaryEmail.email_address})`);
    }

    if (eventType === 'user.deleted') {
      const { id } = evt.data;

      if (id) {
        await db.delete(users).where(eq(users.id, id));
        console.log(`[Webhook] User deleted: ${id}`);
      }
    }

    return new Response('Webhook processed', { status: 200 });
  } catch (error) {
    console.error('[Webhook] Error processing:', error);
    return new Response('Error: Processing failed', { status: 500 });
  }
}
