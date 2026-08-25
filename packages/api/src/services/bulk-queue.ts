import type { BulkJob, BulkJobItem, JobItemStatus } from '@ai-content/core';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../db';
import { formatBulkJobRow } from '../lib/formatters';
import { generateContent } from './generation';

const activeJobs = new Map<string, boolean>();

export async function createBulkJob(
  projectId: string,
  promptId: string,
  name: string,
  items: Omit<BulkJobItem, 'id' | 'status' | 'retryCount'>[],
  applyMode: BulkJob['applyMode'] = 'preview'
): Promise<BulkJob> {
  const jobItems: BulkJobItem[] = items.map((item) => ({
    ...item,
    id: uuidv4(),
    status: 'pending' as JobItemStatus,
    retryCount: 0,
  }));

  const row = await prisma.bulkJob.create({
    data: {
      projectId,
      promptId,
      name,
      status: 'queued',
      applyMode,
      items: jobItems as object,
    },
  });

  return formatBulkJobRow(row);
}

export async function processBulkJob(
  jobId: string,
  getItemData: (item: BulkJobItem) => Promise<{
    sourceData: Record<string, unknown>;
    images?: Array<{ key: string; url: string; base64?: string; mimeType?: string }>;
  }>
): Promise<BulkJob> {
  if (activeJobs.get(jobId)) {
    throw new Error('Job is already running');
  }
  activeJobs.set(jobId, true);

  const row = await prisma.bulkJob.findUnique({ where: { id: jobId } });
  if (!row) throw new Error('Job not found');

  let items: BulkJobItem[] = row.items as unknown as BulkJobItem[];

  await prisma.bulkJob.update({
    where: { id: jobId },
    data: { status: 'running' },
  });

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.status === 'completed') continue;

    items[i] = { ...item, status: 'processing' };
    await updateJobItems(jobId, items, 'running');

    try {
      const { sourceData, images } = await getItemData(item);
      const result = await generateContent({
        projectId: row.projectId,
        promptId: row.promptId,
        itemId: item.itemId,
        itemType: item.itemType,
        taxonomy: item.taxonomy,
        postType: item.postType,
        sourceData,
        images,
        applyMode: row.applyMode as BulkJob['applyMode'],
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

    await updateJobItems(jobId, items, 'running');
  }

  const completedAt = new Date();
  await prisma.bulkJob.update({
    where: { id: jobId },
    data: {
      status: 'completed',
      items: items as object,
      completedAt,
    },
  });

  activeJobs.delete(jobId);

  return (await getBulkJob(jobId))!;
}

export async function getBulkJob(jobId: string): Promise<BulkJob | null> {
  const row = await prisma.bulkJob.findUnique({ where: { id: jobId } });
  if (!row) return null;
  return formatBulkJobRow(row);
}

export async function retryFailedItems(jobId: string): Promise<BulkJob | null> {
  const job = await getBulkJob(jobId);
  if (!job) return null;

  const items: BulkJobItem[] = job.items.map((item: BulkJobItem) =>
    item.status === 'failed'
      ? { ...item, status: 'pending' as JobItemStatus, error: undefined, retryCount: item.retryCount + 1 }
      : item
  );

  await updateJobItems(jobId, items, 'queued');
  return getBulkJob(jobId);
}

async function updateJobItems(jobId: string, items: BulkJobItem[], status: string): Promise<void> {
  await prisma.bulkJob.update({
    where: { id: jobId },
    data: {
      items: items as object,
      status,
    },
  });
}

export function getJobStats(job: BulkJob) {
  const stats: Record<JobItemStatus | 'total', number> = { total: job.items.length, completed: 0, processing: 0, pending: 0, failed: 0, skipped: 0 };
  for (const item of job.items) {
    stats[item.status]++;
  }
  return stats;
}
