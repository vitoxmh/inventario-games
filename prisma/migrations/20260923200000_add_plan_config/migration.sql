-- CreateTable
-- Precondition: enum type "Plan" created in 20260922211007_init
CREATE TABLE "PlanConfig" (
    "plan" "Plan" NOT NULL,
    "imageLimit" INTEGER NOT NULL,

    CONSTRAINT "PlanConfig_pkey" PRIMARY KEY ("plan")
);

-- Seed default image limits per plan
INSERT INTO "PlanConfig" ("plan", "imageLimit") VALUES
    ('FREE', 1),
    ('PRO', 3),
    ('COLLECTOR', 5);