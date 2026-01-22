// src/app/admin/users/page.tsx

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type UserRow = {
  id: string;
  clickup_user_id: string;
  name: string;
  email: string;
  country: string | null;
  is_active: boolean;
  roles: string[];
};

const ALL_ROLES = ["OWNER", "ADMIN", "MANAGER", "CONSULTANT"];

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadUsers() {
    setLoading(true);
    const res = await fetch("/api/iam/users");
    if (res.status === 403) {
      router.replace("/dashboard");
      return;
    }
    const json = await res.json();
    setUsers(json.users || []);
    setLoading(false);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function updateRole(
    userId: string,
    role: string,
    action: "ADD" | "REMOVE"
  ) {
    await fetch("/api/iam/users/role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role, action }),
    });
    await loadUsers();
  }

  async function updateManager(userId: string, managerId: string | null) {
    await fetch("/api/iam/users/manager", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, managerId }),
    });
    await loadUsers();
  }

  async function updateStatus(userId: string, isActive: boolean) {
    await fetch("/api/iam/users/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, isActive }),
    });
    await loadUsers();
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading users…</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">User Management</h1>
        <p className="text-sm text-muted-foreground">
          Manage roles, managers, and access across the organization.
        </p>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Manager</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">
                  {u.name}
                  {u.country && (
                    <div className="text-xs text-muted-foreground">
                      {u.country}
                    </div>
                  )}
                </TableCell>

                <TableCell>{u.email}</TableCell>

                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {ALL_ROLES.map((role) => {
                      const hasRole = u.roles.includes(role);
                      return (
                        <Badge
                          key={role}
                          variant={hasRole ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() =>
                            updateRole(
                              u.id,
                              role,
                              hasRole ? "REMOVE" : "ADD"
                            )
                          }
                        >
                          {role}
                        </Badge>
                      );
                    })}
                  </div>
                </TableCell>

                <TableCell>
                  <Select
                    value={
                      users.find(
                        (x) =>
                          x.id !== u.id &&
                          x.roles.includes("MANAGER") &&
                          x.id ===
                            (users.find(
                              (h) => h.id === u.id
                            ) as any)?.manager_id
                      )?.id || ""
                    }
                    onValueChange={(val) =>
                      updateManager(u.id, val || null)
                    }
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Select manager" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No manager</SelectItem>
                      {users
                        .filter(
                          (x) =>
                            x.id !== u.id &&
                            (x.roles.includes("MANAGER") ||
                              x.roles.includes("ADMIN") ||
                              x.roles.includes("OWNER"))
                        )
                        .map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </TableCell>

                <TableCell>
                  <Switch
                    checked={u.is_active}
                    onCheckedChange={(val) =>
                      updateStatus(u.id, val)
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
