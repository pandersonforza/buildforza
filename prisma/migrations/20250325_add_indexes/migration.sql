-- CreateIndex
CREATE INDEX IF NOT EXISTS "Project_status_idx" ON "Project"("status");
CREATE INDEX IF NOT EXISTS "Project_stage_idx" ON "Project"("stage");
CREATE INDEX IF NOT EXISTS "DrawLineItem_budgetLineItemId_idx" ON "DrawLineItem"("budgetLineItemId");
