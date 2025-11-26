import { useEffect, useRef } from 'react';
import { MessageBubble } from './message-bubble';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{ toolName?: string; args?: unknown }>;
}

interface MessageListProps {
  messages: Message[];
  isStreaming?: boolean;
  onSendMessage?: (message: string) => void;
}

export function MessageList({ messages, isStreaming, onSendMessage }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Start a conversation
          </h3>
          <p className="text-gray-600 mb-4">
            Your agent has access to your connected tools and can help you with:
          </p>
          <div className="flex flex-col gap-2 max-w-md mx-auto">
            <button
              onClick={() => onSendMessage?.('What tools do I have access to?')}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
            >
              What tools do I have access to?
            </button>
            <button
              onClick={() => onSendMessage?.('List my recent emails')}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
            >
              List my recent emails
            </button>
            <button
              onClick={() => onSendMessage?.('Search my memories for project updates')}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
            >
              Search my memories for project updates
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          role={message.role}
          content={message.content}
          toolCalls={message.toolCalls}
        />
      ))}

      {isStreaming && (
        <div className="flex justify-start mb-4">
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-2">
            <div className="flex items-center gap-2 text-gray-600">
              <svg
                className="w-5 h-5 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span className="text-sm">Thinking...</span>
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
