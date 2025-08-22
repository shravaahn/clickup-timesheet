// src/components/dashboard/MonthView.tsx
import React, { useMemo, useState } from "react";
import {
  Button,
  Card,
  Group,
  Grid,
  Modal,
  Select,
  Text,
  TextInput,
  Title,
  Tooltip,
  Paper,
  Divider,
  NumberInput,
  Badge,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconPlus, IconUpload, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import axios from "axios";

type Role = "ADMIN" | "CONSULTANT" | string;

export type MonthViewProps = {
  /** Logged-in user (used to gate the Add Project button) */
  currentUser?: { id: string; name?: string; role: Role };

  /** Controlled month value. Accepts Date or an ISO-like string; defaults to today if omitted */
  month?: Date | string;

  /** Callback when user changes the month from the selector */
  onChangeMonth?: (month: Date) => void;

  /** Optional: when user clicks Save (if you wire this in the parent) */
  onSaveMonthTotals?: (payload: { monthStart: Date; monthEnd: Date }) => Promise<void>;
};

/**
 * Utilities
 */
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const addDays = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
const format = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(undefined, opts).format(d);
const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Build a month grid split into ISO weeks (Mon..Sun),
 * matching the “Month” screenshot layout with 4–5 week cards.
 */
function useMonthGrid(active: Date) {
  return useMemo(() => {
    const monthStart = startOfMonth(active);
    const monthEnd = endOfMonth(active);

    // Get Monday of the first week block
    const weekStartOffset = (monthStart.getDay() + 6) % 7; // Mon=0 ... Sun=6
    const gridStart = addDays(monthStart, -weekStartOffset);

    // Build 6 weeks to safely cover all months (some will be trimmed in UI)
    const weeks: { label: string; range: string; days: Date[] }[] = [];
    let cursor = new Date(gridStart);

    for (let w = 0; w < 6; w++) {
      const days: Date[] = [];
      for (let i = 0; i < 7; i++) {
        days.push(new Date(cursor));
        cursor = addDays(cursor, 1);
      }
      const wStart = days[0];
      const wEnd = days[6];
      weeks.push({
        label: `Week ${w + 1}`,
        range: `${format(wStart, { month: "short", day: "numeric" })} — ${format(wEnd, {
          month: "short",
          day: "numeric",
        })}`,
        days,
      });
    }

    return {
      monthStart,
      monthEnd,
      title: `${format(active, { month: "long" })} ${active.getFullYear()}`,
      weeks,
    };
  }, [active]);
}

/**
 * MonthView component
 */
const MonthView: React.FC<MonthViewProps> = ({
  currentUser,
  month,
  onChangeMonth,
  onSaveMonthTotals,
}) => {
  // Parse month prop
  const initial = useMemo<Date>(() => {
    if (!month) return new Date();
    if (typeof month === "string") {
      // Accept "YYYY-MM" or any Date-parsable string
      const parts = month.match(/^(\d{4})-(\d{2})$/);
      if (parts) return new Date(Number(parts[1]), Number(parts[2]) - 1, 1);
      const parsed = new Date(month);
      return isNaN(parsed.getTime()) ? new Date() : parsed;
    }
    return month;
  }, [month]);

  const [activeMonth, setActiveMonth] = useState<Date>(startOfMonth(initial));
  const { monthStart, monthEnd, title, weeks } = useMonthGrid(activeMonth);

  // “Add Project” admin-only modal
  const [opened, { open, close }] = useDisclosure(false);
  const [creating, setCreating] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [client, setClient] = useState("");
  const [code, setCode] = useState<string>("");

  // Sample “CSV export” or “Save” actions (optional wire-ups)
  const handleSave = async () => {
    if (!onSaveMonthTotals) return;
    await onSaveMonthTotals({ monthStart, monthEnd });
  };

  const canAddProjects = currentUser?.role === "ADMIN";

  const monthSelectData = useMemo(() => {
    // Build a rolling list of 12 months around the current month
    const base = new Date();
    base.setDate(1);
    const items = [];
    for (let i = -6; i <= 6; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
      items.push({
        value: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`,
        label: `${format(d, { month: "long" })} ${d.getFullYear()}`,
        date: d,
      });
    }
    return items;
  }, []);

  const onMonthChange = (value: string | null) => {
    const item = monthSelectData.find((m) => m.value === value);
    if (!item) return;
    setActiveMonth(item.date);
    onChangeMonth?.(item.date);
  };

  const goPrev = () => {
    const d = new Date(activeMonth.getFullYear(), activeMonth.getMonth() - 1, 1);
    setActiveMonth(d);
    onChangeMonth?.(d);
  };
  const goNext = () => {
    const d = new Date(activeMonth.getFullYear(), activeMonth.getMonth() + 1, 1);
    setActiveMonth(d);
    onChangeMonth?.(d);
  };

  const submitNewProject = async () => {
    setCreating(true);
    try {
      // Adjust the payload / endpoint to your API
      await axios.post("/api/projects", {
        name: projectName.trim(),
        client: client.trim() || null,
        code: code || null,
      });
      setProjectName("");
      setClient("");
      setCode("");
      close();
    } catch (err) {
      // You can integrate @mantine/notifications here if you already use it
      console.error("Failed to create project", err);
      alert("Failed to create project. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="w-full">
      {/* Top toolbar */}
      <Paper withBorder p="md" radius="lg">
        <Group justify="space-between" align="center" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Tooltip label="Previous month">
              <Button variant="default" onClick={goPrev} leftSection={<IconChevronLeft size={16} />}>
                Prev
              </Button>
            </Tooltip>

            <Select
              aria-label="Select month"
              value={`${activeMonth.getFullYear()}-${pad2(activeMonth.getMonth() + 1)}`}
              data={monthSelectData.map((m) => ({ value: m.value, label: m.label }))}
              placeholder="Select month"
              disabled={false}
              maw={280}
              comboboxProps={{ withinPortal: true }}
              onChange={onMonthChange}
            />

            <Tooltip label="Next month">
              <Button variant="default" onClick={goNext} rightSection={<IconChevronRight size={16} />}>
                Next
              </Button>
            </Tooltip>
          </Group>

          <Group wrap="nowrap" gap="xs">
            <Button variant="default" leftSection={<IconUpload size={16} />}>
              Export CSV
            </Button>
            <Button onClick={handleSave}>Save</Button>

            {canAddProjects && (
              <Button
                leftSection={<IconPlus size={16} />}
                variant="filled"
                color="blue"
                onClick={open}
              >
                Add Project
              </Button>
            )}
          </Group>
        </Group>

        <Divider my="md" />
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Title order={3}>{title}</Title>
            <Badge variant="light" radius="sm">
              Period: Month
            </Badge>
          </Group>

          <Text c="dimmed" size="sm">
            Month Est: 0.00h · Month Tracked: 0.00h · Δ: 0.00h
          </Text>
        </Group>
      </Paper>

      {/* Weeks grid (cards) */}
      <Grid mt="lg">
        {weeks.map((w, idx) => (
          <Grid.Col span={{ base: 12, md: 6, lg: 4 }} key={idx}>
            <Card withBorder radius="md" p="md">
              <Group justify="space-between" mb="sm">
                <Title order={5}>{w.label}</Title>
                <Text c="dimmed" size="sm">
                  {w.range}
                </Text>
              </Group>

              {/* Days row */}
              <Grid gutter="xs">
                {w.days.map((d, i) => {
                  const isThisMonth = d.getMonth() === activeMonth.getMonth();
                  const dayLabel = format(d, { weekday: "short" });
                  return (
                    <Grid.Col span={12 / 7 as any} key={i}>
                      <Card
                        p="xs"
                        radius="md"
                        withBorder
                        style={{ opacity: isThisMonth ? 1 : 0.5 }}
                      >
                        <Text size="xs" fw={600}>
                          {dayLabel}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {format(d, { month: "short", day: "numeric" })}
                        </Text>

                        <Group gap={4} mt={6}>
                          <NumberInput
                            size="xs"
                            placeholder="0.00"
                            hideControls
                            decimalScale={2}
                            thousandSeparator=","
                            radius="sm"
                            min={0}
                          />
                          <NumberInput
                            size="xs"
                            placeholder="0.00"
                            hideControls
                            decimalScale={2}
                            thousandSeparator=","
                            radius="sm"
                            min={0}
                          />
                          <NumberInput
                            size="xs"
                            placeholder="0.00"
                            hideControls
                            decimalScale={2}
                            thousandSeparator=","
                            radius="sm"
                            min={0}
                          />
                        </Group>

                        <Text size="xs" c="dimmed" mt={6}>
                          0.00
                        </Text>
                      </Card>
                    </Grid.Col>
                  );
                })}
              </Grid>
            </Card>
          </Grid.Col>
        ))}
      </Grid>

      {/* Month totals row */}
      <Grid mt="md">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card withBorder radius="md" p="md">
            <Title order={5}>Total Est Hours (Month)</Title>
            <Title order={3} mt="xs">
              0.00h
            </Title>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card withBorder radius="md" p="md">
            <Title order={5}>Total Tracked Hours (Month)</Title>
            <Title order={3} mt="xs">
              0.00h
            </Title>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card withBorder radius="md" p="md">
            <Title order={5}>Δ Tracked – Est</Title>
            <Title order={3} mt="xs">
              0.00h
            </Title>
          </Card>
        </Grid.Col>
      </Grid>

      {/* Add Project Modal — visible only to ADMIN */}
      <Modal
        opened={opened}
        onClose={close}
        title="Add New Project"
        size="lg"
        centered
        withinPortal
      >
        <Grid>
          <Grid.Col span={12}>
            <TextInput
              label="Project name"
              placeholder="e.g., Mobile App Revamp"
              value={projectName}
              onChange={(e) => setProjectName(e.currentTarget.value)}
              required
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <TextInput
              label="Client (optional)"
              placeholder="Acme Inc."
              value={client}
              onChange={(e) => setClient(e.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <TextInput
              label="Code (optional)"
              placeholder="PRJ-001"
              value={code ?? ""}
              onChange={(e) => setCode(e.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={close}>
                Cancel
              </Button>
              <Button
                disabled={!projectName.trim()}
                loading={creating}
                onClick={submitNewProject}
              >
                Create Project
              </Button>
            </Group>
          </Grid.Col>
        </Grid>
      </Modal>
    </div>
  );
};

export default MonthView;
