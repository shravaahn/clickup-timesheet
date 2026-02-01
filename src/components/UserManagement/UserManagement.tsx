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
  country: "US" | "INDIA" | null;
};

type Team = {
  id: string;
  name: string;
  manager_user_id: string | null;
};

const ROLE_ORDER = ["CONSULTANT", "MANAGER", "OWNER"] as const;
type Role = typeof ROLE_ORDER[number];

type ViewMode = "users" | "teams";

export default function UserManagementSection() {
  const [view, setView] = useState<ViewMode>("users");
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [newTeam, setNewTeam] = useState("");
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<any>(null);

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
    // Fetch current user to determine permissions
    fetch("/api/me").then(r => r.json()).then(data => {
      setMe(data?.user || null);
    });
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

  async function updateCountry(userId: string, country: "US" | "INDIA" | null) {
    try {
      await safePost("/api/iam/users/country", {
        userId,
        country,
      });
      fetchAll();
    } catch (err) {
      // Error already shown via alert
    }
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

  const isOwner = me?.is_owner || false;
  const isReadOnly = !isOwner;

  if (loading) return <div className={styles.card}>Loading…</div>;

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <h2 className={styles.title}>User Management</h2>
        
        <div className={styles.headerRight}>
          <div className={styles.viewToggle}>
            <button
              className={`${styles.toggleBtn} ${view === "users" ? styles.active : ""}`}
              onClick={() => setView("users")}
            >
              <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Users
            </button>
            <button
              className={`${styles.toggleBtn} ${view === "teams" ? styles.active : ""}`}
              onClick={() => setView("teams")}
            >
              <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
              </svg>
              Teams
            </button>
          </div>
        </div>
      </div>

      {view === "users" && (
        <>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Country</th>
                  <th>Team</th>
                  <th>Manager</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div className={styles.userCell}>
                        <div className={styles.avatar}>
                          {(u.name || u.email || "U")[0]?.toUpperCase()}
                        </div>
                        <span className={styles.userName}>{u.name}</span>
                      </div>
                    </td>
                    <td className={styles.emailCell}>{u.email}</td>
                    <td>
                      <select
                        className={styles.select}
                        value={getPrimaryRole(u.roles)}
                        onChange={e => changeRole(u, e.target.value as Role)}
                        disabled={isReadOnly}
                      >
                        {ROLE_ORDER.map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className={styles.select}
                        value={u.country || ""}
                        onChange={e => updateCountry(u.id, e.target.value as "US" | "INDIA" || null)}
                        disabled={isReadOnly}
                      >
                        <option value="">—</option>
                        <option value="US">United States</option>
                        <option value="INDIA">India</option>
                      </select>
                    </td>
                    <td>
                      <select
                        className={styles.select}
                        value={u.team_id || ""}
                        onChange={e => assignTeam(e.target.value, u.id)}
                        disabled={isReadOnly}
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
                        disabled={isReadOnly}
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
          </div>
        </>
      )}

      {view === "teams" && (
        <>
          {isOwner && (
            <div className={styles.createTeamSection}>
              <input
                className={styles.input}
                value={newTeam}
                onChange={e => setNewTeam(e.target.value)}
                placeholder="Enter team name"
                disabled={isReadOnly}
              />
              <button
                className={styles.btnPrimary}
                onClick={createTeam}
                disabled={isReadOnly || !newTeam.trim()}
              >
                <svg className={styles.btnIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Create Team
              </button>
            </div>
          )}

          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Team Name</th>
                  <th>Team Manager</th>
                </tr>
              </thead>
              <tbody>
                {teams.map(t => (
                  <tr key={t.id}>
                    <td>
                      <div className={styles.teamCell}>
                        <div className={styles.teamIcon}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="7" height="7" rx="1" />
                            <rect x="14" y="3" width="7" height="7" rx="1" />
                            <rect x="14" y="14" width="7" height="7" rx="1" />
                            <rect x="3" y="14" width="7" height="7" rx="1" />
                          </svg>
                        </div>
                        <span className={styles.teamName}>{t.name}</span>
                      </div>
                    </td>
                    <td>
                      <select
                        className={styles.select}
                        value={t.manager_user_id || ""}
                        onChange={e => assignManager(t.id, e.target.value)}
                        disabled={isReadOnly}
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
          </div>
        </>
      )}
    </section>
  );
}