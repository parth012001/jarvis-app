interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{ toolName?: string; args?: unknown }>;
}

export function MessageBubble({ role, content, toolCalls }: MessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-white text-gray-900 border border-gray-200'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{content}</p>

        {toolCalls && toolCalls.length > 0 && (
          <div className="mt-2 pt-2 border-t border-blue-400 flex flex-wrap gap-2">
            {toolCalls.map((call, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500 bg-opacity-20 rounded text-xs"
              >
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                {call.toolName || 'Tool'}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
