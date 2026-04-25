import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "./Badge";

const meta: Meta<typeof Badge> = {
  title: "Primitives/Badge",
  component: Badge,
  tags: ["autodocs"],
  argTypes: {
    tone: { control: "select", options: ["neutral", "success", "warning", "danger", "info"] },
  },
};
export default meta;

type Story = StoryObj<typeof Badge>;

export const Neutral: Story = { args: { tone: "neutral", children: "Draft" } };
export const Success: Story = { args: { tone: "success", children: "Active" } };
export const Warning: Story = { args: { tone: "warning", children: "Pending" } };
export const Danger: Story = { args: { tone: "danger", children: "Failed" } };
export const Info: Story = { args: { tone: "info", children: "Beta" } };
