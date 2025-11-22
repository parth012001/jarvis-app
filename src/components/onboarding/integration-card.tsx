'use client';

interface IntegrationCardProps {
  name: string;
  description: string;
  icon: React.ReactNode;
  status: 'pending' | 'connected' | 'error' | null;
  onConnect: () => void;
  onDisconnect?: () => void;
}

export function IntegrationCard({
  name,
  description,
  icon,
  status,
  onConnect,
  onDisconnect,
}: IntegrationCardProps) {
  const isConnected = status === 'connected';
  const isPending = status === 'pending';

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
            {isPending && (
              <span className="inline-flex items-center gap-1 text-sm text-yellow-600 font-medium">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Connecting...
              </span>
            )}
          </div>
        </div>
      </div>

      <p className="text-gray-600 text-sm mb-6">{description}</p>

      <div className="flex gap-2">
        {!isConnected ? (
          <button
            onClick={onConnect}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            {isPending ? 'Retry Connection' : 'Connect'}
          </button>
        ) : (
          <>
            <button
              onClick={onConnect}
              className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              Reconnect
            </button>
            {onDisconnect && (
              <button
                onClick={onDisconnect}
                className="px-4 py-2 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition-colors"
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
