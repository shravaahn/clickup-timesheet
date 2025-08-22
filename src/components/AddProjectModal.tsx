// src/components/AddProjectModal.tsx
'use client';
import { useState } from 'react';
import { Modal, TextInput, Button, Select, Group } from '@mantine/core';
import { useTimesheet } from '@/store/timesheet';

export default function AddProjectModal({
  opened,
  onClose,
  currentUserId,
  currentUserName,
}: {
  opened: boolean;
  onClose: () => void;
  currentUserId: string;
  currentUserName: string;
}) {
  const { addProject } = useTimesheet();
  const [name, setName] = useState('');
  const [assignee, setAssignee] = useState(currentUserId);

  const handleCreate = () => {
    if (!name.trim()) return;
    addProject({ name: name.trim(), assigneeId: assignee });
    setName('');
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Add Project (Create Task)"
      centered
      overlayProps={{ blur: 3, opacity: 0.4 }}
      classNames={{
        title: 'text-base font-semibold',
        header: 'px-4 pt-4',
        body: 'px-4 pb-4',
      }}
    >
      <div className="space-y-4">
        <TextInput
          label="Task name"
          placeholder="e.g. Build Dashboard"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          radius="md"
        />
        <Select
          label="Assign to"
          value={assignee}
          onChange={(v) => v && setAssignee(v)}
          data={[{ value: currentUserId, label: currentUserName }]}
          radius="md"
        />
        <Group justify="flex-end" gap="sm" mt="sm">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate}>Create</Button>
        </Group>
      </div>
    </Modal>
  );
}
