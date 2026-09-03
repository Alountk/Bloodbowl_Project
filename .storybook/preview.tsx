import type { Preview } from "@storybook/nextjs-vite";
import "../app/globals.css";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    // Rulebook-light canvas: the feed/panel shell lives on the #f8fafc token.
    backgrounds: {
      default: "rulebook-light",
      values: [
        { name: "rulebook-light", value: "#f8fafc" },
        { name: "paper", value: "#ffffff" },
        { name: "navy", value: "#12225a" },
      ],
    },
    a11y: {
      test: "todo",
    },
  },
};

export default preview;
