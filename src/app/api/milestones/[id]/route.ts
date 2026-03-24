import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await request.json();

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.devFee !== undefined) updateData.devFee = data.devFee;
    if (data.paidAmount !== undefined) updateData.paidAmount = data.paidAmount;
    if (data.expectedDate !== undefined) updateData.expectedDate = data.expectedDate ? new Date(data.expectedDate) : null;
    if (data.completedDate !== undefined) updateData.completedDate = data.completedDate ? new Date(data.completedDate) : null;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;

    const milestone = await prisma.milestone.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(milestone);
  } catch {
    return NextResponse.json({ error: "Failed to update milestone" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.milestone.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete milestone" }, { status: 500 });
  }
}
