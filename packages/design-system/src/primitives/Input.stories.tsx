import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "./Input";

const meta: Meta<typeof Input> = {
  title: "Primitives/Input",
  component: Input,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof Input>;

export const Default: Story = { args: { label: "Email", placeholder: "you@example.com" } };
export const WithHint: Story = { args: { label: "Password", type: "password", hint: "At least 12 characters" } };
export const WithError: Story = { args: { label: "Email", value: "not-an-email", error: "Enter a valid email" } };
export const Disabled: Story = { args: { label: "User ID", value: "u_42", disabled: true } };
export const Number: Story = { args: { label: "Age", type: "number", min: 0, max: 120 } };
