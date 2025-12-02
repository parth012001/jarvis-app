'use client';

import { type EmailDraft } from '@/lib/db/schema';

interface DraftsListProps {
  drafts: EmailDraft[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLoading: boolean;
}

/**
 * List of email drafts with status indicators
 */
export function DraftsList({
  drafts,
  selectedId,
  onSelect,
  isLoading,
}: DraftsListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 p-6 text-center">
        <svg
          className="w-12 h-12 mb-3 text-gray-300"
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
        <p className="font-medium">No drafts yet</p>
        <p className="text-sm mt-1">
          Enable auto-drafting to start receiving AI-generated responses
        </p>
      </div>
    );
  }

  // Sort: pending first, then by date
  const sortedDrafts = [...drafts].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="divide-y divide-gray-100 overflow-y-auto h-full">
      {sortedDrafts.map((draft) => (
        <button
          key={draft.id}
          onClick={() => onSelect(draft.id)}
          className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
            selectedId === draft.id
              ? 'bg-blue-50 border-l-4 border-blue-500'
              : 'border-l-4 border-transparent'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium text-gray-900 truncate flex-1">
              {extractDisplayName(draft.recipient)}
            </p>
            <StatusBadge status={draft.status} />
          </div>
          <p className="text-sm text-gray-600 truncate mt-1">{draft.subject}</p>
          <p className="text-xs text-gray-400 mt-2">
            {formatRelativeTime(draft.createdAt)}
          </p>
        </button>
      ))}
    </div>
  );
}

/**
 * Status badge component
 */
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-blue-100 text-blue-800',
    sent: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    revised: 'bg-purple-100 text-purple-800',
  };

  return (
    <span
      className={`px-2 py-0.5 text-xs font-medium rounded-full ${
        styles[status] || 'bg-gray-100 text-gray-800'
      }`}
    >
      {status}
    </span>
  );
}

/**
 * Extract display name from email address
 */
function extractDisplayName(email: string): string {
  if (!email) return 'Unknown';

  // Handle "Name <email>" format
  const nameMatch = email.match(/^([^<]+)</);
  if (nameMatch) {
    return nameMatch[1].trim().replace(/"/g, '');
  }

  // Extract username from email
  const atIndex = email.indexOf('@');
  if (atIndex > 0) {
    return email.substring(0, atIndex);
  }

  return email;
}

/**
 * Format relative time
 */
function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return then.toLocaleDateString();
}
