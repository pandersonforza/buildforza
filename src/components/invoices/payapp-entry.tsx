"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/utils";

interface UserOption {
  id: string;
  name: string;
  email: string;
}

interface BudgetLineItem {
  id: string;
  description: string;
  revisedBudget: number;
  actualCost: number;
  categoryId: string;
}

interface BudgetCategory {
  id: string;
  name: string;
  categoryGroup: string;
  lineItems: BudgetLineItem[];
}

interface PayAppFormItem {
  lineItemId: string;
  description: string;
  categoryName: string;
  budget: number;
  previouslyBilled: number;
  currentAmount: number;
}

type Step = "form" | "saving";

interface PayAppEntryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  onSuccess: () => void;
}

export function PayAppEntry({ open, onOpenChange, projectId, onSuccess }: PayAppEntryProps) {
  const { toast } = useToast();
  const { user } = useAuth();

  const [step, setStep] = useState<Step>("form");
  const [gcCompany, setGcCompany] = useState("");
  const [appNumber, setAppNumber] = useState("");
  const [periodTo, setPeriodTo] = useState(new Date().toISOString().split("T")[0]);
  const [items, setItems] = useState<PayAppFormItem[]>([]);
  const [approverId, setApproverId] = useState("");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        setStep("form");
        setGcCompany("");
        setAppNumber("");
        setPeriodTo(new Date().toISOString().split("T")[0]);
        setApproverId("");
        setItems([]);
      }
      onOpenChange(isOpen);
    },
    [onOpenChange]
  );

  // Fetch hard cost line items from the project budget
  useEffect(() => {
    if (!open || !projectId) return;
    setLoading(true);

    Promise.all([
      fetch(`/api/projects/${projectId}`).then((r) => r.json()),
      fetch("/api/auth/users").then((r) => r.json()),
    ])
      .then(([project, usersData]) => {
        setUsers(usersData);

        const categories: BudgetCategory[] = project.budgetCategories || [];
        // Filter to Hard Costs group only
        const hardCostCategories = categories.filter(
          (c) => c.categoryGroup === "Hard Costs" || c.categoryGroup === "Hard Cost"
        );

        const formItems: PayAppFormItem[] = [];
        for (const cat of hardCostCategories) {
          for (const li of cat.lineItems) {
            formItems.push({
              lineItemId: li.id,
              description: li.description,
              categoryName: cat.name,
              budget: li.revisedBudget,
              previouslyBilled: li.actualCost,
              currentAmount: 0,
            });
          }
        }
        setItems(formItems);
      })
      .catch(() => {
        toast({ title: "Error", description: "Failed to load budget data", variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, [open, projectId, toast]);

  const updateAmount = (index: number, value: number) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, currentAmount: value } : item))
    );
  };

  const itemsWithAmounts = items.filter((li) => li.currentAmount > 0);
  const totalCurrentBilled = itemsWithAmounts.reduce((sum, li) => sum + li.currentAmount, 0);

  const handleSave = async (submitForApproval = false) => {
    if (itemsWithAmounts.length === 0) {
      toast({ title: "No amounts entered", description: "Enter at least one line item amount", variant: "destructive" });
      return;
    }

    if (!gcCompany.trim()) {
      toast({ title: "GC company required", description: "Enter the GC company name", variant: "destructive" });
      return;
    }

    if (submitForApproval && !approverId) {
      toast({ title: "Approver required", description: "Select an approver to submit for approval", variant: "destructive" });
      return;
    }

    setStep("saving");

    try {
      let created = 0;
      const approverUser = users.find((u) => u.id === approverId);

      for (const li of itemsWithAmounts) {
        const body: Record<string, unknown> = {
          vendorName: gcCompany.trim(),
          invoiceNumber: appNumber ? `PA-${appNumber}-${created + 1}` : null,
          amount: li.currentAmount,
          date: periodTo,
          description: li.description,
          projectId: projectId || null,
          budgetLineItemId: li.lineItemId || null,
          aiNotes: `Pay App entry: ${li.description}. Budget: ${formatCurrency(li.budget)}, Previously billed: ${formatCurrency(li.previouslyBilled)}, This period: ${formatCurrency(li.currentAmount)}.`,
        };

        if (submitForApproval) {
          body.status = "Submitted";
          body.approver = approverUser?.name ?? "";
          body.approverId = approverId;
          body.submittedBy = user?.name ?? "";
          body.submittedById = user?.id ?? null;
          body.submittedDate = new Date().toISOString();
        }

        const res = await fetch("/api/invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) created++;
      }

      toast({
        title: submitForApproval ? "Pay app submitted for approval" : "Pay app invoices created",
        description: `Created ${created} invoice${created !== 1 ? "s" : ""} totaling ${formatCurrency(totalCurrentBilled)}`,
      });
      onSuccess();
      handleOpenChange(false);
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to save invoices",
        variant: "destructive",
      });
      setStep("form");
    }
  };

  const approverOptions = users
    .filter((u) => u.id !== user?.id)
    .map((u) => ({ value: u.id, label: u.name }));

  // Group items by subcategory for display
  const grouped = new Map<string, PayAppFormItem[]>();
  for (const item of items) {
    if (!grouped.has(item.categoryName)) grouped.set(item.categoryName, []);
    grouped.get(item.categoryName)!.push(item);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "form" ? "Pay Application Entry" : "Creating Invoices"}
          </DialogTitle>
          <DialogDescription>
            {step === "form"
              ? "Enter the current billing amounts for each hard cost line item."
              : "Creating invoices from entered amounts..."}
          </DialogDescription>
        </DialogHeader>

        {step === "form" && (
          <div className="space-y-4">
            {/* Header info */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>GC Company *</Label>
                <Input
                  value={gcCompany}
                  onChange={(e) => setGcCompany(e.target.value)}
                  placeholder="General contractor name"
                />
              </div>
              <div className="space-y-2">
                <Label>Application #</Label>
                <Input
                  value={appNumber}
                  onChange={(e) => setAppNumber(e.target.value)}
                  placeholder="Pay app number"
                />
              </div>
              <div className="space-y-2">
                <Label>Period To</Label>
                <Input
                  type="date"
                  value={periodTo}
                  onChange={(e) => setPeriodTo(e.target.value)}
                />
              </div>
            </div>

            {/* Line items table */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">Loading budget line items...</span>
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No hard cost line items found in this project&apos;s budget. Add line items to the budget first.
              </div>
            ) : (
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-left text-muted-foreground">
                      <th className="py-2 px-3">Line Item</th>
                      <th className="py-2 px-3 text-right w-32">Budget</th>
                      <th className="py-2 px-3 text-right w-32">Previously Billed</th>
                      <th className="py-2 px-3 text-right w-36">This Period</th>
                      <th className="py-2 px-3 text-right w-32">Remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(grouped.entries()).map(([catName, catItems]) => (
                      <tbody key={catName}>
                        {/* Subcategory header */}
                        <tr className="bg-primary/10 border-t-2 border-primary/20">
                          <td colSpan={5} className="py-2 px-3 font-semibold text-foreground">
                            {catName}
                          </td>
                        </tr>
                        {catItems.map((item) => {
                          const idx = items.indexOf(item);
                          const remaining = item.budget - item.previouslyBilled - item.currentAmount;
                          return (
                            <tr key={item.lineItemId} className="border-b border-border/50 hover:bg-muted/30">
                              <td className="py-1.5 px-3">{item.description}</td>
                              <td className="py-1.5 px-3 text-right text-muted-foreground">
                                {formatCurrency(item.budget)}
                              </td>
                              <td className="py-1.5 px-3 text-right text-muted-foreground">
                                {formatCurrency(item.previouslyBilled)}
                              </td>
                              <td className="py-1.5 px-3 text-right">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  className="w-32 text-right h-7 text-sm"
                                  value={item.currentAmount || ""}
                                  onChange={(e) => updateAmount(idx, parseFloat(e.target.value) || 0)}
                                  placeholder="0.00"
                                />
                              </td>
                              <td className={`py-1.5 px-3 text-right ${remaining < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                                {formatCurrency(remaining)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-primary/20 font-semibold">
                      <td className="py-2 px-3">
                        Total ({itemsWithAmounts.length} items)
                      </td>
                      <td className="py-2 px-3 text-right">
                        {formatCurrency(items.reduce((s, li) => s + li.budget, 0))}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {formatCurrency(items.reduce((s, li) => s + li.previouslyBilled, 0))}
                      </td>
                      <td className="py-2 px-3 text-right text-primary">
                        {formatCurrency(totalCurrentBilled)}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {formatCurrency(
                          items.reduce((s, li) => s + li.budget - li.previouslyBilled - li.currentAmount, 0)
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Approver */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Assign Approver</Label>
                <SelectNative
                  value={approverId}
                  onChange={(e) => setApproverId(e.target.value)}
                  placeholder="Select an approver"
                  options={approverOptions}
                />
              </div>
              <div className="space-y-2">
                <Label>Submitted By</Label>
                <Input value={user?.name ?? ""} disabled className="bg-muted" />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
              <Button variant="outline" onClick={() => handleSave(false)}>Save as Drafts</Button>
              <Button onClick={() => handleSave(true)}>Submit for Approval</Button>
            </DialogFooter>
          </div>
        )}

        {step === "saving" && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
            <p className="text-sm font-medium">Creating invoices from pay application...</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
