'use client';

interface IntegrationCardProps {
  name: string;
  description: string;
  icon: React.ReactNode;
  status: 'pending' | 'connected' | 'connecting' | 'error' | null;
  progress?: number;
  onConnect: () => void;
  onDisconnect?: () => void;
  disabled?: boolean;
}

export function IntegrationCard({
  name,
  description,
  icon,
  status,
  progress,
  onConnect,
  onDisconnect,
  disabled = false,
}: IntegrationCardProps) {
  const isConnected = status === 'connected';
  const isPending = status === 'pending';
  const isConnecting = status === 'connecting';
  const isError = status === 'error';

  return (
    <div className="bg-white rounded-lg border-2 border-gray-200 p-6 hover:border-blue-300 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white">
            {icon}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{name}</h3>
            {isConnected && (
              <span className="inline-flex items-center gap-1 text-sm text-green-600 font-medium">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                Connected
              </span>
            )}
            {(isPending || isConnecting) && (
              <span className="inline-flex items-center gap-1 text-sm text-yellow-600 font-medium">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {isConnecting ? `Connecting... ${progress || 0}%` : 'Connecting...'}
              </span>
            )}
            {isError && (
              <span className="inline-flex items-center gap-1 text-sm text-red-600 font-medium">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                Connection Failed
              </span>
            )}
          </div>
        </div>
      </div>

      <p className="text-gray-600 text-sm mb-4">{description}</p>

      {/* Progress Bar for Connecting State */}
      {isConnecting && progress !== undefined && (
        <div className="mb-4">
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-600 h-2 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {!isConnected ? (
          <button
            onClick={onConnect}
            disabled={disabled || isConnecting}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
              disabled || isConnecting
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isConnecting
              ? 'Connecting...'
              : isPending || isError
              ? 'Retry Connection'
              : 'Connect'}
          </button>
        ) : (
          <>
            <button
              onClick={onConnect}
              disabled={disabled || isConnecting}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                disabled || isConnecting
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Reconnect
            </button>
            {onDisconnect && (
              <button
                onClick={onDisconnect}
                disabled={disabled || isConnecting}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  disabled || isConnecting
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-red-50 text-red-600 hover:bg-red-100'
                }`}
              >
                Disconnect
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
