-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('green', 'yellow', 'red');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('todo', 'in_progress', 'done', 'blocked');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('sourcing', 'npi', 'cost_saving', 'cip', 'other');

-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('pm', 'engineer', 'procurement', 'qa', 'manufacturing', 'designer', 'other');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('pm', 'member', 'executive');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "RiskImpact" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "RiskProbability" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "RiskStatus" AS ENUM ('open', 'mitigated', 'closed');

-- CreateEnum
CREATE TYPE "DelayRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "WeeklyUpdateStatus" AS ENUM ('on_time', 'delay');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('task_assigned', 'delay_submitted', 'delay_approved', 'delay_rejected', 'task_overdue', 'support_needed');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'member',
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "project_code" TEXT NOT NULL,
    "project_type" "ProjectType" NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT NOT NULL DEFAULT '',
    "purpose" TEXT NOT NULL DEFAULT '',
    "scope" TEXT NOT NULL DEFAULT '',
    "roi" TEXT NOT NULL DEFAULT '',
    "created_reason" TEXT NOT NULL DEFAULT '',
    "expected_benefits" TEXT,
    "smart_specific" TEXT,
    "smart_measurable" TEXT,
    "smart_achievable" TEXT,
    "smart_relevant" TEXT,
    "smart_time_bound" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'green',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "budget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "budget_used" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "owner_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_team_members" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL,
    "responsibility" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "project_team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestones" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'todo',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestone_baselines" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "milestone_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "baselined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "milestone_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "milestone_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "assignee" TEXT NOT NULL DEFAULT '',
    "status" "TaskStatus" NOT NULL DEFAULT 'todo',
    "priority" "Priority" NOT NULL DEFAULT 'medium',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "completed_by" TEXT,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_dependencies" (
    "dependent_id" TEXT NOT NULL,
    "prerequisite_id" TEXT NOT NULL,

    CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("dependent_id","prerequisite_id")
);

-- CreateTable
CREATE TABLE "task_logs" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "log_date" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risks" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "impact" "RiskImpact" NOT NULL DEFAULT 'medium',
    "probability" "RiskProbability" NOT NULL DEFAULT 'medium',
    "mitigation" TEXT NOT NULL DEFAULT '',
    "status" "RiskStatus" NOT NULL DEFAULT 'open',

    CONSTRAINT "risks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_updates" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "week_of" TIMESTAMP(3) NOT NULL,
    "updated_by_id" TEXT NOT NULL,
    "overall_status" "WeeklyUpdateStatus" NOT NULL DEFAULT 'on_time',
    "overall_notes" TEXT NOT NULL DEFAULT '',
    "blockers" TEXT NOT NULL DEFAULT '',
    "next_week_plan" TEXT NOT NULL DEFAULT '',
    "key_achievements" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestone_updates" (
    "id" TEXT NOT NULL,
    "weekly_update_id" TEXT NOT NULL,
    "milestone_id" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "milestone_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delay_requests" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "can_catch_up" BOOLEAN NOT NULL DEFAULT false,
    "support_needed" TEXT NOT NULL DEFAULT '',
    "status" "DelayRequestStatus" NOT NULL DEFAULT 'pending',
    "reviewer_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_notes" TEXT,
    "support_resolved" BOOLEAN,
    "support_resolved_at" TIMESTAMP(3),
    "support_resolved_by_id" TEXT,
    "support_resolved_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delay_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affected_milestones" (
    "id" TEXT NOT NULL,
    "delay_request_id" TEXT NOT NULL,
    "milestone_id" TEXT NOT NULL,
    "original_date" TIMESTAMP(3) NOT NULL,
    "proposed_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affected_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "project_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_code_sequences" (
    "id" TEXT NOT NULL,
    "project_type" "ProjectType" NOT NULL,
    "year" INTEGER NOT NULL,
    "last_seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "project_code_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "projects_project_code_key" ON "projects"("project_code");

-- CreateIndex
CREATE INDEX "projects_start_date_end_date_idx" ON "projects"("start_date", "end_date");

-- CreateIndex
CREATE INDEX "project_team_members_project_id_idx" ON "project_team_members"("project_id");

-- CreateIndex
CREATE INDEX "project_team_members_user_id_idx" ON "project_team_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_team_members_project_id_user_id_key" ON "project_team_members"("project_id", "user_id");

-- CreateIndex
CREATE INDEX "milestones_project_id_sort_order_idx" ON "milestones"("project_id", "sort_order");

-- CreateIndex
CREATE INDEX "milestone_baselines_project_id_idx" ON "milestone_baselines"("project_id");

-- CreateIndex
CREATE INDEX "milestone_baselines_milestone_id_idx" ON "milestone_baselines"("milestone_id");

-- CreateIndex
CREATE INDEX "tasks_project_id_milestone_id_sort_order_idx" ON "tasks"("project_id", "milestone_id", "sort_order");

-- CreateIndex
CREATE INDEX "tasks_assignee_idx" ON "tasks"("assignee");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE INDEX "task_dependencies_prerequisite_id_idx" ON "task_dependencies"("prerequisite_id");

-- CreateIndex
CREATE INDEX "task_logs_task_id_idx" ON "task_logs"("task_id");

-- CreateIndex
CREATE INDEX "task_logs_project_id_idx" ON "task_logs"("project_id");

-- CreateIndex
CREATE INDEX "risks_project_id_idx" ON "risks"("project_id");

-- CreateIndex
CREATE INDEX "weekly_updates_project_id_week_of_idx" ON "weekly_updates"("project_id", "week_of");

-- CreateIndex
CREATE INDEX "milestone_updates_weekly_update_id_idx" ON "milestone_updates"("weekly_update_id");

-- CreateIndex
CREATE INDEX "milestone_updates_milestone_id_idx" ON "milestone_updates"("milestone_id");

-- CreateIndex
CREATE INDEX "delay_requests_project_id_idx" ON "delay_requests"("project_id");

-- CreateIndex
CREATE INDEX "delay_requests_requester_id_idx" ON "delay_requests"("requester_id");

-- CreateIndex
CREATE INDEX "affected_milestones_delay_request_id_idx" ON "affected_milestones"("delay_request_id");

-- CreateIndex
CREATE INDEX "affected_milestones_milestone_id_idx" ON "affected_milestones"("milestone_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_idx" ON "notifications"("user_id", "read");

-- CreateIndex
CREATE INDEX "notifications_project_id_idx" ON "notifications"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_code_sequences_project_type_year_key" ON "project_code_sequences"("project_type", "year");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_team_members" ADD CONSTRAINT "project_team_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_team_members" ADD CONSTRAINT "project_team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_baselines" ADD CONSTRAINT "milestone_baselines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_baselines" ADD CONSTRAINT "milestone_baselines_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_dependent_id_fkey" FOREIGN KEY ("dependent_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_prerequisite_id_fkey" FOREIGN KEY ("prerequisite_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_updates" ADD CONSTRAINT "weekly_updates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_updates" ADD CONSTRAINT "weekly_updates_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_updates" ADD CONSTRAINT "milestone_updates_weekly_update_id_fkey" FOREIGN KEY ("weekly_update_id") REFERENCES "weekly_updates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_updates" ADD CONSTRAINT "milestone_updates_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delay_requests" ADD CONSTRAINT "delay_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delay_requests" ADD CONSTRAINT "delay_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delay_requests" ADD CONSTRAINT "delay_requests_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delay_requests" ADD CONSTRAINT "delay_requests_support_resolved_by_id_fkey" FOREIGN KEY ("support_resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affected_milestones" ADD CONSTRAINT "affected_milestones_delay_request_id_fkey" FOREIGN KEY ("delay_request_id") REFERENCES "delay_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affected_milestones" ADD CONSTRAINT "affected_milestones_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
