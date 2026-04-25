import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";

const meta: Meta<typeof Button> = {
  title: "Primitives/Button",
  component: Button,
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "select", options: ["primary", "secondary", "ghost", "danger", "link"] },
    size: { control: "select", options: ["sm", "md", "lg"] },
  },
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = { args: { variant: "primary", children: "Save" } };
export const Secondary: Story = { args: { variant: "secondary", children: "Cancel" } };
export const Ghost: Story = { args: { variant: "ghost", children: "More" } };
export const Danger: Story = { args: { variant: "danger", children: "Delete" } };
export const Link: Story = { args: { variant: "link", children: "Forgot password?" } };

export const Small: Story = { args: { size: "sm", children: "Small" } };
export const Medium: Story = { args: { size: "md", children: "Medium" } };
export const Large: Story = { args: { size: "lg", children: "Large" } };

export const Loading: Story = { args: { isLoading: true, children: "Submitting" } };
export const Disabled: Story = { args: { disabled: true, children: "Disabled" } };
