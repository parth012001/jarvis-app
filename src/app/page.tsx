import { SignInButton, SignUpButton, SignedIn, SignedOut } from "@clerk/nextjs";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-2xl px-8 py-16 text-center">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">
          Welcome to Jarvis
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Your AI Chief of Staff for email, calendar, and workflow management
        </p>

        <SignedOut>
          <div className="flex gap-4 justify-center">
            <SignInButton mode="modal">
              <button className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition">
                Sign In
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="px-6 py-3 bg-white text-blue-600 border-2 border-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition">
                Sign Up
              </button>
            </SignUpButton>
          </div>
        </SignedOut>

        <SignedIn>
          <Link
            href="/dashboard"
            className="inline-block px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
          >
            Go to Dashboard →
          </Link>
        </SignedIn>
      </div>
    </div>
  );
}
