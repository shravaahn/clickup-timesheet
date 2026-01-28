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
  reporting_manager_id: string | null;
  reporting_manager_name: string | null;
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

  async function safePost(url: string, body: any) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || `Request failed: ${res.status}`);
      throw new Error(err.error || "Request failed");
    }
  }

  function getPrimaryRole(roles: string[]): Role {
    if (roles.includes("OWNER")) return "OWNER";
    if (roles.includes("MANAGER")) return "MANAGER";
    return "CONSULTANT";
  }

  async function changeRole(user: User, nextRole: Role) {
    const current = getPrimaryRole(user.roles);
    if (current === nextRole) return;

    try {
      // remove higher roles first
      for (const role of ROLE_ORDER) {
        if (role !== nextRole && user.roles.includes(role)) {
          await safePost("/api/iam/users/role", {
            userId: user.id,
            role,
            action: "REMOVE",
          });
        }
      }

      // add selected role
      await safePost("/api/iam/users/role", {
        userId: user.id,
        role: nextRole,
        action: "ADD",
      });

      fetchAll();
    } catch (err) {
      // Error already shown via alert
    }
  }

  async function assignTeam(teamId: string, userId: string) {
    try {
      await safePost("/api/iam/teams/assign-member", {
        teamId,
        orgUserId: userId,
      });
      fetchAll();
    } catch (err) {
      // Error already shown via alert
    }
  }

  async function assignManager(teamId: string, managerUserId: string) {
    try {
      await safePost("/api/iam/teams/assign-manager", {
        teamId,
        managerUserId,
      });
      fetchAll();
    } catch (err) {
      // Error already shown via alert
    }
  }

  async function assignReportingManager(
    userId: string,
    managerUserId: string | null
  ) {
    const res = await fetch("/api/iam/users/manager", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        managerUserId: managerUserId || null,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to assign reporting manager");
      return;
    }

    fetchAll();
  }

  async function createTeam() {
    if (!newTeam.trim()) return;
    try {
      await safePost("/api/iam/teams/create", {
        name: newTeam,
      });
      setNewTeam("");
      fetchAll();
    } catch (err) {
      // Error already shown via alert
    }
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

              <td>
                <select
                  className={styles.select}
                  value={u.reporting_manager_id || ""}
                  onChange={(e) =>
                    assignReportingManager(
                      u.id,
                      e.target.value || null
                    )
                  }
                >
                  <option value="">—</option>

                  {users
                    .filter(
                      mgr =>
                        mgr.roles.includes("MANAGER") &&
                        mgr.id !== u.id
                    )
                    .map(mgr => (
                      <option key={mgr.id} value={mgr.id}>
                        {mgr.name}
                      </option>
                    ))}
                </select>
              </td>
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