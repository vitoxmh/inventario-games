-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mpPreapprovalId" TEXT,
ADD COLUMN     "mpPreapprovalPlanId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_mpPreapprovalId_key" ON "User"("mpPreapprovalId");
