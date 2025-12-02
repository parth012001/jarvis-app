'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { MessageList, type Message } from '@/components/chat/message-list';
import { MessageInput } from '@/components/chat/message-input';

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use mutation instead of subscription
  const sendMessage = trpc.chat.sendMessage.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        // Add assistant response
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: data.content,
          },
        ]);
      } else {
        setError(data.error || 'Failed to get response');
      }
      setIsLoading(false);
    },
    onError: (err) => {
      console.error('[Chat] Mutation error:', err);
      setError(err.message);
      setIsLoading(false);
    },
  });

  const handleSendMessage = (message: string) => {
    // Add user message
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
    };
    setMessages((prev) => [...prev, userMessage]);
    setError(null);
    setIsLoading(true);

    // Send to backend
    sendMessage.mutate({ message });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Chat with Jarvis</h1>
        <p className="text-sm text-gray-600 mt-1">
          Your AI agent with connected tools
        </p>
      </div>

      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2 text-red-800">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <span className="font-medium">{error}</span>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
        <MessageList
          messages={messages}
          isStreaming={isLoading}
          onSendMessage={handleSendMessage}
        />

        <div className="border-t border-gray-200 bg-white px-6 py-4">
          <MessageInput onSend={handleSendMessage} disabled={isLoading} />
        </div>
      </div>
    </div>
  );
}
