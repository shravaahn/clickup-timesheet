"use client";

import { useEffect, useState } from "react";
import styles from "./UserManagement.module.css";

type User = {
  id: string;
  name: string;
  role: "OWNER" | "MANAGER" | "CONSULTANT";
  team?: string;
  manager?: string;
};

type Team = {
  id: string;
  name: string;
  manager?: string;
  consultant?: string;
};

export default function UserManagementSection() {
  const [view, setView] = useState<"users" | "teams">("users");
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/iam/users").then(r => r.json()).catch(() => ({ users: [] })),
      fetch("/api/iam/teams").then(r => r.json()).catch(() => ({ teams: [] })),
    ]).then(([u, t]) => {
      // Transform users: get primary role from roles array
      const transformedUsers: User[] = (u.users || []).map((user: any) => {
        const roles = user.roles || [];
        let primaryRole: "OWNER" | "MANAGER" | "CONSULTANT" = "CONSULTANT";
        if (roles.includes("OWNER")) primaryRole = "OWNER";
        else if (roles.includes("MANAGER")) primaryRole = "MANAGER";
        
        return {
          id: user.id,
          name: user.name || user.email || user.id,
          role: primaryRole,
          team: undefined, // TODO: resolve from team_members
          manager: undefined, // TODO: resolve from org_reporting
        };
      });
      
      // Transform teams: flatten nested structure
      const transformedTeams: Team[] = (t.teams || []).map((team: any) => {
        const managerName = team.manager_user_id ? "Manager" : undefined; // TODO: resolve manager name
        const members = team.team_members || [];
        const consultantName = members.length > 0 && members[0].org_users 
          ? (members[0].org_users.name || members[0].org_users.email)
          : undefined;
        
        return {
          id: team.id,
          name: team.name,
          manager: managerName,
          consultant: consultantName,
        };
      });
      
      setUsers(transformedUsers);
      setTeams(transformedTeams);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className={styles.card}>Loading…</div>;
  }

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <h2>User Management</h2>
        <div className={styles.toggle}>
          <button
            className={view === "users" ? styles.active : ""}
            onClick={() => setView("users")}
          >
            Users
          </button>
          <button
            className={view === "teams" ? styles.active : ""}
            onClick={() => setView("teams")}
          >
            Teams
          </button>
        </div>
      </div>

      {view === "users" && (
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
                  <span className={`${styles.pill} ${styles[u.role.toLowerCase()]}`}>
                    {u.role}
                  </span>
                </td>
                <td>{u.team || "—"}</td>
                <td>{u.manager || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {view === "teams" && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Team</th>
              <th>Manager</th>
              <th>Consultant</th>
            </tr>
          </thead>
          <tbody>
            {teams.map(t => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{t.manager || "—"}</td>
                <td>{t.consultant || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
