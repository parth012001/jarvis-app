import { useState, useCallback, useRef, useEffect } from 'react';
import { trpc } from '@/lib/trpc/client';

/**
 * Custom hook for managing Composio OAuth connections with polling
 *
 * Features:
 * - Opens OAuth popup window
 * - Polls connection status until complete
 * - Handles errors and timeouts gracefully
 * - Automatic cleanup on unmount
 * - Provides connection state and progress
 *
 * @example
 * ```tsx
 * const { connect, isConnecting, error, progress } = useComposioConnection({
 *   onSuccess: () => console.log('Connected!'),
 *   onError: (err) => console.error(err),
 * });
 *
 * <button onClick={() => connect('gmail')} disabled={isConnecting}>
 *   {isConnecting ? `Connecting... ${progress}%` : 'Connect Gmail'}
 * </button>
 * ```
 */

export interface UseComposioConnectionOptions {
  /**
   * Callback when connection succeeds
   */
  onSuccess?: (result: { app: string; connectedAccountId: string }) => void;

  /**
   * Callback when connection fails
   */
  onError?: (error: Error) => void;

  /**
   * Callback when connection flow is cancelled by user
   */
  onCancel?: () => void;

  /**
   * Timeout for connection polling in milliseconds
   * @default 120000 (2 minutes)
   */
  timeoutMs?: number;

  /**
   * Width of OAuth popup window
   * @default 600
   */
  popupWidth?: number;

  /**
   * Height of OAuth popup window
   * @default 700
   */
  popupHeight?: number;
}

export type ComposioApp = 'gmail' | 'googlecalendar' | 'slack' | 'notion' | 'github';

export function useComposioConnection(options: UseComposioConnectionOptions = {}) {
  const {
    onSuccess,
    onError,
    onCancel,
    timeoutMs = 120000,
    popupWidth = 600,
    popupHeight = 700,
  } = options;

  const [isConnecting, setIsConnecting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [currentApp, setCurrentApp] = useState<ComposioApp | null>(null);

  const popupRef = useRef<Window | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const initiateMutation = trpc.integrations.initiateComposioConnection.useMutation();
  const pollMutation = trpc.integrations.pollComposioConnection.useMutation();

  /**
   * Cleanup function to close popup and clear intervals
   */
  const cleanup = useCallback(() => {
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    popupRef.current = null;
  }, []);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  /**
   * Simulate progress for better UX
   * Progress goes from 0 to 90% during polling
   */
  const startProgressSimulation = useCallback(() => {
    setProgress(0);
    const startTime = Date.now();
    const duration = timeoutMs;

    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const percentage = Math.min((elapsed / duration) * 90, 90); // Cap at 90%
      setProgress(Math.round(percentage));
    }, 500);
  }, [timeoutMs]);

  /**
   * Stop progress simulation
   */
  const stopProgressSimulation = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  /**
   * Open OAuth popup window
   */
  const openPopup = useCallback(
    (url: string): Window | null => {
      const left = window.screenX + (window.outerWidth - popupWidth) / 2;
      const top = window.screenY + (window.outerHeight - popupHeight) / 2;

      const popup = window.open(
        url,
        'composio_oauth',
        `width=${popupWidth},height=${popupHeight},left=${left},top=${top},toolbar=no,menubar=no,location=no,status=no`
      );

      return popup;
    },
    [popupWidth, popupHeight]
  );

  /**
   * Poll popup window to detect when it closes
   */
  const monitorPopup = useCallback(
    (popup: Window, connectionId: string, app: ComposioApp) => {
      pollIntervalRef.current = setInterval(() => {
        if (popup.closed) {
          cleanup();
          stopProgressSimulation();
          setIsConnecting(false);
          setCurrentApp(null);

          // User closed popup - consider it cancelled
          if (onCancel) {
            onCancel();
          }
        }
      }, 500);

      // Start polling the connection status
      pollConnection(connectionId, app);
    },
    [cleanup, stopProgressSimulation, onCancel]
  );

  /**
   * Poll connection status via tRPC
   */
  const pollConnection = useCallback(
    async (connectionId: string, app: ComposioApp) => {
      try {
        const result = await pollMutation.mutateAsync({
          connectionId,
          app,
          timeoutMs,
        });

        // Success!
        cleanup();
        stopProgressSimulation();
        setProgress(100);
        setIsConnecting(false);
        setCurrentApp(null);
        setError(null);

        if (result.isActive && onSuccess) {
          onSuccess({
            app: result.app,
            connectedAccountId: result.connectedAccountId,
          });
        } else {
          const errorMessage = `Connection failed with status: ${result.status}`;
          setError(errorMessage);
          if (onError) {
            onError(new Error(errorMessage));
          }
        }
      } catch (err) {
        cleanup();
        stopProgressSimulation();
        setIsConnecting(false);
        setCurrentApp(null);

        const errorMessage = err instanceof Error ? err.message : 'Connection failed';
        setError(errorMessage);

        if (onError) {
          onError(err instanceof Error ? err : new Error(errorMessage));
        }
      }
    },
    [pollMutation, timeoutMs, cleanup, stopProgressSimulation, onSuccess, onError]
  );

  /**
   * Connect to a Composio app
   */
  const connect = useCallback(
    async (app: ComposioApp) => {
      // Prevent multiple simultaneous connections
      if (isConnecting) {
        console.warn('[useComposioConnection] Already connecting to an app');
        return;
      }

      setIsConnecting(true);
      setCurrentApp(app);
      setError(null);
      setProgress(0);
      startProgressSimulation();

      try {
        // Step 1: Initiate connection and get OAuth URL
        const result = await initiateMutation.mutateAsync({ app });

        if (!result.redirectUrl) {
          throw new Error('Failed to get OAuth URL from server');
        }

        // Step 2: Open OAuth popup
        const popup = openPopup(result.redirectUrl);

        if (!popup) {
          throw new Error('Failed to open OAuth popup. Please allow popups for this site.');
        }

        popupRef.current = popup;

        // Step 3: Monitor popup and poll connection status
        monitorPopup(popup, result.connectionId, app);
      } catch (err) {
        cleanup();
        stopProgressSimulation();
        setIsConnecting(false);
        setCurrentApp(null);

        const errorMessage = err instanceof Error ? err.message : 'Failed to initiate connection';
        setError(errorMessage);

        if (onError) {
          onError(err instanceof Error ? err : new Error(errorMessage));
        }
      }
    },
    [
      isConnecting,
      startProgressSimulation,
      initiateMutation,
      openPopup,
      monitorPopup,
      cleanup,
      stopProgressSimulation,
      onError,
    ]
  );

  /**
   * Cancel current connection attempt
   */
  const cancel = useCallback(() => {
    cleanup();
    stopProgressSimulation();
    setIsConnecting(false);
    setCurrentApp(null);
    setError(null);
    setProgress(0);

    if (onCancel) {
      onCancel();
    }
  }, [cleanup, stopProgressSimulation, onCancel]);

  return {
    /**
     * Connect to a Composio app
     */
    connect,

    /**
     * Cancel current connection attempt
     */
    cancel,

    /**
     * Whether a connection is currently in progress
     */
    isConnecting,

    /**
     * Current connection progress (0-100)
     */
    progress,

    /**
     * Current error message, if any
     */
    error,

    /**
     * Current app being connected, if any
     */
    currentApp,

    /**
     * Clear error state
     */
    clearError: () => setError(null),
  };
}
