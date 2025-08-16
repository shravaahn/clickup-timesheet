// Path: src/app/dashboard/page.tsx

"use client"; // This component needs to be a client component to use hooks

import { useEffect, useState } from "react";
import axios from "axios";

// Define the shape of our data for TypeScript
interface ClickUpTeam {
  id: string;
  name: string;
}

interface ClickUpAssignee {
    id: number;
    username: string;
    email: string;
    profilePicture: string | null;
}

interface ClickUpTask {
  id: string;
  name: string;
  assignees: ClickUpAssignee[];
}

// --- UI Components ---

// A simple loading spinner component
const Spinner = () => (
    <div className="flex justify-center items-center h-full p-16">
        <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-blue-600"></div>
    </div>
);

// Time Entry Modal Component
const TimeEntryModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void; }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
                <h2 className="text-xl font-bold mb-4">Time Entry</h2>
                <div className="space-y-4">
                    <div>
                        <label htmlFor="entry-type" className="block text-sm font-medium text-gray-700">Type</label>
                        <select id="entry-type" className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500">
                            <option>billable | Meeting</option>
                            <option>non-billable | Internal</option>
                            <option>PTO</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="hours" className="block text-sm font-medium text-gray-700">Hours</label>
                        <input type="number" id="hours" placeholder="0.00" className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                </div>
                <div className="mt-6 flex justify-end space-x-3">
                    <button onClick={onClose} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300">Cancel</button>
                    <button onClick={onClose} className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">Save</button>
                </div>
            </div>
        </div>
    );
};


export default function DashboardPage() {
  // --- State Management ---
  const [teams, setTeams] = useState<ClickUpTeam[]>([]);
  const [tasks, setTasks] = useState<ClickUpTask[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // --- Data Fetching Effects ---
  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const { data } = await axios.get("/api/teams");
        if (data.error) {
          setError(JSON.stringify(data.error));
        } else {
          setTeams(data.teams || []);
          if (data.teams && data.teams.length > 0) {
            setSelectedTeamId(data.teams[0].id);
          } else {
            setIsLoading(false);
          }
        }
      } catch (err) {
        setError("Failed to fetch teams. Please try logging in again.");
        setIsLoading(false);
      }
    };
    fetchTeams();
  }, []);

  useEffect(() => {
    if (!selectedTeamId) return;
    const fetchTasks = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const { data } = await axios.get(`/api/tasks/${selectedTeamId}`);
        setTasks(data.tasks || []);
      } catch (err) {
        setError("Failed to fetch tasks for the selected workspace.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchTasks();
  }, [selectedTeamId]);

  const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const currentDate = new Date('2025-08-12T00:00:00Z'); // Static date for consistent display

  return (
    <div className="min-h-screen bg-gray-100 text-gray-800">
      <TimeEntryModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      
      {/* Main App Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
            <div className="flex items-center space-x-4">
                <div className="bg-gray-800 text-white font-bold text-xl w-10 h-10 flex items-center justify-center rounded-md">TT</div>
                <div>
                    <h1 className="text-lg font-bold">Time Tracking</h1>
                    <p className="text-sm text-gray-500">Aug 12 — Aug 16, 2025</p>
                </div>
            </div>
            <div className="flex items-center space-x-2">
                <span className="bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1.5 rounded-full">Admin User</span>
                <button className="px-3 py-1.5 border rounded-md text-sm hover:bg-gray-100">◀ Prev</button>
                <button className="px-3 py-1.5 border rounded-md text-sm hover:bg-gray-100">This Week</button>
                <button className="px-3 py-1.5 border rounded-md text-sm hover:bg-gray-100">Next ▶</button>
                <button className="px-3 py-1.5 border rounded-md text-sm bg-gray-700 text-white hover:bg-gray-800">+ Add Project</button>
                <button className="px-3 py-1.5 border rounded-md text-sm bg-green-500 text-white hover:bg-green-600">Save</button>
                <button className="px-3 py-1.5 border rounded-md text-sm hover:bg-gray-100">Export CSV</button>
                <button className="px-3 py-1.5 border rounded-md text-sm bg-yellow-400 text-yellow-900 hover:bg-yellow-500">Log out</button>
            </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Filter Pills */}
        <div className="flex space-x-2 mb-4">
            <span className="px-3 py-1 bg-gray-200 text-sm rounded-full">Est: 0.00h</span>
            <span className="px-3 py-1 bg-blue-200 text-sm rounded-full">Tracked: 0.00h</span>
            <span className="px-3 py-1 bg-green-200 text-sm rounded-full">Diff: 0.00h</span>
        </div>

        {/* Timesheet Table Area */}
        {isLoading ? <Spinner /> : error ? <div className="text-red-500">Error: {error}</div> : (
        <div className="overflow-x-auto bg-white rounded-lg shadow">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="sticky left-0 bg-gray-50 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-64">Project</th>
                        {daysOfWeek.map((day, index) => (
                            <th key={day} className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-48">
                                {day} • Aug {currentDate.getUTCDate() + index}
                            </th>
                        ))}
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-48">Total (Week)</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {tasks.map(task => (
                        <tr key={task.id}>
                            <td className="sticky left-0 bg-white px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{task.name}</td>
                            {daysOfWeek.map(day => (
                                <td key={`${task.id}-${day}`} className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex space-x-2">
                                        <input type="number" placeholder="Est" className="w-1/2 p-1 border rounded-md text-sm" onClick={() => setIsModalOpen(true)} />
                                        <input type="number" placeholder="Tracked" className="w-1/2 p-1 border rounded-md text-sm" onClick={() => setIsModalOpen(true)} />
                                    </div>
                                </td>
                            ))}
                            <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex space-x-2">
                                    <input type="text" readOnly value="0.00" className="w-1/2 p-1 bg-gray-100 border rounded-md text-sm text-center" />
                                    <input type="text" readOnly value="0.00" className="w-1/2 p-1 bg-gray-100 border rounded-md text-sm text-center" />
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
        )}

        {/* Admin Dashboard Section */}
        <div className="mt-8">
            <h2 className="text-xl font-bold mb-4">Admin Tools</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="bg-white p-4 rounded-lg shadow"><h3 className="font-semibold">Total Est Hours</h3><p className="text-2xl">0.00</p></div>
                <div className="bg-white p-4 rounded-lg shadow"><h3 className="font-semibold">Total Tracked Hours</h3><p className="text-2xl">0.00</p></div>
                <div className="bg-white p-4 rounded-lg shadow"><h3 className="font-semibold">Difference</h3><p className="text-2xl">0.00</p></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-4 rounded-lg shadow h-64 flex items-center justify-center text-gray-400">Daily Totals Chart</div>
                <div className="bg-white p-4 rounded-lg shadow h-64 flex items-center justify-center text-gray-400">Consultants Chart</div>
            </div>
        </div>
      </main>
    </div>
  );
}
