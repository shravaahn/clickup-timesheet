// src/components/UserManagement/UserManagement.tsx
"use client";

import { useEffect, useState } from "react";
import styles from "./UserManagement.module.css";

type User = {
  id: string;
  name: string;
  role: "OWNER" | "MANAGER" | "CONSULTANT";
  team?: string;
  manager?: string;
  roles?: string[];
};

type TeamMember = {
  id: string;
  name: string;
  email: string;
};

type Team = {
  id: string;
  name: string;
  manager_user_id: string | null;
  manager: TeamMember | null;
  members: TeamMember[];
};

export default function UserManagementSection() {
  const [view, setView] = useState<"users" | "teams">("users");
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [usersRes, teamsRes] = await Promise.all([
        fetch("/api/iam/users").then(r => r.json()).catch(() => ({ users: [] })),
        fetch("/api/iam/teams").then(r => r.json()).catch(() => ({ teams: [] })),
      ]);

      // Transform users: get primary role from roles array
      const transformedUsers: User[] = (usersRes.users || []).map((user: any) => {
        const roles = user.roles || [];
        let primaryRole: "OWNER" | "MANAGER" | "CONSULTANT" = "CONSULTANT";
        if (roles.includes("OWNER")) primaryRole = "OWNER";
        else if (roles.includes("MANAGER")) primaryRole = "MANAGER";
        
        return {
          id: user.id,
          name: user.name || user.email || user.id,
          role: primaryRole,
          roles: roles,
          team: undefined, // TODO: resolve from team_members
          manager: undefined, // TODO: resolve from org_reporting
        };
      });

      setUsers(transformedUsers);
      setTeams(teamsRes.teams || []);
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch data:", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAssignManager = async (teamId: string, managerUserId: string) => {
    try {
      const res = await fetch("/api/iam/teams/assign-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, managerUserId }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.error || "Failed to assign manager");
        return;
      }

      await fetchData();
    } catch (err) {
      console.error("Failed to assign manager:", err);
      alert("Failed to assign manager");
    }
  };

  const handleAssignMember = async (teamId: string, orgUserId: string) => {
    if (!orgUserId) return;

    try {
      const res = await fetch("/api/iam/teams/assign-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, orgUserId }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.error || "Failed to assign member");
        return;
      }

      await fetchData();
    } catch (err) {
      console.error("Failed to assign member:", err);
      alert("Failed to assign member");
    }
  };

  if (loading) {
    return <div className={styles.card}>Loading…</div>;
  }

  const managerOptions = users.filter(u => u.roles?.includes("MANAGER"));
  const consultantOptions = users.filter(u => u.roles?.includes("CONSULTANT"));

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
              <th>Members</th>
              <th>Add Member</th>
            </tr>
          </thead>
          <tbody>
            {teams.map(team => {
              const memberIds = team.members.map(m => m.id);
              const availableConsultants = consultantOptions.filter(
                c => !memberIds.includes(c.id)
              );

              return (
                <tr key={team.id}>
                  <td>{team.name}</td>
                  <td>
                    <select
                      value={team.manager_user_id || ""}
                      onChange={(e) => handleAssignManager(team.id, e.target.value)}
                    >
                      <option value="">Select Manager</option>
                      {managerOptions.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {team.members.length > 0 ? (
                      <div>
                        {team.members.map(member => (
                          <div key={member.id}>{member.name}</div>
                        ))}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <select
                      value=""
                      onChange={(e) => handleAssignMember(team.id, e.target.value)}
                    >
                      <option value="">Add consultant...</option>
                      {availableConsultants.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}