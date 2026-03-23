"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Send, CheckCircle, Download, Upload } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import * as XLSX from "xlsx";

interface LineItem {
  id: string;
  description: string;
  amount: string;
  category: string;
}

interface BidSubmissionFormProps {
  token: string;
  projectName: string;
  projectAddress: string;
  prefillCompany?: string;
  prefillName?: string;
  prefillEmail?: string;
}

const DEFAULT_LINE_ITEMS: Omit<LineItem, "id">[] = [
  // General Conditions
  { description: "Supervision", amount: "", category: "General Conditions" },
  { description: "Contractor Overhead", amount: "", category: "General Conditions" },
  { description: "Site Cameras", amount: "", category: "General Conditions" },
  { description: "Insurance", amount: "", category: "General Conditions" },
  { description: "Traffic Control Measures", amount: "", category: "General Conditions" },
  { description: "Fencing", amount: "", category: "General Conditions" },
  { description: "Temp Utilities", amount: "", category: "General Conditions" },
  { description: "Dumpsters", amount: "", category: "General Conditions" },
  { description: "Contractor Fee", amount: "", category: "General Conditions" },
  { description: "Construction Tax", amount: "", category: "General Conditions" },
  // Site
  { description: "Site Demolition", amount: "", category: "Site" },
  { description: "Import/Export", amount: "", category: "Site" },
  { description: "Grading rough/finish", amount: "", category: "Site" },
  { description: "Over Excavation", amount: "", category: "Site" },
  { description: "Concrete Curbing", amount: "", category: "Site" },
  { description: "Concrete Gutters", amount: "", category: "Site" },
  { description: "Concrete Flatwork Site", amount: "", category: "Site" },
  { description: "Concrete Flatwork Building", amount: "", category: "Site" },
  { description: "Paving Asphalt", amount: "", category: "Site" },
  { description: "Paving Base Rock", amount: "", category: "Site" },
  { description: "Paving Concrete", amount: "", category: "Site" },
  { description: "Paint Striping", amount: "", category: "Site" },
  { description: "Seal Coat", amount: "", category: "Site" },
  { description: "Storm", amount: "", category: "Site" },
  { description: "Water", amount: "", category: "Site" },
  { description: "Sewer", amount: "", category: "Site" },
  { description: "Grease Interceptor", amount: "", category: "Site" },
  { description: "Power", amount: "", category: "Site" },
  { description: "Gas", amount: "", category: "Site" },
  { description: "ISP/Telco", amount: "", category: "Site" },
  { description: "Site CMU Walls", amount: "", category: "Site" },
  { description: "Site Wood Fences", amount: "", category: "Site" },
  { description: "Site Metal Fences", amount: "", category: "Site" },
  { description: "Trash Enclosure CMU", amount: "", category: "Site" },
  { description: "Trash Enclosure Gates/Hardware/Bollards", amount: "", category: "Site" },
  { description: "Site Bollards", amount: "", category: "Site" },
  { description: "Site Lighting", amount: "", category: "Site" },
  { description: "Site Furnishings", amount: "", category: "Site" },
  { description: "Site Signage Footings", amount: "", category: "Site" },
  { description: "Landscape", amount: "", category: "Site" },
  { description: "Construction Survey", amount: "", category: "Site" },
  // Building Costs
  { description: "Building Demolition", amount: "", category: "Building Costs" },
  { description: "Building Foundation", amount: "", category: "Building Costs" },
  { description: "Building Metal Siding", amount: "", category: "Building Costs" },
  { description: "Rough Carpentry", amount: "", category: "Building Costs" },
  { description: "Building Stucco", amount: "", category: "Building Costs" },
  { description: "Building Brick", amount: "", category: "Building Costs" },
  { description: "Building CMU", amount: "", category: "Building Costs" },
  { description: "Building Stone", amount: "", category: "Building Costs" },
  { description: "Paint Interior", amount: "", category: "Building Costs" },
  { description: "Paint Exterior", amount: "", category: "Building Costs" },
  { description: "Roof/Wall Insulation", amount: "", category: "Building Costs" },
  { description: "TPO Roofing", amount: "", category: "Building Costs" },
  { description: "Building Down Spouts", amount: "", category: "Building Costs" },
  { description: "Drywall", amount: "", category: "Building Costs" },
  { description: "FRP", amount: "", category: "Building Costs" },
  { description: "Mechanical Ducting/Grills/Diffusers", amount: "", category: "Building Costs" },
  { description: "HVAC Units", amount: "", category: "Building Costs" },
  { description: "Air Curtains", amount: "", category: "Building Costs" },
  { description: "Electrical", amount: "", category: "Building Costs" },
  { description: "Plumbing", amount: "", category: "Building Costs" },
  { description: "Flooring Epoxy", amount: "", category: "Building Costs" },
  { description: "Flooring Tile", amount: "", category: "Building Costs" },
  { description: "Ceiling", amount: "", category: "Building Costs" },
  { description: "Shelving - Install", amount: "", category: "Building Costs" },
  { description: "Doors", amount: "", category: "Building Costs" },
  { description: "Windows", amount: "", category: "Building Costs" },
  { description: "Bathroom Acc", amount: "", category: "Building Costs" },
  { description: "Ice Machine - Install", amount: "", category: "Building Costs" },
  { description: "Refrigerators", amount: "", category: "Building Costs" },
  { description: "SS Tables and Sinks - Install", amount: "", category: "Building Costs" },
  { description: "Signage", amount: "", category: "Building Costs" },
  { description: "Shelving Install", amount: "", category: "Building Costs" },
];

function makeLineItems(items: Omit<LineItem, "id">[]): LineItem[] {
  return items.map((li) => ({ ...li, id: crypto.randomUUID() }));
}

export function BidSubmissionForm({
  token,
  projectName,
  projectAddress,
  prefillCompany,
  prefillName,
  prefillEmail,
}: BidSubmissionFormProps) {
  const [gcCompany, setGcCompany] = useState(prefillCompany || "");
  const [gcName, setGcName] = useState(prefillName || "");
  const [gcEmail, setGcEmail] = useState(prefillEmail || "");
  const [gcPhone, setGcPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>(makeLineItems(DEFAULT_LINE_ITEMS));
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      { id: crypto.randomUUID(), description: "", amount: "", category: "" },
    ]);
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length <= 1) return;
    setLineItems(lineItems.filter((li) => li.id !== id));
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: string) => {
    setLineItems(
      lineItems.map((li) => (li.id === id ? { ...li, [field]: value } : li))
    );
  };

  const total = lineItems.reduce(
    (sum, li) => sum + (parseFloat(li.amount) || 0),
    0
  );

  const handleDownloadTemplate = () => {
    const data = lineItems.map((li) => ({
      Description: li.description,
      Category: li.category,
      Amount: li.amount ? parseFloat(li.amount) : "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 45 }, { wch: 20 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bid");
    XLSX.writeFile(wb, `Bid Template - ${projectName}.xlsx`);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

        const imported: LineItem[] = rows
          .filter((row) => {
            const desc = String(row["Description"] || row["description"] || "").trim();
            return desc.length > 0;
          })
          .map((row) => {
            const amount = row["Amount"] || row["amount"] || row["AMOUNT"] || "";
            const numAmount = typeof amount === "number" ? amount : parseFloat(String(amount));
            return {
              id: crypto.randomUUID(),
              description: String(row["Description"] || row["description"] || "").trim(),
              category: String(row["Category"] || row["category"] || "").trim(),
              amount: isNaN(numAmount) || numAmount === 0 ? "" : numAmount.toString(),
            };
          });

        if (imported.length === 0) {
          setError("No valid line items found in the spreadsheet. Ensure columns are named Description, Category, and Amount.");
          return;
        }

        setLineItems(imported);
        setError(null);
      } catch {
        setError("Failed to read spreadsheet. Please ensure it is a valid .xlsx or .csv file.");
      }
    };
    reader.readAsArrayBuffer(file);

    // Reset input so the same file can be re-imported
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    setError(null);

    if (!gcCompany.trim()) {
      setError("Company name is required");
      return;
    }

    const validItems = lineItems.filter(
      (li) => li.description.trim() && parseFloat(li.amount) > 0
    );
    if (validItems.length === 0) {
      setError("At least one line item with a description and amount is required");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/bids/invite/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gcCompany: gcCompany.trim(),
          gcName: gcName.trim() || null,
          gcEmail: gcEmail.trim() || null,
          gcPhone: gcPhone.trim() || null,
          notes: notes.trim() || null,
          lineItems: validItems.map((li) => ({
            description: li.description.trim(),
            amount: parseFloat(li.amount),
            category: li.category.trim() || null,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit bid");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit bid");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-4">
          <CheckCircle className="h-16 w-16 text-emerald-500 mx-auto" />
          <h1 className="text-2xl font-bold">Bid Submitted</h1>
          <p className="text-muted-foreground">
            Your bid for <span className="font-medium text-foreground">{projectName}</span> has
            been submitted successfully. The project team will review your submission.
          </p>
          <p className="text-sm text-muted-foreground">
            Total: {formatCurrency(total)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-3xl font-bold">Submit a Bid</h1>
          <p className="text-lg text-muted-foreground">{projectName}</p>
          {projectAddress && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(projectAddress)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
            >
              {projectAddress}
            </a>
          )}
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-md text-sm">
            {error}
          </div>
        )}

        {/* Company Info */}
        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold">Company Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Company Name *
              </label>
              <Input
                value={gcCompany}
                onChange={(e) => setGcCompany(e.target.value)}
                placeholder="Your company name"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Contact Name
              </label>
              <Input
                value={gcName}
                onChange={(e) => setGcName(e.target.value)}
                placeholder="Contact person"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Email
              </label>
              <Input
                type="email"
                value={gcEmail}
                onChange={(e) => setGcEmail(e.target.value)}
                placeholder="email@company.com"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Phone
              </label>
              <Input
                value={gcPhone}
                onChange={(e) => setGcPhone(e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold">Bid Line Items</h2>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                <Download className="h-4 w-4 mr-1" /> Download Template
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-1" /> Import Spreadsheet
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleImportFile}
              />
              <Button variant="outline" size="sm" onClick={addLineItem}>
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {/* Header row */}
            <div className="grid grid-cols-[1fr_auto_120px_40px] gap-2 text-xs font-medium text-muted-foreground px-1">
              <span>Description</span>
              <span>Category (optional)</span>
              <span className="text-right">Amount</span>
              <span />
            </div>

            {lineItems.map((li) => (
              <div
                key={li.id}
                className="grid grid-cols-[1fr_auto_120px_40px] gap-2 items-center"
              >
                <Input
                  value={li.description}
                  onChange={(e) =>
                    updateLineItem(li.id, "description", e.target.value)
                  }
                  placeholder="Line item description"
                />
                <Input
                  value={li.category}
                  onChange={(e) =>
                    updateLineItem(li.id, "category", e.target.value)
                  }
                  placeholder="Category"
                  className="w-32"
                />
                <Input
                  type="number"
                  value={li.amount}
                  onChange={(e) =>
                    updateLineItem(li.id, "amount", e.target.value)
                  }
                  placeholder="0.00"
                  className="text-right"
                  step="0.01"
                  min="0"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeLineItem(li.id)}
                  disabled={lineItems.length <= 1}
                  className="h-9 w-9"
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="border-t border-border pt-4 flex items-center justify-between">
            <span className="text-lg font-semibold">Total</span>
            <span className="text-lg font-bold">{formatCurrency(total)}</span>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-card border border-border rounded-lg p-6 space-y-2">
          <h2 className="text-lg font-semibold">Notes (optional)</h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional notes, qualifications, or exclusions..."
            className="w-full min-h-[100px] rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {/* Submit */}
        <div className="flex justify-end">
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              "Submitting..."
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" /> Submit Bid
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
