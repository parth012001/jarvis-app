'use client';

import { trpc } from '@/lib/trpc/client';

interface TriggerToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

/**
 * Toggle switch for enabling/disabling Gmail auto-drafting
 */
export function TriggerToggle({ enabled, onToggle }: TriggerToggleProps) {
  const utils = trpc.useUtils();

  const enableMutation = trpc.drafts.enableTrigger.useMutation({
    onSuccess: () => {
      utils.drafts.getTriggerStatus.invalidate();
      onToggle();
    },
    onError: (err) => {
      alert(`Failed to enable: ${err.message}`);
    },
  });

  const disableMutation = trpc.drafts.disableTrigger.useMutation({
    onSuccess: () => {
      utils.drafts.getTriggerStatus.invalidate();
      onToggle();
    },
    onError: (err) => {
      alert(`Failed to disable: ${err.message}`);
    },
  });

  const isLoading = enableMutation.isPending || disableMutation.isPending;

  const handleToggle = () => {
    if (enabled) {
      disableMutation.mutate();
    } else {
      enableMutation.mutate();
    }
  };

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600">Auto-draft replies</span>
      <button
        onClick={handleToggle}
        disabled={isLoading}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
          enabled ? 'bg-green-500' : 'bg-gray-300'
        }`}
        role="switch"
        aria-checked={enabled}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
      {enabled && (
        <span className="text-xs text-green-600 font-medium flex items-center gap-1">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          Active
        </span>
      )}
      {isLoading && (
        <span className="text-xs text-gray-500">
          {enabled ? 'Disabling...' : 'Enabling...'}
        </span>
      )}
    </div>
  );
}
