"use client";

import { useEffect, useState } from "react";
import {
  Avatar,
  Button,
  Group,
  Select,
  Text,
  Title,
  Menu,
  ActionIcon,
  AppShell,
} from "@mantine/core";
import { IconChevronDown, IconLogout2, IconSettings } from "@tabler/icons-react";

type Team = { id: string; name: string };
type Me = { user?: { username?: string; email?: string; profilePicture?: string } };

type Props = {
  onTeamChange?: (teamId: string) => void;
  initialTeamId?: string;
};

export default function AppHeader({ onTeamChange, initialTeamId }: Props) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState<string | null>(initialTeamId ?? null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const [teamsRes, meRes] = await Promise.all([
          fetch("/api/teams").then((r) => r.json()),
          fetch("/api/me").then((r) => r.json()),
        ]);

        if (!mounted) return;

        // Normalize teams shape if needed
        const t: Team[] =
          teamsRes?.teams?.map((w: any) => ({ id: String(w.id), name: w.name })) ??
          [];

        setTeams(t);
        if (!teamId && t.length) {
          setTeamId(t[0].id);
          onTeamChange?.(t[0].id);
        }

        setMe(meRes ?? null);
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []); // load once

  const handleTeamChange = (val: string | null) => {
    setTeamId(val);
    if (val) onTeamChange?.(val);
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    // Redirect to login after logout
    window.location.href = "/events/login";
  };

  const userName =
    me?.user?.username || me?.user?.email?.split("@")[0] || "User";

  return (
    <AppShell.Header>
      <Group justify="space-between" px="md" h="100%">
        <Group gap="sm">
          <Title order={4}>ClickUp Timesheet</Title>

          <Select
            w={260}
            placeholder={loading ? "Loading workspaces..." : "Select workspace"}
            value={teamId}
            onChange={handleTeamChange}
            data={teams.map((t) => ({ value: t.id, label: t.name }))}
            clearable={false}
            disabled={!teams.length}
            aria-label="Workspace"
          />
        </Group>

        <Group gap="xs">
          <Menu shadow="md" width={200} position="bottom-end">
            <Menu.Target>
              <Button
                variant="subtle"
                rightSection={<IconChevronDown size={16} />}
                leftSection={
                  <Avatar
                    size="sm"
                    src={me?.user?.profilePicture}
                    alt={userName}
                    radius="xl"
                  >
                    {userName.charAt(0).toUpperCase()}
                  </Avatar>
                }
              >
                <Text fw={500}>{userName}</Text>
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Account</Menu.Label>
              <Menu.Item leftSection={<IconSettings size={16} />}>
                Settings
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                color="red"
                leftSection={<IconLogout2 size={16} />}
                onClick={handleLogout}
              >
                Logout
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
    </AppShell.Header>
  );
}
