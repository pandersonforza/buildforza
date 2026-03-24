import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const milestones = await prisma.milestone.findMany({
      where: { projectId },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json(milestones);
  } catch {
    return NextResponse.json({ error: "Failed to fetch milestones" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { projectId, name, description, devFee, expectedDate, status, sortOrder } = data;

    if (!projectId || !name) {
      return NextResponse.json({ error: "projectId and name are required" }, { status: 400 });
    }

    const milestone = await prisma.milestone.create({
      data: {
        projectId,
        name,
        description: description || null,
        devFee: devFee || 0,
        expectedDate: expectedDate ? new Date(expectedDate) : null,
        status: status || "Pending",
        sortOrder: sortOrder ?? 0,
      },
    });

    return NextResponse.json(milestone, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create milestone" }, { status: 500 });
  }
}
