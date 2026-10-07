import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:51214/template1?sslmode=disable",
    max: 1,
    idleTimeoutMillis: 1,
    connectionTimeoutMillis: 10_000,
  }),
});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export const db = prisma;