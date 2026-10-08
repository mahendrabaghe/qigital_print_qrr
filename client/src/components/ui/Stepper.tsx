import { Check } from 'lucide-react';

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-1.5">
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={step} className="flex items-center gap-1.5">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold transition ${
                done ? 'bg-emerald-500 text-white' : active ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500'
              }`}
            >
              {done ? <Check size={14} /> : i + 1}
            </div>
            <span className={`hidden text-xs font-semibold sm:block ${active ? 'text-brand-700' : done ? 'text-slate-500' : 'text-slate-400'}`}>
              {step}
            </span>
            {i < steps.length - 1 && <span className={`h-0.5 w-4 rounded sm:w-8 ${done ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
          </li>
        );
      })}
    </ol>
  );
}
