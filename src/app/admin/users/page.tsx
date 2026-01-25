// src/app/admin/users/page.tsx

"use client";

import { useEffect, useState } from "react";

type User = {
  id: string;
  clickup_user_id: string;
  email: string;
  name: string;
  is_active: boolean;
  roles: string[];
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadUsers() {
    setLoading(true);
    const res = await fetch("/api/iam/users", { cache: "no-store" });
    const json = await res.json();
    setUsers(json.users || []);
    setLoading(false);
  }

  async function toggleStatus(userId: string, enabled: boolean) {
    await fetch("/api/iam/users/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, isActive: enabled }),
    });
    loadUsers();
  }

  async function updateRole(userId: string, role: string) {
    await fetch("/api/iam/users/role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    loadUsers();
  }

  async function updateManager(userId: string, managerId: string | null) {
    await fetch("/api/iam/users/manager", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, managerId }),
    });
    loadUsers();
  }

  useEffect(() => {
    loadUsers();
  }, []);

  if (loading) {
    return <div className="p-6">Loading users…</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">User Management</h1>

      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Role</th>
              <th className="p-3">Manager</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>

          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-t">
                <td className="p-3">{u.name}</td>
                <td className="p-3">{u.email}</td>

                <td className="p-3">
                  <select
                    value={u.roles[0] || "CONSULTANT"}
                    onChange={e => updateRole(u.id, e.target.value)}
                    className="border rounded px-2 py-1"
                  >
                    <option value="OWNER">OWNER</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="CONSULTANT">CONSULTANT</option>
                  </select>
                </td>

                <td className="p-3">
                  <select
                    onChange={e =>
                      updateManager(u.id, e.target.value || null)
                    }
                    className="border rounded px-2 py-1"
                    defaultValue=""
                  >
                    <option value="">— None —</option>
                    {users
                      .filter(x => x.id !== u.id)
                      .map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </td>

                <td className="p-3">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={u.is_active}
                      onChange={e =>
                        toggleStatus(u.id, e.target.checked)
                      }
                    />
                    {u.is_active ? "Active" : "Disabled"}
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
