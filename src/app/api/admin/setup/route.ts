import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// One-time setup route to promote initial admin
// DELETE THIS FILE after use
export async function POST() {
  const adminCount = await prisma.user.count({ where: { role: "admin" } });
  if (adminCount > 0) {
    return NextResponse.json({ error: "Admin already exists" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { email: "panderson@forzacommercial.com" },
    data: { role: "admin" },
    select: { id: true, name: true, email: true, role: true },
  });

  return NextResponse.json({ message: "Admin role granted", user });
}
