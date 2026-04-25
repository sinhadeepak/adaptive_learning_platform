import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Modal } from "./Modal";
import { Button } from "./Button";

const meta: Meta<typeof Modal> = {
  title: "Primitives/Modal",
  component: Modal,
  tags: ["autodocs"],
  argTypes: {
    size: { control: "select", options: ["sm", "md", "lg", "xl"] },
  },
};
export default meta;

type Story = StoryObj<typeof Modal>;

function Demo(args: React.ComponentProps<typeof Modal>) {
  const [open, setOpen] = useState(args.open);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open</Button>
      <Modal
        {...args}
        open={open}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => setOpen(false)}>Save</Button>
          </>
        }
      />
    </>
  );
}

export const Small: Story = {
  render: Demo,
  args: { size: "sm", title: "Delete?", description: "This cannot be undone.", children: <p>Are you sure?</p> },
};

export const Medium: Story = {
  render: Demo,
  args: { size: "md", title: "Edit profile", children: <p>Form goes here.</p> },
};

export const Large: Story = {
  render: Demo,
  args: { size: "lg", title: "Review changes", children: <p>A larger panel for review screens.</p> },
};
