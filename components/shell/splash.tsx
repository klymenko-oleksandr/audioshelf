import { RiHeadphoneLine, RiRefreshLine } from '@remixicon/react';
import { getTranslations } from 'next-intl/server';

/**
 * Cold-start splash (PRD: System behaviours → Splash; canvas: Splash, MSplash).
 *
 * Static HTML with its own inline CSS, so it paints on the first frame without waiting for
 * the stylesheet or any JS. <AppReady /> sets data-app-ready on <html> once the app has
 * hydrated and the splash cross-fades out over 150 ms. In-app navigation never shows it.
 *
 * The two messages are revealed by CSS animation delays, so they work even if JS never loads:
 * 3 s → "Still loading", 15 s → "Couldn't load the app" with a plain reload link.
 * Colours are literal (not tokens) because this must not depend on globals.css.
 */
const css = `
#splash{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:24px;
background:light-dark(#fff,#09090b);color:light-dark(#09090b,#fafafa);
font-family:'Geist Mono Variable',ui-monospace,'SF Mono',Menlo,monospace;
transition:opacity .15s linear,visibility 0s linear .15s}
html[data-app-ready] #splash{opacity:0;visibility:hidden;pointer-events:none}
#splash .s-box{display:flex;flex-direction:column;align-items:center;gap:20px;text-align:center}
#splash .s-mark{display:grid;place-items:center;width:64px;height:64px;border-radius:14px;
background:light-dark(#15803d,#166534);color:#f0fdf4}
#splash .s-name{font-family:'Instrument Sans Variable','Geist Variable',ui-sans-serif,system-ui,sans-serif;
font-size:28px;line-height:1.2;font-weight:600;letter-spacing:-.02em}
#splash .s-msgs{display:grid;justify-items:center;min-height:76px;font-size:13px;line-height:20px;
color:light-dark(#71717a,#a1a1aa)}
#splash .s-msgs>*{grid-area:1/1;visibility:hidden}
#splash .s-slow{animation:splash-show 0s 3s forwards,splash-hide 0s 15s forwards}
#splash .s-failed{display:flex;flex-direction:column;align-items:center;gap:12px;
animation:splash-show 0s 15s forwards}
#splash .s-reload{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 16px;
border-radius:8px;background:light-dark(#15803d,#166534);color:#f0fdf4;font-weight:500;text-decoration:none}
@keyframes splash-show{to{visibility:visible}}
@keyframes splash-hide{to{visibility:hidden}}
`;

export async function Splash() {
  const t = await getTranslations();

  return (
    <div id="splash" role="status" aria-live="polite">
      <style>{css}</style>
      <div className="s-box">
        <span className="s-mark">
          <RiHeadphoneLine size={32} aria-hidden />
        </span>
        <span className="s-name">{t('app.name')}</span>
        <div className="s-msgs">
          <span className="s-slow">{t('splash.slow')}</span>
          <div className="s-failed">
            <span>{t('splash.failed')}</span>
            {/* An empty href reloads the current URL without JS. */}
            <a className="s-reload" href="">
              <RiRefreshLine size={16} aria-hidden />
              {t('splash.reload')}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
