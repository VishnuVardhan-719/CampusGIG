import { db } from "@/lib/db";
import { buildBuilderScore, compareBuilders, type BuilderComponent } from "@/lib/rankers";

/**
 * Server-side loader for the Rankers board.
 *
 * One batched read for every active student — no per-student queries — and every
 * published number comes from that read. Missing history is carried through as null
 * so the UI can say "unknown" instead of inventing a zero or a perfect score.
 */

export type RankedBuilder = {
  id: string;
  name: string;
  isDemo: boolean;
  verificationStatus: string;
  degree: string;
  college: string;
  city: string;
  skills: string[];
  completedContracts: number;
  onTimeContracts: number;
  reviewCount: number;
  ratingAverage: number | null;
  onTimeRate: number | null;
  evidencedSkills: number;
  score: number | null;
  breakdown: BuilderComponent[];
};

export type BuilderBoard = { ranked: RankedBuilder[]; awaiting: RankedBuilder[]; students: number };

export async function loadBuilders(): Promise<BuilderBoard> {
  const students = await db.user.findMany({
    where: { role: "STUDENT", isActive: true },
    select: {
      id: true, name: true, isDemo: true, verificationStatus: true,
      studentProfile: { select: { degree: true, college: true, city: true } },
      skills: { select: { skill: { select: { name: true } } } },
      reviewsReceived: { select: { rating: true, timelinessRating: true } },
      studentContracts: { where: { status: "COMPLETED" }, select: { id: true, completedAt: true, deadline: true } },
      skillEvidence: { select: { skillId: true, contractId: true } },
    },
  });

  const builders: RankedBuilder[] = students.map((student) => {
    const completed = student.studentContracts;
    const completedIds = new Set(completed.map((contract) => contract.id));
    const onTimeContracts = completed.filter((contract) => contract.completedAt && contract.completedAt <= contract.deadline).length;
    // Evidence is only counted when the row is backed by one of this student's completed contracts.
    const evidencedSkills = new Set(
      student.skillEvidence.filter((row) => completedIds.has(row.contractId)).map((row) => row.skillId),
    ).size;
    const score = buildBuilderScore({
      completedContracts: completed.length,
      onTimeContracts,
      reviews: student.reviewsReceived,
      evidencedSkills,
      verified: student.verificationStatus === "VERIFIED",
    });
    const ratingAverage = score.breakdown.find((part) => part.key === "client_rating")?.value ?? null;
    return {
      id: student.id,
      name: student.name,
      isDemo: student.isDemo,
      verificationStatus: student.verificationStatus,
      degree: student.studentProfile?.degree ?? "",
      college: student.studentProfile?.college ?? "",
      city: student.studentProfile?.city ?? "",
      skills: student.skills.map((entry) => entry.skill.name),
      completedContracts: completed.length,
      onTimeContracts,
      reviewCount: score.reviewCount,
      ratingAverage: ratingAverage === null ? null : Math.round((ratingAverage / 100) * 5 * 10) / 10,
      onTimeRate: completed.length ? Math.round((onTimeContracts / completed.length) * 100) : null,
      evidencedSkills,
      score: score.score,
      breakdown: score.breakdown,
    };
  });

  builders.sort(compareBuilders);
  return {
    ranked: builders.filter((builder) => builder.score !== null),
    awaiting: builders.filter((builder) => builder.score === null),
    students: builders.length,
  };
}
