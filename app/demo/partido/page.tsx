import { ActaDemoHarness } from "@/features/leagues/actaDemoHarness";

/**
 * Mock-driven demo route for the live match section (Acta en Vivo). It renders
 * the same interactive harness as the Storybook "Flujo interactivo" story,
 * inside the real app shell, so the flow can be tried and iterated without a
 * real fixture. Phase 2 of the match demo plan.
 */
export default function DemoMatchPage() {
  return <ActaDemoHarness />;
}
