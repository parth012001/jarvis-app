'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { DraftsList } from '@/components/drafts/drafts-list';
import { DraftDetail } from '@/components/drafts/draft-detail';
import { TriggerToggle } from '@/components/drafts/trigger-toggle';

/**
 * Email Drafts Page
 *
 * Split view layout:
 * - Left panel: List of all drafts
 * - Right panel: Selected draft detail with actions
 */
export default function DraftsPage() {
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);

  // Fetch all drafts
  const {
    data: drafts,
    isLoading: draftsLoading,
    refetch: refetchDrafts,
  } = trpc.drafts.list.useQuery(undefined, {
    refetchInterval: 30000, // Refresh every 30 seconds for new drafts
  });

  // Fetch trigger status
  const { data: triggerStatus, refetch: refetchTrigger } =
    trpc.drafts.getTriggerStatus.useQuery();

  // Find selected draft from the list
  const selectedDraft = drafts?.find((d) => d.id === selectedDraftId);

  // Count pending drafts
  const pendingCount = drafts?.filter((d) => d.status === 'pending').length || 0;

  const handleDraftAction = () => {
    refetchDrafts();
    // If the current draft was acted upon, deselect it
    if (selectedDraftId) {
      const updatedDraft = drafts?.find((d) => d.id === selectedDraftId);
      if (updatedDraft?.status !== 'pending') {
        // Optionally auto-select next pending draft
        const nextPending = drafts?.find(
          (d) => d.id !== selectedDraftId && d.status === 'pending'
        );
        setSelectedDraftId(nextPending?.id || null);
      }
    }
  };

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center px-6 py-4 border-b bg-white">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Email Drafts</h1>
            {pendingCount > 0 && (
              <span className="px-2.5 py-0.5 text-sm font-medium bg-yellow-100 text-yellow-800 rounded-full">
                {pendingCount} pending
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-1">
            AI-generated email responses awaiting your approval
          </p>
        </div>
        <TriggerToggle
          enabled={triggerStatus?.enabled || false}
          onToggle={() => {
            refetchTrigger();
            refetchDrafts();
          }}
        />
      </div>

      {/* Split view content */}
      <div className="flex-1 flex overflow-hidden bg-gray-100">
        {/* Left panel - Drafts list */}
        <div className="w-1/3 min-w-[300px] max-w-[400px] bg-white border-r overflow-hidden flex flex-col">
          <div className="p-3 border-b bg-gray-50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                All Drafts
              </span>
              <span className="text-xs text-gray-500">
                {drafts?.length || 0} total
              </span>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <DraftsList
              drafts={drafts || []}
              selectedId={selectedDraftId}
              onSelect={setSelectedDraftId}
              isLoading={draftsLoading}
            />
          </div>
        </div>

        {/* Right panel - Draft detail */}
        <div className="flex-1 bg-white overflow-hidden">
          {selectedDraft ? (
            <DraftDetail draft={selectedDraft} onAction={handleDraftAction} />
          ) : (
            <EmptyState
              hasAnyDrafts={!!drafts?.length}
              triggerEnabled={triggerStatus?.enabled || false}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Empty state when no draft is selected
 */
function EmptyState({
  hasAnyDrafts,
  triggerEnabled,
}: {
  hasAnyDrafts: boolean;
  triggerEnabled: boolean;
}) {
  if (!triggerEnabled) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 p-6">
        <svg
          className="w-16 h-16 mb-4 text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Auto-drafting is disabled
        </h3>
        <p className="text-center max-w-sm">
          Enable the toggle above to start receiving AI-generated draft
          responses for incoming emails.
        </p>
      </div>
    );
  }

  if (!hasAnyDrafts) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 p-6">
        <svg
          className="w-16 h-16 mb-4 text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Waiting for emails
        </h3>
        <p className="text-center max-w-sm">
          Auto-drafting is enabled. New email drafts will appear here when you
          receive emails.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-500 p-6">
      <svg
        className="w-16 h-16 mb-4 text-gray-300"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        Select a draft
      </h3>
      <p className="text-center max-w-sm">
        Choose a draft from the list to review, edit, and send.
      </p>
    </div>
  );
}
