import type { BulkJob, BulkJobItem, JobItemStatus } from '@ai-content/core';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { generateContent } from './generation';

const activeJobs = new Map<string, boolean>();

export function createBulkJob(
  projectId: string,
  promptId: string,
  name: string,
  items: Omit<BulkJobItem, 'id' | 'status' | 'retryCount'>[],
  applyMode: BulkJob['applyMode'] = 'preview'
): BulkJob {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  const jobItems: BulkJobItem[] = items.map((item) => ({
    ...item,
    id: uuidv4(),
    status: 'pending' as JobItemStatus,
    retryCount: 0,
  }));

  const job: BulkJob = {
    id,
    projectId,
    promptId,
    name,
    status: 'queued',
    applyMode,
    items: jobItems,
    createdAt: now,
    updatedAt: now,
  };

  db.prepare(`
    INSERT INTO bulk_jobs (id, project_id, prompt_id, name, status, apply_mode, items, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, projectId, promptId, name, 'queued', applyMode, JSON.stringify(jobItems), now, now);

  return job;
}

export async function processBulkJob(
  jobId: string,
  getItemData: (item: BulkJobItem) => Promise<{
    sourceData: Record<string, unknown>;
    images?: Array<{ key: string; url: string; base64?: string; mimeType?: string }>;
  }>
): Promise<BulkJob> {
  const db = getDb();
  if (activeJobs.get(jobId)) {
    throw new Error('Job is already running');
  }
  activeJobs.set(jobId, true);

  const row = db.prepare('SELECT * FROM bulk_jobs WHERE id = ?').get(jobId) as {
    id: string;
    project_id: string;
    prompt_id: string;
    name: string;
    status: string;
    apply_mode: string;
    items: string;
    created_at: string;
    updated_at: string;
  };

  if (!row) throw new Error('Job not found');

  let items: BulkJobItem[] = JSON.parse(row.items);
  const now = new Date().toISOString();

  db.prepare('UPDATE bulk_jobs SET status = ?, updated_at = ? WHERE id = ?').run('running', now, jobId);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.status === 'completed') continue;

    items[i] = { ...item, status: 'processing' };
    updateJobItems(jobId, items, 'running');

    try {
      const { sourceData, images } = await getItemData(item);
      const result = await generateContent({
        projectId: row.project_id,
        promptId: row.prompt_id,
        itemId: item.itemId,
        itemType: item.itemType,
        taxonomy: item.taxonomy,
        postType: item.postType,
        sourceData,
        images,
        applyMode: row.apply_mode as BulkJob['applyMode'],
      });

      if (result.status === 'success') {
        items[i] = {
          ...items[i],
          status: 'completed',
          generationResultId: result.id,
        };
      } else {
        items[i] = {
          ...items[i],
          status: 'failed',
          error: result.error,
        };
      }
    } catch (err) {
      items[i] = {
        ...items[i],
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }

    updateJobItems(jobId, items, 'running');
  }

  const hasFailed = items.some((i) => i.status === 'failed');
  const finalStatus = hasFailed ? 'completed' : 'completed';
  const completedAt = new Date().toISOString();

  db.prepare('UPDATE bulk_jobs SET status = ?, items = ?, updated_at = ?, completed_at = ? WHERE id = ?')
    .run(finalStatus, JSON.stringify(items), completedAt, completedAt, jobId);

  activeJobs.delete(jobId);

  return getBulkJob(jobId)!;
}

export function getBulkJob(jobId: string): BulkJob | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM bulk_jobs WHERE id = ?').get(jobId) as {
    id: string;
    project_id: string;
    prompt_id: string;
    name: string;
    status: string;
    apply_mode: string;
    items: string;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
  } | undefined;

  if (!row) return null;

  return {
    id: row.id,
    projectId: row.project_id,
    promptId: row.prompt_id,
    name: row.name,
    status: row.status as BulkJob['status'],
    applyMode: row.apply_mode as BulkJob['applyMode'],
    items: JSON.parse(row.items),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
  };
}

export function retryFailedItems(jobId: string): BulkJob | null {
  const job = getBulkJob(jobId);
  if (!job) return null;

  const items: BulkJobItem[] = job.items.map((item: BulkJobItem) =>
    item.status === 'failed'
      ? { ...item, status: 'pending' as JobItemStatus, error: undefined, retryCount: item.retryCount + 1 }
      : item
  );

  updateJobItems(jobId, items, 'queued');
  return getBulkJob(jobId);
}

function updateJobItems(jobId: string, items: BulkJobItem[], status: string): void {
  const db = getDb();
  db.prepare('UPDATE bulk_jobs SET items = ?, status = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(items), status, new Date().toISOString(), jobId);
}

export function getJobStats(job: BulkJob) {
  const stats: Record<JobItemStatus | 'total', number> = { total: job.items.length, completed: 0, processing: 0, pending: 0, failed: 0, skipped: 0 };
  for (const item of job.items) {
    stats[item.status]++;
  }
  return stats;
}
