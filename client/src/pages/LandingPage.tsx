import { Link } from 'react-router-dom';
import { Printer, QrCode, ShieldCheck, Clock } from 'lucide-react';
import { LanguageToggle, useI18n } from '../i18n';

export default function LandingPage() {
  const { t } = useI18n();

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-brand-700 via-brand-600 to-brand-800">
      <header className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2 font-extrabold text-white">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
            <Printer size={20} />
          </span>
          {t('appName')}
        </div>
        <LanguageToggle compact />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 pb-16 text-center text-white">
        <div className="flex h-28 w-28 items-center justify-center rounded-3xl bg-white/15 shadow-inner">
          <QrCode size={72} strokeWidth={1.5} />
        </div>
        <div className="space-y-3">
          <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">{t('welcome')}</h1>
          <p className="mx-auto max-w-md text-brand-100">{t('scanCta')}</p>
          <p className="mx-auto max-w-sm text-sm text-brand-200/80">{t('scanCtaHint')}</p>
        </div>

        <div className="grid w-full max-w-md grid-cols-3 gap-3 text-[11px] font-medium text-brand-100 sm:text-xs">
          <div className="rounded-2xl bg-white/10 p-3">
            <Clock className="mx-auto mb-1.5" size={20} />
            30–60 sec
          </div>
          <div className="rounded-2xl bg-white/10 p-3">
            <Printer className="mx-auto mb-1.5" size={20} />
            PDF · Photos
          </div>
          <div className="rounded-2xl bg-white/10 p-3">
            <ShieldCheck className="mx-auto mb-1.5" size={20} />
            Auto-delete
          </div>
        </div>
      </main>

      <footer className="px-6 pb-6 text-center">
        <Link to="/admin/login" className="text-sm font-semibold text-brand-200 underline-offset-4 hover:text-white hover:underline">
          {t('adminLink')}
        </Link>
      </footer>
    </div>
  );
}
