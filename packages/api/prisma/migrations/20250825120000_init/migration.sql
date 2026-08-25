-- CreateTable
CREATE TABLE "websites" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "slug" TEXT NOT NULL,
    "default_project_id" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "websites_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "is_super_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "website_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'website_admin',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "site_api_keys" (
    "id" TEXT NOT NULL,
    "website_id" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "label" TEXT,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "site_api_keys_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "website_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "wordpress_url" TEXT,
    "wordpress_api_key" TEXT,
    "openai_api_key" TEXT,
    "gemini_api_key" TEXT,
    "default_model" TEXT NOT NULL DEFAULT 'gemini-3.6-flash',
    "default_language" TEXT NOT NULL DEFAULT 'en',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "prompts" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "system_prompt" TEXT NOT NULL,
    "user_prompt_template" TEXT NOT NULL,
    "output_fields" JSONB NOT NULL DEFAULT '[]',
    "model" TEXT,
    "supports_vision" BOOLEAN NOT NULL DEFAULT false,
    "response_format" TEXT NOT NULL DEFAULT 'json',
    "variables" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "prompts_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "field_mappings" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "prompt_id" TEXT NOT NULL,
    "ai_output_key" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_field" TEXT NOT NULL,
    "target_selector" TEXT,
    "content_type" TEXT,
    "term_taxonomy" TEXT,
    CONSTRAINT "field_mappings_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "generation_results" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "prompt_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "item_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "generated_content" JSONB,
    "mapped_fields" JSONB,
    "raw_response" TEXT,
    "error" TEXT,
    "tokens_used" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "generation_results_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "bulk_jobs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "prompt_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "apply_mode" TEXT NOT NULL DEFAULT 'preview',
    "items" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "bulk_jobs_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "websites_slug_key" ON "websites"("slug");
-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
-- CreateIndex
CREATE UNIQUE INDEX "memberships_user_id_website_id_key" ON "memberships"("user_id", "website_id");
-- CreateIndex
CREATE UNIQUE INDEX "site_api_keys_key_hash_key" ON "site_api_keys"("key_hash");
-- CreateIndex
CREATE INDEX "site_api_keys_website_id_idx" ON "site_api_keys"("website_id");
-- CreateIndex
CREATE INDEX "projects_website_id_idx" ON "projects"("website_id");
-- CreateIndex
CREATE INDEX "prompts_project_id_idx" ON "prompts"("project_id");
-- CreateIndex
CREATE INDEX "field_mappings_project_id_idx" ON "field_mappings"("project_id");
-- CreateIndex
CREATE INDEX "field_mappings_prompt_id_idx" ON "field_mappings"("prompt_id");
-- CreateIndex
CREATE INDEX "generation_results_project_id_idx" ON "generation_results"("project_id");
-- CreateIndex
CREATE INDEX "bulk_jobs_project_id_idx" ON "bulk_jobs"("project_id");
-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "site_api_keys" ADD CONSTRAINT "site_api_keys_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "websites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "field_mappings" ADD CONSTRAINT "field_mappings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "field_mappings" ADD CONSTRAINT "field_mappings_prompt_id_fkey" FOREIGN KEY ("prompt_id") REFERENCES "prompts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "generation_results" ADD CONSTRAINT "generation_results_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "generation_results" ADD CONSTRAINT "generation_results_prompt_id_fkey" FOREIGN KEY ("prompt_id") REFERENCES "prompts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "bulk_jobs" ADD CONSTRAINT "bulk_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "bulk_jobs" ADD CONSTRAINT "bulk_jobs_prompt_id_fkey" FOREIGN KEY ("prompt_id") REFERENCES "prompts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
