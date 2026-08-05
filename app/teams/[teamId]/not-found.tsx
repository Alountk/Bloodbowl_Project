import Link from "next/link";

export default function TeamNotFound() {
  return (
    <main>
      <h1>Team not found</h1>
      <p>The team you are looking for does not exist or may have been removed.</p>
      <Link href="/">Back to teams</Link>
    </main>
  );
}
