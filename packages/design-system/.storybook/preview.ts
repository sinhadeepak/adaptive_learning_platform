import type { Preview } from "@storybook/react";
import { tokens } from "../src/tokens";

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: "surface-secondary",
      values: [
        { name: "surface-primary", value: tokens.colors.surface.primary },
        { name: "surface-secondary", value: tokens.colors.surface.secondary },
        { name: "surface-tertiary", value: tokens.colors.surface.tertiary },
      ],
    },
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
  },
};

export default preview;
