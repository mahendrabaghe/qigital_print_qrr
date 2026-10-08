import type { Response } from 'express';
import { assignNextJob, updateJobFromAgent } from '../services/jobRunner.service';
import { agentNamesForShop, buildAgentJobPayload, syncAgentPrinters } from '../services/agent.service';
import { validateBody } from '../middleware/validate';
import { z } from 'zod';
import { asyncHandler, HttpError } from '../utils/errors';
import type { AuthedRequest } from '../middleware/auth';

interface AgentRequest extends AuthedRequest {
  /* shop set by requireAgent */
}

const printerReportSchema = z.object({
  printers: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        type: z.enum(['usb', 'network', 'virtual']).optional(),
        status: z.enum(['online', 'offline', 'unknown']).optional(),
      })
    )
    .max(50),
});

const pollSchema = z.object({
  printers: z.array(z.string().min(1).max(120)).max(50).optional(),
});

const statusSchema = z.object({
  status: z.enum(['printing', 'completed', 'failed']),
  error: z.string().max(500).optional(),
});

/** POST /api/agent/printers — the agent reports the printers it can see. */
export const reportPrinters = [
  validateBody(printerReportSchema),
  asyncHandler(async (req: AgentRequest, res: Response) => {
    const printers = await syncAgentPrinters(req.shop!._id.toString(), req.body.printers);
    res.json({ printers });
  }),
];

/** POST /api/agent/poll — pull the next queued job for any of these printers. */
export const pollJobs = [
  validateBody(pollSchema),
  asyncHandler(async (req: AgentRequest, res: Response) => {
    const shopId = req.shop!._id.toString();
    const names = req.body.printers?.length ? req.body.printers : await agentNamesForShop(shopId);
    const job = await assignNextJob(shopId, names);
    res.json({ job: job ? buildAgentJobPayload(job) : null });
  }),
];

/** POST /api/agent/jobs/:id/status — the agent reports printing progress. */
export const reportJobStatus = [
  validateBody(statusSchema),
  asyncHandler(async (req: AgentRequest, res: Response) => {
    const job = await updateJobFromAgent(req.params.id, req.body.status, req.body.error);
    if (job.shopId.toString() !== req.shop!._id.toString()) {
      throw new HttpError(403, 'FORBIDDEN', 'This job belongs to another shop');
    }
    res.json({ job: job.toPublic() });
  }),
];

/** GET /api/agent/health — lightweight liveness probe for the agent's connectivity check. */
export const agentHealth = asyncHandler(async (req: AgentRequest, res: Response) => {
  res.json({ ok: true, shop: req.shop!.name, time: new Date().toISOString() });
});
