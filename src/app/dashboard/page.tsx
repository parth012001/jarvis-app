import { auth } from "@clerk/nextjs/server";

export default async function DashboardPage() {
  const { userId } = await auth();

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-4">Welcome to Jarvis</h1>
      <p className="text-gray-600 mb-6">
        Your AI Chief of Staff is ready to help you manage emails, calendar, and workflows.
      </p>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-2">Getting Started</h2>
        <p className="text-gray-600 mb-4">
          Next step: Connect your integrations (Hyperspell & Composio)
        </p>
        <p className="text-sm text-gray-500">User ID: {userId}</p>
      </div>
    </div>
  );
}
