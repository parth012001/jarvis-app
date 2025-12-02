/**
 * Patch script for composio-core Entity.js
 *
 * Fixes the issue where the SDK sends both 'text' and 'input' to the API,
 * causing a validation error: "Only one of 'text' or 'arguments' must be provided"
 *
 * Run with: node scripts/patches/patch-composio-core.mjs
 */

import fs from 'fs';
import path from 'path';

const ENTITY_FILE = './node_modules/composio-core/lib/src/sdk/models/Entity.js';

console.log('🔧 Patching composio-core Entity.js...\n');

try {
  // Read the current file
  const content = fs.readFileSync(ENTITY_FILE, 'utf-8');

  // Check if already patched
  if (content.includes('// PATCHED: Remove text if undefined')) {
    console.log('✅ Already patched!');
    process.exit(0);
  }

  // Find and replace the problematic code
  // Original code sends text even when undefined
  const originalCode = `return this.actionsModel.execute({
                actionName: actionName,
                requestBody: {
                    // @ts-ignore
                    connectedAccountId: connectedAccount === null || connectedAccount === void 0 ? void 0 : connectedAccount.id,
                    input: params,
                    appName: action.appKey,
                    text: text,
                },
            });`;

  // Patched code only sends text if it's defined
  const patchedCode = `// PATCHED: Remove text if undefined to fix "Only one of 'text' or 'arguments' must be provided" error
            const requestBody = {
                // @ts-ignore
                connectedAccountId: connectedAccount === null || connectedAccount === void 0 ? void 0 : connectedAccount.id,
                input: params,
                appName: action.appKey,
            };
            // Only add text if it's defined (not undefined/void 0)
            if (text !== undefined && text !== null && text !== '') {
                requestBody.text = text;
            }
            return this.actionsModel.execute({
                actionName: actionName,
                requestBody: requestBody,
            });`;

  if (!content.includes('text: text,')) {
    console.log('⚠️  Could not find the code to patch. The file may have been updated.');
    console.log('    Looking for pattern: "text: text,"');
    process.exit(1);
  }

  // Apply the patch
  const patchedContent = content.replace(originalCode, patchedCode);

  if (patchedContent === content) {
    console.log('⚠️  Patch did not apply. The exact pattern was not found.');
    console.log('    This may be a different version of composio-core.');

    // Try a more lenient patch
    const lenientOriginal = /text: text,\s*\},\s*\}\);/g;
    const lenientPatched = `// Only add text if defined
            };
            if (text !== undefined && text !== null && text !== '') {
                requestBody.text = text;
            }
            return this.actionsModel.execute({
                actionName: actionName,
                requestBody: requestBody,
            });`;

    process.exit(1);
  }

  // Write the patched file
  fs.writeFileSync(ENTITY_FILE, patchedContent, 'utf-8');

  console.log('✅ Successfully patched composio-core Entity.js!');
  console.log('   The "text" parameter will now only be sent when defined.');
  console.log('\n⚠️  Note: This patch will be lost when you run npm install.');
  console.log('   Consider adding a postinstall script to reapply the patch.');

} catch (error) {
  console.error('❌ Error patching file:', error.message);
  process.exit(1);
}
