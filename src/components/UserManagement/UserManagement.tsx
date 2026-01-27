// src/components/UserManagement/UserManagement.tsx
"use client";

import { useEffect, useState } from "react";
import styles from "./UserManagement.module.css";

type User = {
  id: string;
  name: string;
  email: string;
  roles: string[];
  team_id: string | null;
  team_name: string | null;
  manager_name: string | null;
  is_active: boolean;
};

type Team = {
  id: string;
  name: string;
  manager_user_id: string | null;
};

const ROLE_ORDER = ["CONSULTANT", "MANAGER", "OWNER"] as const;
type Role = typeof ROLE_ORDER[number];

export default function UserManagementSection() {
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [newTeam, setNewTeam] = useState("");
  const [loading, setLoading] = useState(true);

  async function fetchAll() {
    setLoading(true);
    const [u, t] = await Promise.all([
      fetch("/api/iam/users").then(r => r.json()),
      fetch("/api/iam/teams").then(r => r.json()),
    ]);
    setUsers(u.users || []);
    setTeams(t.teams || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchAll();
  }, []);

  function getPrimaryRole(roles: string[]): Role {
    if (roles.includes("OWNER")) return "OWNER";
    if (roles.includes("MANAGER")) return "MANAGER";
    return "CONSULTANT";
  }

  async function changeRole(user: User, nextRole: Role) {
    const current = getPrimaryRole(user.roles);
    if (current === nextRole) return;

    // remove higher roles first
    for (const role of ROLE_ORDER) {
      if (role !== nextRole && user.roles.includes(role)) {
        await fetch("/api/iam/users/role", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, role, action: "REMOVE" }),
        });
      }
    }

    // add selected role
    await fetch("/api/iam/users/role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, role: nextRole, action: "ADD" }),
    });

    fetchAll();
  }

  async function assignTeam(teamId: string, userId: string) {
    await fetch("/api/iam/teams/assign-member", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, orgUserId: userId }),
    });
    fetchAll();
  }

  async function assignManager(teamId: string, managerUserId: string) {
    await fetch("/api/iam/teams/assign-manager", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, managerUserId }),
    });
    fetchAll();
  }

  async function createTeam() {
    if (!newTeam.trim()) return;
    await fetch("/api/iam/teams/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTeam }),
    });
    setNewTeam("");
    fetchAll();
  }

  if (loading) return <div className={styles.card}>Loading…</div>;

  return (
    <section className={styles.card}>
      <h2>User Management</h2>

      {/* CREATE TEAM */}
      <div className={styles.createTeam}>
        <input
          value={newTeam}
          onChange={e => setNewTeam(e.target.value)}
          placeholder="New team name"
        />
        <button onClick={createTeam}>Create Team</button>
      </div>

      {/* USERS */}
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Team</th>
            <th>Manager</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td>{u.name}</td>

              <td>
                <select
                  className={styles.select}
                  value={getPrimaryRole(u.roles)}
                  onChange={e => changeRole(u, e.target.value as Role)}
                >
                  {ROLE_ORDER.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </td>

              <td>
                <select
                  className={styles.select}
                  value={u.team_id || ""}
                  onChange={e => assignTeam(e.target.value, u.id)}
                >
                  <option value="">—</option>
                  {teams.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </td>

              <td>{u.manager_name || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* TEAMS */}
      <h3>Teams</h3>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Team</th>
            <th>Manager</th>
          </tr>
        </thead>
        <tbody>
          {teams.map(t => (
            <tr key={t.id}>
              <td>{t.name}</td>
              <td>
                <select
                  className={styles.select}
                  value={t.manager_user_id || ""}
                  onChange={e => assignManager(t.id, e.target.value)}
                >
                  <option value="">—</option>
                  {users
                    .filter(u => u.roles.includes("MANAGER"))
                    .map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
