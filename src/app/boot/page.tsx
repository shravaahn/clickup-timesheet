"use client";

import { useEffect, useState } from "react";

type User = { id: string; username: string };
type Team = { id: string; name: string };
type Task = { id: string; name: string; assignees: User[] };

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkLoginAndLoad() {
      try {
        setLoading(true);

        // Check session
        const sessionRes = await fetch("/api/session");
        const sessionData = await sessionRes.json();

        if (!sessionData.loggedIn) {
          setLoggedIn(false);
          return;
        }
        setLoggedIn(true);

        // Fetch teams
        const teamsRes = await fetch("/api/teams");
        const teamsData = await teamsRes.json();
        setTeams(teamsData.teams || []);

        if (teamsData.teams?.length > 0) {
          const teamId = teamsData.teams[0].id;

          // Fetch tasks
          const tasksRes = await fetch(`/api/tasks/${teamId}`);
          const tasksData = await tasksRes.json();
          setTasks(tasksData.tasks || []);
        }
      } catch (err) {
        console.error("Error loading dashboard:", err);
        setError("Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    }

    checkLoginAndLoad();
  }, []);

  if (loading) return <p className="p-4">Loading...</p>;

  if (!loggedIn) {
    return (
      <section id="login-section" className="p-6">
        <h1 className="text-xl font-bold mb-4">Login</h1>
        {/* Replace with your actual login form */}
        <form method="post" action="/api/login" className="space-y-2">
          <input
            name="username"
            placeholder="Username"
            className="border px-2 py-1 w-full"
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            className="border px-2 py-1 w-full"
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            Login
          </button>
        </form>
      </section>
    );
  }

  return (
    <section id="dashboard-section" className="p-6">
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
      {error && <p className="text-red-500">{error}</p>}

      <h2 className="text-xl font-semibold mb-2">Tasks</h2>
      <table className="table-auto border-collapse border w-full">
        <thead>
          <tr>
            <th className="border px-4 py-2">Project</th>
            <th className="border px-4 py-2">Assignees</th>
          </tr>
        </thead>
        <tbody id="tasks-table-body">
          {tasks.length === 0 ? (
            <tr>
              <td className="border px-4 py-2" colSpan={2}>
                No tasks found
              </td>
            </tr>
          ) : (
            tasks.map((task) => (
              <tr key={task.id}>
                <td className="border px-4 py-2">{task.name}</td>
                <td className="border px-4 py-2">
                  {task.assignees?.map((a) => a.username).join(", ") ||
                    "No assignees"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
