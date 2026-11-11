import type { Preview } from "@storybook/nextjs-vite";
import "../app/globals.css";

const preview: Preview = {
  parameters: {
    // App Router context: without this the nextjs-vite framework mocks the
    // pages router and `next/navigation` hooks throw "expected app router to
    // be mounted" (Chromatic build 1, 2026-11-11).
    nextjs: {
      appDirectory: true,
    },
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
