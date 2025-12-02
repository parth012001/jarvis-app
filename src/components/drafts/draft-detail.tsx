'use client';

import { useState } from 'react';
import { type EmailDraft } from '@/lib/db/schema';
import { trpc } from '@/lib/trpc/client';

interface DraftDetailProps {
  draft: EmailDraft;
  onAction: () => void;
}

/**
 * Draft detail view with edit and send capabilities
 */
export function DraftDetail({ draft, onAction }: DraftDetailProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedBody, setEditedBody] = useState(draft.body);
  const [editedSubject, setEditedSubject] = useState(draft.subject);

  const utils = trpc.useUtils();

  // Update draft mutation
  const updateMutation = trpc.drafts.update.useMutation({
    onSuccess: () => {
      setIsEditing(false);
      utils.drafts.list.invalidate();
      onAction();
    },
    onError: (err) => {
      alert(`Failed to save: ${err.message}`);
    },
  });

  // Send draft mutation
  const sendMutation = trpc.drafts.send.useMutation({
    onSuccess: () => {
      utils.drafts.list.invalidate();
      onAction();
    },
    onError: (err) => {
      alert(`Failed to send: ${err.message}`);
    },
  });

  // Reject draft mutation
  const rejectMutation = trpc.drafts.reject.useMutation({
    onSuccess: () => {
      utils.drafts.list.invalidate();
      onAction();
    },
    onError: (err) => {
      alert(`Failed to discard: ${err.message}`);
    },
  });

  const isPending = draft.status === 'pending';
  const isSent = draft.status === 'sent';
  const isRejected = draft.status === 'rejected';

  const handleSave = () => {
    updateMutation.mutate({
      id: draft.id,
      subject: editedSubject,
      body: editedBody,
    });
  };

  const handleSend = () => {
    if (confirm('Are you sure you want to send this email?')) {
      sendMutation.mutate({ id: draft.id });
    }
  };

  const handleReject = () => {
    if (confirm('Are you sure you want to discard this draft?')) {
      rejectMutation.mutate({ id: draft.id });
    }
  };

  const handleCancelEdit = () => {
    setEditedBody(draft.body);
    setEditedSubject(draft.subject);
    setIsEditing(false);
  };

  // Reset edit state when draft changes
  if (editedBody !== draft.body && !isEditing) {
    setEditedBody(draft.body);
    setEditedSubject(draft.subject);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Original email context */}
      <div className="p-4 border-b bg-gray-50">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Replying to
          </span>
        </div>
        <div className="space-y-1">
          <p className="text-sm">
            <span className="font-medium text-gray-500">From:</span>{' '}
            <span className="text-gray-900">{draft.recipient}</span>
          </p>
          <p className="text-sm">
            <span className="font-medium text-gray-500">Subject:</span>{' '}
            <span className="text-gray-900">
              {draft.subject.replace(/^Re:\s*/i, '')}
            </span>
          </p>
        </div>
      </div>

      {/* Draft content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">AI Draft</h3>
          {isPending && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Edit
            </button>
          )}
          {isEditing && (
            <button
              onClick={handleCancelEdit}
              className="text-sm text-gray-600 hover:text-gray-700 font-medium"
            >
              Cancel
            </button>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Subject
              </label>
              <input
                type="text"
                value={editedSubject}
                onChange={(e) => setEditedSubject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Body
              </label>
              <textarea
                value={editedBody}
                onChange={(e) => setEditedBody(e.target.value)}
                rows={12}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        ) : (
          <div>
            <div className="mb-4 space-y-2">
              <p className="text-sm">
                <span className="font-medium text-gray-500">To:</span>{' '}
                <span className="text-gray-900">{draft.recipient}</span>
              </p>
              <p className="text-sm">
                <span className="font-medium text-gray-500">Subject:</span>{' '}
                <span className="text-gray-900">{draft.subject}</span>
              </p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 whitespace-pre-wrap text-gray-800 leading-relaxed">
              {draft.body}
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {isPending && (
        <div className="p-4 border-t bg-gray-50 flex gap-3">
          <button
            onClick={handleSend}
            disabled={sendMutation.isPending || isEditing}
            className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {sendMutation.isPending ? (
              <>
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Sending...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Approve & Send
              </>
            )}
          </button>
          <button
            onClick={handleReject}
            disabled={rejectMutation.isPending || isEditing}
            className="px-4 py-2.5 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 disabled:opacity-50"
          >
            Discard
          </button>
        </div>
      )}

      {/* Sent status */}
      {isSent && (
        <div className="p-4 border-t bg-green-50 text-green-700 text-center flex items-center justify-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-medium">
            Sent {draft.sentAt ? formatDate(draft.sentAt) : ''}
          </span>
        </div>
      )}

      {/* Rejected status */}
      {isRejected && (
        <div className="p-4 border-t bg-red-50 text-red-700 text-center flex items-center justify-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span className="font-medium">Discarded</span>
        </div>
      )}
    </div>
  );
}

/**
 * Format date for display
 */
function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleString();
}
