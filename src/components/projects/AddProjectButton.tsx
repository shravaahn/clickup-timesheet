"use client";

import { useState } from "react";
import { Button, Modal, TextInput, Group } from "@mantine/core";
import axios from "axios";

type Props = {
  isAdmin: boolean;
  onCreated?: () => void;
};

export default function AddProjectButton({ isAdmin, onCreated }: Props) {
  const [opened, setOpened] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  if (!isAdmin) return null;

  async function handleSave() {
    setSaving(true);
    try {
      await axios.post("/api/projects", { name, code });
      setOpened(false);
      setName("");
      setCode("");
      onCreated?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpened(true)}>+ Add Project</Button>

      <Modal opened={opened} onClose={() => setOpened(false)} title="Add New Project" centered>
        <TextInput label="Project name" placeholder="e.g., Website Revamp" value={name} onChange={(e) => setName(e.currentTarget.value)} />
        <TextInput mt="md" label="Project code" placeholder="e.g., WR-2025" value={code} onChange={(e) => setCode(e.currentTarget.value)} />
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={() => setOpened(false)}>Cancel</Button>
          <Button loading={saving} disabled={!name.trim()} onClick={handleSave}>Save</Button>
        </Group>
      </Modal>
    </>
  );
}
