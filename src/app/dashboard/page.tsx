'use client';

import { trpc } from "@/lib/trpc/client";

export default function DashboardPage() {
  const { data: user, isLoading } = trpc.user.me.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-4">
        Welcome back{user?.firstName ? `, ${user.firstName}` : ''}!
      </h1>
      <p className="text-gray-600 mb-6">
        Your AI Chief of Staff is ready to help you manage emails, calendar, and workflows.
      </p>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-2">Getting Started</h2>
        <p className="text-gray-600 mb-4">
          Next step: Connect your integrations (Hyperspell & Composio)
        </p>

        {user && (
          <div className="mt-4 p-4 bg-gray-50 rounded border border-gray-200">
            <p className="text-sm font-medium text-gray-700 mb-2">User Info:</p>
            <p className="text-sm text-gray-600">Email: {user.email}</p>
            <p className="text-sm text-gray-500">ID: {user.id}</p>
          </div>
        )}
      </div>
    </div>
  );
}
