export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
      <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-md">
        
        {/* Logo + Title */}
        <div className="flex items-center mb-6">
          <div className="bg-blue-500 text-white rounded-full w-10 h-10 flex items-center justify-center text-lg font-bold">
            TT
          </div>
          <div className="ml-3">
            <div className="font-bold text-lg">Weekly Time Tracking</div>
          </div>
        </div>

        {/* Sign In Title */}
        <h2 className="text-xl font-semibold mb-2">Sign in</h2>
        <p className="text-gray-400 text-sm mb-6">
          Please enter your login details below.
        </p>

        {/* Form */}
        <form className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Username</label>
            <input
              type="text"
              placeholder="e.g., consultant"
              className="w-full px-3 py-2 bg-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Password</label>
            <input
              type="password"
              placeholder="••••••"
              className="w-full px-3 py-2 bg-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Role</label>
            <select className="w-full px-3 py-2 bg-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="consultant">Consultant</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {/* Continue Button */}
          <a
            href="/api/auth/clickup-login"
            className="block w-full bg-blue-600 hover:bg-blue-700 text-center py-2 rounded-md font-semibold transition"
          >
            Continue
          </a>
        </form>
      </div>
    </div>
  );
}
