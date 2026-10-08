import { z } from 'zod';
import { PrintRequest } from '../models/PrintRequest';
import { PrintJob } from '../models/PrintJob';
import { File } from '../models/File';
import { Session } from '../models/Session';
import { asyncHandler } from '../utils/errors';
import type { AuthedRequest } from '../middleware/auth';

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

/** GET /api/analytics/summary?days=30 */
export const analyticsSummary = asyncHandler(async (req: AuthedRequest, res) => {
  const { days } = querySchema.parse(req.query);
  const shopId = req.shop!._id;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [requestsByStatus, revenueAgg, sheetAgg, fileCount, activeSessions, jobsByStatus, topPrinters] =
    await Promise.all([
      PrintRequest.aggregate<{ _id: string; count: number }>([
        { $match: { shopId, createdAt: { $gte: since } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      PrintRequest.aggregate<{ _id: null; total: number }>([
        { $match: { shopId, status: 'completed', createdAt: { $gte: since } } },
        { $group: { _id: null, total: { $sum: '$finalPrice' } } },
      ]),
      PrintJob.aggregate<{ _id: null; sheets: number; pages: number }>([
        { $match: { shopId, status: 'completed', createdAt: { $gte: since } } },
        { $group: { _id: null, sheets: { $sum: '$sheets' }, pages: { $sum: '$pages' } } },
      ]),
      File.countDocuments({ shopId, createdAt: { $gte: since } }),
      Session.countDocuments({ shopId, status: 'active', expiresAt: { $gte: new Date() } }),
      PrintJob.aggregate<{ _id: string; count: number }>([
        { $match: { shopId, createdAt: { $gte: since } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      PrintJob.aggregate<{ _id: string; sheets: number; jobs: number }>([
        { $match: { shopId, createdAt: { $gte: since } } },
        { $group: { _id: '$printerName', sheets: { $sum: '$sheets' }, jobs: { $sum: 1 } } },
        { $sort: { sheets: -1 } },
        { $limit: 5 },
      ]),
    ]);

  const statusMap = Object.fromEntries(requestsByStatus.map((r) => [r._id, r.count]));
  const jobStatusMap = Object.fromEntries(jobsByStatus.map((r) => [r._id, r.count]));

  res.json({
    days,
    requests: {
      total: requestsByStatus.reduce((s, r) => s + r.count, 0),
      waiting: statusMap.waiting ?? 0,
      processing: statusMap.processing ?? 0,
      printing: statusMap.printing ?? 0,
      completed: statusMap.completed ?? 0,
      rejected: statusMap.rejected ?? 0,
      cancelled: statusMap.cancelled ?? 0,
    },
    jobs: jobStatusMap,
    revenue: revenueAgg[0]?.total ?? 0,
    sheetsPrinted: sheetAgg[0]?.sheets ?? 0,
    pagesProcessed: sheetAgg[0]?.pages ?? 0,
    filesUploaded: fileCount,
    activeSessions,
    topPrinters: topPrinters.map((p) => ({ name: p._id, sheets: p.sheets, jobs: p.jobs })),
  });
});

/** GET /api/analytics/daily?days=14 — per-day activity for the charts. */
export const analyticsDaily = asyncHandler(async (req: AuthedRequest, res) => {
  const { days } = querySchema.parse(req.query);
  const shopId = req.shop!._id;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [byDay, revenueByDay] = await Promise.all([
    PrintRequest.aggregate<{ _id: string; total: number; completed: number }>([
      { $match: { shopId, createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    PrintRequest.aggregate<{ _id: string; revenue: number }>([
      { $match: { shopId, status: 'completed', completedAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } },
          revenue: { $sum: '$finalPrice' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const revenueMap = Object.fromEntries(revenueByDay.map((r) => [r._id, r.revenue]));

  // Fill missing days with zeros so charts stay continuous.
  const daily: Array<{ date: string; requests: number; completed: number; revenue: number }> = [];
  const cursor = new Date(since);
  const today = new Date();
  while (cursor <= today) {
    const key = cursor.toISOString().slice(0, 10);
    const row = byDay.find((d) => d._id === key);
    daily.push({
      date: key,
      requests: row?.total ?? 0,
      completed: row?.completed ?? 0,
      revenue: revenueMap[key] ?? 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  res.json({ daily });
});
