import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

const VALID_TRANSITIONS: Record<string, string[]> = {
  'Submitted': ['Approved', 'Rejected'],
  'Approved': ['Paid'],
};

// Slim include used on every PUT response — only the fields the client actually renders.
// (Full project/lineItem objects add ~15 unused fields per invoice.)
const INVOICE_INCLUDE = {
  project: { select: { id: true, name: true, address: true, status: true, projectGroup: true } },
  lineItem: {
    select: {
      id: true,
      description: true,
      category: { select: { id: true, name: true, categoryGroup: true } },
    },
  },
} as const;

const TERMINAL_STATUSES = ['Paid', 'Rejected'];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: INVOICE_INCLUDE,
    });

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(invoice);
  } catch (error) {
    console.error('Failed to fetch invoice:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invoice' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Admin status override — bypasses normal workflow rules
    if (body.adminOverride && body.status && body.status !== existing.status) {
      const currentUser = await getCurrentUser();
      if (!currentUser || currentUser.role !== 'admin') {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
      }

      const wasApprovedOrPaid = existing.status === 'Approved' || existing.status === 'Paid';
      const movingBack = body.status === 'Submitted' || body.status === 'Rejected';

      const invoice = await prisma.$transaction(async (tx) => {
        // Reverse budget increment if moving back from Approved/Paid
        if (wasApprovedOrPaid && movingBack) {
          const isPayApp = existing.aiNotes?.includes('__payAppLineItems__');
          if (isPayApp && existing.aiNotes) {
            const match = existing.aiNotes.match(/__payAppLineItems__([\s\S]+)$/);
            if (match) {
              try {
                const payAppItems: { lineItemId: string; amount: number }[] = JSON.parse(match[1]);
                await Promise.all(
                  payAppItems
                    .filter((item) => item.lineItemId && item.amount !== 0)
                    .map((item) =>
                      tx.budgetLineItem.update({
                        where: { id: item.lineItemId },
                        data: { actualCost: { decrement: item.amount } },
                      })
                    )
                );
              } catch { /* skip */ }
            }
          } else if (existing.budgetLineItemId) {
            await tx.budgetLineItem.update({
              where: { id: existing.budgetLineItemId },
              data: { actualCost: { decrement: existing.amount } },
            });
          }
        }

        return tx.invoice.update({
          where: { id },
          data: {
            status: body.status,
            ...(body.status === 'Rejected' && { rejectedDate: new Date(), rejectionReason: body.rejectionReason ?? null }),
            ...(body.status !== 'Rejected' && { rejectionReason: null }),
            ...(body.status !== 'Approved' && body.status !== 'Paid' && { approvedDate: null }),
            ...(body.status !== 'Paid' && { paidDate: null }),
          },
          include: INVOICE_INCLUDE,
        });
      });

      return NextResponse.json(invoice);
    }

    // If a status transition is requested, handle workflow logic
    if (body.status && body.status !== existing.status) {
      const currentStatus = existing.status;
      const newStatus = body.status;

      // Terminal statuses cannot transition
      if (TERMINAL_STATUSES.includes(currentStatus)) {
        return NextResponse.json(
          { error: `Cannot change status from "${currentStatus}". It is a terminal status.` },
          { status: 400 }
        );
      }

      // Validate allowed transition
      const allowed = VALID_TRANSITIONS[currentStatus];
      if (!allowed || !allowed.includes(newStatus)) {
        return NextResponse.json(
          { error: `Invalid status transition from "${currentStatus}" to "${newStatus}"` },
          { status: 400 }
        );
      }

      // Submitted → Approved (with optional field edits, triggers budget increment)
      if (currentStatus === 'Submitted' && newStatus === 'Approved') {
        const finalAmount = body.amount !== undefined ? body.amount : existing.amount;
        const finalLineItemId = body.budgetLineItemId !== undefined ? body.budgetLineItemId : existing.budgetLineItemId;

        // Check if this is a pay app with multiple line items
        const isPayApp = existing.aiNotes?.includes('__payAppLineItems__');

        if (!finalLineItemId && !isPayApp) {
          return NextResponse.json(
            { error: 'Invoice must have a budget line item to be approved' },
            { status: 400 }
          );
        }

        const invoice = await prisma.$transaction(async (tx) => {
          const updated = await tx.invoice.update({
            where: { id },
            data: {
              status: 'Approved',
              approvedDate: new Date(),
              ...(body.vendorName !== undefined && { vendorName: body.vendorName }),
              ...(body.invoiceNumber !== undefined && { invoiceNumber: body.invoiceNumber }),
              ...(body.amount !== undefined && { amount: body.amount }),
              ...(body.description !== undefined && { description: body.description }),
              ...(body.budgetLineItemId !== undefined && { budgetLineItemId: body.budgetLineItemId }),
            },
            include: INVOICE_INCLUDE,
          });

          if (isPayApp && existing.aiNotes) {
            // Distribute amounts to individual budget line items
            const match = existing.aiNotes.match(/__payAppLineItems__([\s\S]+)$/);
            if (match) {
              try {
                const payAppItems: { lineItemId: string; amount: number }[] = JSON.parse(match[1]);
                await Promise.all(
                  payAppItems
                    .filter((item) => item.lineItemId && item.amount !== 0)
                    .map((item) =>
                      tx.budgetLineItem.update({
                        where: { id: item.lineItemId },
                        data: { actualCost: { increment: item.amount } },
                      })
                    )
                );
              } catch {
                // If parsing fails, skip distribution
                console.error('Failed to parse pay app line items');
              }
            }
          } else if (finalLineItemId) {
            await tx.budgetLineItem.update({
              where: { id: finalLineItemId },
              data: {
                actualCost: { increment: finalAmount },
              },
            });
          }

          return updated;
        });

        return NextResponse.json(invoice);
      }

      // Approved → Paid (admin and accountant only)
      if (currentStatus === 'Approved' && newStatus === 'Paid') {
        const currentUser = await getCurrentUser();
        if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'accountant')) {
          return NextResponse.json(
            { error: 'Only admins and accountants can mark invoices as paid' },
            { status: 403 }
          );
        }

        // Parse dev fee milestone IDs if present, then mark each milestone as paid in the same transaction
        const devFeeMilestoneMatch = existing.aiNotes?.match(/__devFeeMilestoneIds__([\s\S]+)$/);
        let devFeeMilestoneIds: string[] = [];
        if (devFeeMilestoneMatch) {
          try { devFeeMilestoneIds = JSON.parse(devFeeMilestoneMatch[1]) as string[]; } catch { /* skip */ }
        }

        const invoice = await prisma.$transaction(async (tx) => {
          if (devFeeMilestoneIds.length > 0) {
            const milestones = await tx.milestone.findMany({
              where: { id: { in: devFeeMilestoneIds } },
              select: { id: true, devFee: true },
            });
            await Promise.all(
              milestones.map((m) =>
                tx.milestone.update({
                  where: { id: m.id },
                  data: { paidAmount: m.devFee, status: 'Completed', completedDate: new Date() },
                })
              )
            );
          }
          return tx.invoice.update({
            where: { id },
            data: { status: 'Paid', paidDate: new Date() },
            include: INVOICE_INCLUDE,
          });
        });

        return NextResponse.json(invoice);
      }

      // Submitted → Rejected
      if (newStatus === 'Rejected' && currentStatus === 'Submitted') {
        const invoice = await prisma.invoice.update({
          where: { id },
          data: {
            status: 'Rejected',
            rejectedDate: new Date(),
            ...(body.rejectionReason !== undefined && { rejectionReason: body.rejectionReason }),
          },
          include: INVOICE_INCLUDE,
        });

        return NextResponse.json(invoice);
      }

    }

    // Allow sentToAccountant toggle regardless of status
    if (body.sentToAccountant !== undefined && Object.keys(body).length === 1) {
      const invoice = await prisma.invoice.update({
        where: { id },
        data: { sentToAccountant: body.sentToAccountant },
        include: INVOICE_INCLUDE,
      });
      return NextResponse.json(invoice);
    }


    // Regular field updates — only allowed in "Submitted" status
    if (existing.status !== 'Submitted') {
      return NextResponse.json(
        { error: `Cannot update invoice fields when status is "${existing.status}". Only draft invoices can be edited.` },
        { status: 400 }
      );
    }

    if (body.amount !== undefined) {
      if (typeof body.amount !== 'number' || isNaN(body.amount)) {
        return NextResponse.json(
          { error: 'Amount must be a valid number' },
          { status: 400 }
        );
      }
    }

    if (body.date !== undefined) {
      const parsedDate = new Date(body.date);
      if (isNaN(parsedDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid date format' },
          { status: 400 }
        );
      }
      body.date = parsedDate;
    }

    const invoice = await prisma.invoice.update({
      where: { id },
      data: {
        ...(body.vendorName !== undefined && { vendorName: body.vendorName }),
        ...(body.invoiceNumber !== undefined && { invoiceNumber: body.invoiceNumber }),
        ...(body.amount !== undefined && { amount: body.amount }),
        ...(body.date !== undefined && { date: body.date }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.filePath !== undefined && { filePath: body.filePath }),
        ...(body.projectId !== undefined && { projectId: body.projectId }),
        ...(body.budgetLineItemId !== undefined && { budgetLineItemId: body.budgetLineItemId }),
        ...(body.approver !== undefined && { approver: body.approver }),
        ...(body.submittedBy !== undefined && { submittedBy: body.submittedBy }),
        ...(body.aiConfidence !== undefined && { aiConfidence: body.aiConfidence }),
        ...(body.aiNotes !== undefined && { aiNotes: body.aiNotes }),
      },
      include: INVOICE_INCLUDE,
    });

    return NextResponse.json(invoice);
  } catch (error) {
    console.error('Failed to update invoice:', error);
    return NextResponse.json(
      { error: 'Failed to update invoice' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const deleteFile = searchParams.get('deleteFile') === 'true';

    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    if (deleteFile && existing.filePath) {
      try {
        const { unlink } = await import('fs/promises');
        const path = await import('path');
        const absolutePath = path.join(process.cwd(), 'public', existing.filePath);
        await unlink(absolutePath);
      } catch (fsError) {
        console.warn('Failed to delete invoice file:', fsError);
      }
    }

    await prisma.$transaction(async (tx) => {
      // If the invoice was approved/paid it already incremented actualCost —
      // reverse that so the budget stays accurate.
      if (existing.status === 'Approved' || existing.status === 'Paid') {
        const isPayApp = existing.aiNotes?.includes('__payAppLineItems__');
        if (isPayApp && existing.aiNotes) {
          const match = existing.aiNotes.match(/__payAppLineItems__([\s\S]+)$/);
          if (match) {
            try {
              const payAppItems: { lineItemId: string; amount: number }[] = JSON.parse(match[1]);
              for (const item of payAppItems) {
                if (item.lineItemId && item.amount > 0) {
                  await tx.budgetLineItem.update({
                    where: { id: item.lineItemId },
                    data: { actualCost: { decrement: item.amount } },
                  });
                }
              }
            } catch {
              console.warn('Failed to parse pay app line items for actualCost reversal');
            }
          }
        } else if (existing.budgetLineItemId) {
          await tx.budgetLineItem.update({
            where: { id: existing.budgetLineItemId },
            data: { actualCost: { decrement: existing.amount } },
          });
        }
      }

      await tx.invoice.delete({ where: { id } });
    });

    return NextResponse.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    console.error('Failed to delete invoice:', error);
    return NextResponse.json(
      { error: 'Failed to delete invoice' },
      { status: 500 }
    );
  }
}
