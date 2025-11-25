'use client';

import { trpc } from '@/lib/trpc/client';
import { IntegrationCard } from '@/components/onboarding/integration-card';
import { useRouter } from 'next/navigation';
import { useComposioConnection } from '@/hooks/useComposioConnection';
import { useState } from 'react';

export default function OnboardingPage() {
  const router = useRouter();
  const { data: integrations, isLoading, refetch } = trpc.integrations.list.useQuery();
  const disconnectMutation = trpc.integrations.disconnect.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Use the custom hook for Composio connection management
  const {
    connect: connectComposio,
    isConnecting: isComposioConnecting,
    progress: composioProgress,
    error: composioError,
    currentApp,
  } = useComposioConnection({
    onSuccess: ({ app }) => {
      setSuccessMessage(`${app} connected successfully!`);
      setErrorMessage(null);
      refetch(); // Refresh integration list
      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    },
    onError: (error) => {
      setErrorMessage(error.message);
      setSuccessMessage(null);
      refetch(); // Refresh to show error state
    },
    onCancel: () => {
      setErrorMessage('Connection cancelled');
      setSuccessMessage(null);
      refetch();
    },
  });

  const hyperspellConnected = integrations?.hyperspell?.status === 'connected';
  const composioConnected =
    integrations?.composio && integrations.composio.length > 0
      ? integrations.composio.some((app) => app.status === 'connected')
      : false;
  const allConnected = hyperspellConnected && composioConnected;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-600">Loading integrations...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Connect Your Tools</h1>
        <p className="text-gray-600">
          Connect Hyperspell and Composio to enable Jarvis to access your data and perform actions
          on your behalf.
        </p>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg animate-fadeIn">
          <div className="flex items-center gap-2 text-green-800">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span className="font-medium">{successMessage}</span>
          </div>
        </div>
      )}

      {/* Error Message */}
      {(errorMessage || composioError) && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg animate-fadeIn">
          <div className="flex items-center gap-2 text-red-800">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <span className="font-medium">{errorMessage || composioError}</span>
          </div>
        </div>
      )}

      {/* Connection Progress */}
      {isComposioConnecting && currentApp && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg animate-fadeIn">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-blue-800">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="font-medium">Connecting {currentApp}...</span>
            </div>
            <span className="text-sm text-blue-600 font-medium">{composioProgress}%</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-600 h-2 transition-all duration-500 ease-out"
              style={{ width: `${composioProgress}%` }}
            />
          </div>
          <p className="text-sm text-blue-700 mt-2">
            Please complete the authorization in the popup window...
          </p>
        </div>
      )}

      {allConnected && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-2 text-green-800">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span className="font-medium">All integrations connected!</span>
          </div>
          <p className="text-sm text-green-700 mt-1">
            You're all set. Jarvis can now help you with email, calendar, and workflow management.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <IntegrationCard
          name="Hyperspell"
          description="Search across Gmail, Google Calendar, Slack, and Notion. Gives Jarvis context about your work."
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          }
          status={integrations?.hyperspell?.status as any}
          onConnect={() => {
            window.open('/api/integrations/hyperspell/connect', '_blank');
          }}
          onDisconnect={() => {
            if (confirm('Are you sure you want to disconnect Hyperspell?')) {
              disconnectMutation.mutate({ provider: 'hyperspell' });
            }
          }}
        />

        <IntegrationCard
          name="Composio"
          description="Send emails and create calendar events. Gives Jarvis the ability to take actions for you."
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          }
          status={
            isComposioConnecting
              ? 'connecting'
              : (integrations?.composio && integrations.composio.length > 0
                ? integrations.composio.some((app) => app.status === 'connected')
                  ? 'connected'
                  : integrations.composio.some((app) => app.status === 'pending')
                    ? 'pending'
                    : undefined
                : undefined) as any
          }
          progress={isComposioConnecting ? composioProgress : undefined}
          onConnect={() => {
            connectComposio('gmail');
          }}
          onDisconnect={() => {
            if (confirm('Are you sure you want to disconnect all Composio apps?')) {
              // Disconnect all Composio apps
              integrations?.composio?.forEach((app) => {
                if (app.appName) {
                  disconnectMutation.mutate({ provider: 'composio', appName: app.appName });
                }
              });
            }
          }}
          disabled={isComposioConnecting}
        />
      </div>

      {allConnected && (
        <div className="flex justify-center">
          <button
            onClick={() => router.push('/dashboard')}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Continue to Dashboard →
          </button>
        </div>
      )}

      {!allConnected && (
        <div className="text-center text-sm text-gray-500">
          Connect both integrations to start using Jarvis
        </div>
      )}
    </div>
  );
}
