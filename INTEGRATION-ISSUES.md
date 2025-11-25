# Integration Issues - Technical Analysis

## Issue 1: Pending Status Never Clears

### Problem
- User clicks "Connect" button
- Status is set to `'pending'` in database
- User navigates to OAuth provider
- User returns to app (with or without completing OAuth)
- Status remains `'pending'` forever
- Spinner keeps rolling indefinitely

### Root Cause
**Database State**: Both integrations stuck in pending:
```
Composio (gmail):  status='pending' (created: 2025-11-23T03:31:33)
Hyperspell:        status='pending' (created: 2025-11-22T22:43:16)
```

**Code Flow**:
1. Connect route creates integration with `status: 'pending'`
2. Redirects user to OAuth provider
3. **If user abandons flow**: No callback received, status never updates
4. **If OAuth fails**: Status may not update properly
5. Frontend shows "Connecting..." forever because DB still has `pending`

### Why Button Fix Was Insufficient
- Removed `disabled={isPending}` to make button clickable
- Changed text to "Retry Connection"
- **But**: Database status is still `'pending'`
- Frontend still shows spinner because tRPC query returns `status: 'pending'`

---

## Issue 2: Hyperspell Connected Apps Not Showing

### User Report
> "I connected Gmail and Calendar for parthahir012001@gmail.com but Hyperspell doesn't show them as connected"

### Hypothesis: Token Regeneration Issue

**How Hyperspell OAuth Works** (Lines 85-91 in client.ts):
```typescript
export async function getConnectUrl(userId: string, redirectUri: string) {
  const token = await getUserToken(userId);  // ← GENERATES NEW TOKEN EACH TIME
  return `https://connect.hyperspell.com?token=${token}&redirect_uri=${encodeURIComponent(redirectUri)}`;
}
```

**Critical Questions**:

1. **Does Hyperspell create a NEW user for each token?**
   - If YES: Each connection attempt creates a separate Hyperspell user
   - Result: Gmail/Calendar connected to User A, but we're checking User B

2. **Is the token persistent or session-based?**
   - If session-based: Token expires, new token = new session
   - Connections made in old session won't show in new session

3. **What does `getUserToken()` actually return?**
   - Line 25: `hyperspell.auth.userToken({ user_id: userId })`
   - Does this get existing token or create new one?
   - **Need to check Hyperspell SDK docs**

### Evidence Supporting Multi-User Theory

**Callback expects `userId` in URL** (Line 11 in callback route):
```typescript
const userId = searchParams.get('userId');
```

**But `getConnectUrl` doesn't pass userId** (Line 90):
```typescript
return `https://connect.hyperspell.com?token=${token}&redirect_uri=${redirectUri}`;
// ❌ No userId parameter!
```

**Hyperspell callback doesn't know which DB user to update!**

### Actual Flow:
```
1. User clicks Connect
2. getConnectUrl(userId='user_35pvYoDJ...')
3. getUserToken() called with this userId
4. Hyperspell creates/gets token for this user
5. User redirected to: https://connect.hyperspell.com?token=XXX&redirect_uri=...
6. User connects Gmail/Calendar on Hyperspell
7. Hyperspell redirects back to callback
8. Callback looks for userId in params ← ❌ NOT THERE!
9. Callback fails to update DB status
10. Status stays 'pending'
```

### Missing Link
**The callback URL doesn't include userId!**

When Hyperspell redirects back, it needs to know:
- Which user in OUR database to update
- Callback expects `userId` query param
- But we never pass it in the redirect_uri

**Correct callback URL should be**:
```
http://localhost:3000/api/integrations/hyperspell/callback?userId=user_35pvYoDJ...
```

**Currently passing**:
```
http://localhost:3000/api/integrations/hyperspell/callback
```

---

## Issue 3: Multiple Hyperspell "Users"

### Scenario
If `getUserToken()` creates a NEW Hyperspell user each time:

**Timeline**:
- Day 1: Connect attempt #1 → Token A → Hyperspell User A → Connected Gmail
- Day 2: Connect attempt #2 → Token B → Hyperspell User B → No connections
- App always generates Token B, so never sees Gmail connection

### How to Verify
**Check Hyperspell dashboard**:
- Log into Hyperspell at https://hyperspell.com/dashboard
- Check Users section
- See if multiple users exist for API key
- Check which user has Gmail/Calendar connected

**Or query via SDK**:
```typescript
const hyperspell = new Hyperspell({ apiKey: HYPERSPELL_API_KEY });
const users = await hyperspell.users.list(); // If API exists
```

---

## Root Causes Summary

### 1. Pending Status Stuck
- **Cause**: No mechanism to clear pending status on abandoned OAuth flows
- **Impact**: UI stuck in loading state, button unusable
- **Fix Needed**: Auto-reset after timeout OR clear on retry

### 2. Missing userId in Callback
- **Cause**: redirect_uri doesn't include userId parameter
- **Impact**: Callback can't identify which DB record to update
- **Fix Needed**: Append `?userId=${userId}` to redirect_uri

### 3. Token/User Persistence Unknown
- **Cause**: Unclear if getUserToken() is idempotent
- **Impact**: May create multiple Hyperspell users, losing connection state
- **Fix Needed**: Verify Hyperspell SDK behavior, possibly store token in DB

---

## Recommended Investigation Steps

1. **Check Hyperspell Dashboard**
   - Count users under API key
   - Identify which user has connections
   - Note user IDs

2. **Test getUserToken() Behavior**
   ```typescript
   const token1 = await getUserToken('user_123');
   const token2 = await getUserToken('user_123');
   console.log(token1 === token2); // Should be true if idempotent
   ```

3. **Check Hyperspell SDK Documentation**
   - Does `auth.userToken()` create or retrieve?
   - Is token persistent?
   - What identifies a "user" in Hyperspell?

4. **Verify Callback Flow**
   - Add logging to callback route
   - Check what params Hyperspell sends
   - Verify redirect_uri handling

---

## Next Steps (DO NOT IMPLEMENT YET)

### Fix 1: Add userId to Callback URL
```diff
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/hyperspell/callback`;
+ const callbackUrlWithUser = `${callbackUrl}?userId=${userId}`;
- const connectUrl = await getConnectUrl(userId, callbackUrl);
+ const connectUrl = await getConnectUrl(userId, callbackUrlWithUser);
```

### Fix 2: Auto-Clear Stale Pending Status
```typescript
// In connect route, before creating new pending record
const existing = await db.query.integrations.findFirst(...);
if (existing?.status === 'pending') {
  const ageMinutes = (Date.now() - existing.updatedAt.getTime()) / 60000;
  if (ageMinutes > 5) {
    // Clear stale pending
    await db.update(integrations).set({ status: null }).where(eq(integrations.id, existing.id));
  }
}
```

### Fix 3: Store Hyperspell Token (if needed)
```typescript
// Add to integrations table
connectedAccountId: text('connected_account_id') // Store Hyperspell token here
```

---

## Questions for User

1. Can you access Hyperspell dashboard and check:
   - How many users exist under your API key?
   - Which user has Gmail/Calendar connected?
   - What are the user IDs?

2. When you connected Gmail/Calendar, did Hyperspell show success?

3. Can you try the Hyperspell connect flow one more time and:
   - Note the full URL you're redirected to
   - Check if callback URL is called after OAuth
   - Share any console logs
