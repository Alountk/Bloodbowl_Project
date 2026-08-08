import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

describe("prisma singleton", () => {
  it("exports a connectable PrismaClient (lazy $connect/$disconnect contract)", () => {
    // PrismaClient is connected lazily on first query; the stable observable
    // contract is the presence of the $connect/$disconnect lifecycle methods.
    expect(typeof (prisma as PrismaClient).$connect).toBe("function");
    expect(typeof (prisma as PrismaClient).$disconnect).toBe("function");
  });

  it("exposes the generated User and Team model delegates (persistent schema)", () => {
    // These delegate properties only exist once the schema defines the
    // User and Team models and the client has been generated from it.
    expect(typeof prisma.user).toBe("object");
    expect(typeof prisma.team).toBe("object");
  });

  it("reuses a single instance across module imports (dev hot-reload safe)", async () => {
    const again = (await import("./prisma")).prisma;
    expect(again).toBe(prisma);
  });
});
