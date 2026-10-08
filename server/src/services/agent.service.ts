import { Printer } from '../models/Printer';
import type { PrintJobDoc } from '../models/PrintJob';
import { emitToShop } from '../sockets/emit';

export interface ReportedPrinter {
  name: string;
  type?: 'usb' | 'network' | 'virtual';
  status?: 'online' | 'offline' | 'unknown';
}

/**
 * Upsert the printers reported by a print agent and mark missing agent printers
 * offline. Emits printer:statusChanged to the shop's admins.
 */
export async function syncAgentPrinters(shopId: string, reported: ReportedPrinter[]): Promise<unknown[]> {
  for (const p of reported) {
    await Printer.findOneAndUpdate(
      { shopId, name: p.name },
      {
        $set: {
          type: p.type ?? 'usb',
          status: p.status ?? 'online',
          source: 'agent',
          lastSeenAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  const names = reported.map((p) => p.name);
  const agentPrinters = await Printer.find({ shopId, source: 'agent' });
  for (const existing of agentPrinters) {
    if (!names.includes(existing.name) && existing.status !== 'offline') {
      existing.status = 'offline';
      existing.lastSeenAt = new Date();
      await existing.save();
    }
  }

  const printers = await Printer.find({ shopId }).sort({ isDefault: -1, name: 1 });
  const payload = printers.map((p) => ({
    id: p._id.toString(),
    name: p.name,
    type: p.type,
    status: p.status,
    isDefault: p.isDefault,
    source: p.source,
    lastSeenAt: p.lastSeenAt,
  }));
  emitToShop(shopId, 'printer:statusChanged', { printers: payload });
  return payload;
}

/** The payload we hand to an agent when a job is assigned (HTTP poll or socket push). */
export function buildAgentJobPayload(job: PrintJobDoc): Record<string, unknown> {
  return {
    id: job._id.toString(),
    code: job.code,
    requestCode: job.requestCode,
    fileName: job.fileName,
    printerName: job.printerName,
    sumatraArgs: job.sumatraArgs,
    settings: job.settings,
    pages: job.pages,
    sheets: job.sheets,
    fileUrl: `/api/agent/jobs/${job._id.toString()}/file`,
  };
}

/** Names of printers this shop's agent has reported (fallback when the agent polls without a list). */
export async function agentNamesForShop(shopId: string): Promise<string[]> {
  const printers = await Printer.find({ shopId, source: 'agent' });
  return printers.map((p) => p.name);
}
