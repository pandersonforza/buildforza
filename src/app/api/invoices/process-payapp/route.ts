import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

interface PayAppLineItem {
  description: string;
  scheduledValue: number;
  previouslyBilled: number;
  currentBilled: number;
  materialsStored: number;
  totalCompleted: number;
  percentComplete: number;
  balanceToFinish: number;
  retainage: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filePath, projectId } = body;

    if (!filePath) {
      return NextResponse.json({ error: "Missing filePath" }, { status: 400 });
    }

    // Fetch PDF from blob
    let pdfBuffer: Buffer;
    try {
      if (filePath.startsWith("http")) {
        const token = process.env.BLOB_READ_WRITE_TOKEN;
        const res = await fetch(filePath, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`Failed to fetch blob: ${res.status}`);
        pdfBuffer = Buffer.from(await res.arrayBuffer());
      } else {
        const { readFile } = await import("fs/promises");
        const path = await import("path");
        const absolutePath = path.join(process.cwd(), "public", filePath);
        pdfBuffer = await readFile(absolutePath);
      }
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : "Unknown error";
      return NextResponse.json({ error: `File not found: ${msg}` }, { status: 404 });
    }

    // Get budget line items for matching context
    let budgetContext = "";
    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          budgetCategories: {
            include: { lineItems: true },
          },
        },
      });

      if (project) {
        budgetContext = project.budgetCategories
          .map((cat) => {
            const items = cat.lineItems
              .map((li) => `    - "${li.description}" (ID: "${li.id}", Budget: $${li.revisedBudget})`)
              .join("\n");
            return `  Category: "${cat.name}"\n${items}`;
          })
          .join("\n");
      }
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
    }

    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const base64Pdf = pdfBuffer.toString("base64");

    const systemPrompt = `You are an expert at reading construction pay applications (AIA G702/G703 forms and similar documents). Your job is to extract ALL individual line items from the pay application.

${budgetContext ? `Here are the project's existing budget line items for matching:\n${budgetContext}\n` : ""}

Analyze the provided PDF and extract every line item. Return ONLY valid JSON with no additional text or markdown formatting.

Required JSON structure:
{
  "gcCompany": "string - the general contractor or applicant company name",
  "applicationNumber": "string or null - the application/pay app number",
  "periodTo": "string or null - the period ending date in YYYY-MM-DD format",
  "lineItems": [
    {
      "itemNumber": "string or null - the item/line number from the schedule",
      "description": "string - description of the work item",
      "scheduledValue": number - the original scheduled/contract value,
      "previouslyBilled": number - total previously billed/completed from prior applications,
      "currentBilled": number - the amount billed THIS period,
      "materialsStored": number - materials presently stored (if shown, otherwise 0),
      "totalCompleted": number - total completed and stored to date,
      "percentComplete": number - percentage complete (0-100),
      "balanceToFinish": number - remaining balance to finish,
      "retainage": number - retainage amount (if shown, otherwise 0)${budgetContext ? `,
      "suggestedBudgetLineItemId": "string or null - the ID of the best matching budget line item from the list above"` : ""}
    }
  ],
  "summary": {
    "originalContractSum": number,
    "netChangeByChangeOrders": number,
    "currentContractSum": number,
    "totalCompletedToDate": number,
    "totalRetainage": number,
    "totalEarnedLessRetainage": number,
    "lessPreviousCertificates": number,
    "currentPaymentDue": number
  },
  "notes": "string - any important notes about the pay application"
}

Guidelines:
- Extract EVERY line item from the continuation sheet (G703), not just the summary (G702)
- If amounts are shown in parentheses, they are negative (credits)
- Use 0 for any fields that are blank or N/A
- Include change order items if they appear as separate line items
- The currentBilled amount is the most important field — this is what's being requested for payment this period
- percentComplete should be a number between 0 and 100, not a decimal`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64Pdf,
              },
            },
            {
              type: "text",
              text: systemPrompt,
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No response from AI" }, { status: 502 });
    }

    let jsonText = textBlock.text.trim();
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonText = jsonMatch[1].trim();

    let result: {
      gcCompany: string;
      applicationNumber: string | null;
      periodTo: string | null;
      lineItems: (PayAppLineItem & { itemNumber?: string | null; suggestedBudgetLineItemId?: string | null })[];
      summary: Record<string, number>;
      notes: string;
    };

    try {
      result = JSON.parse(jsonText);
    } catch {
      console.error("Failed to parse AI response:", jsonText);
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 502 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to process pay application:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Failed to process pay application: ${message}` }, { status: 500 });
  }
}
