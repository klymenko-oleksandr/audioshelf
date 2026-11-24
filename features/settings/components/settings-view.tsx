'use client';

import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@/components/language-switcher';
import { AccountCard } from '@/features/account/components/account-card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  type SettingKey,
  type Settings,
  DEFAULT_SPEED_OPTIONS,
  SKIP_BACK_OPTIONS,
  SKIP_FORWARD_OPTIONS,
  THEMES,
} from '../definitions';
import { useSettings, useSettingsLoaded, getSettingsStore } from '../use-settings';
import { Card, Row } from './row';
import { Segmented } from './segmented';
import { Switch } from './switch';

const set = <K extends SettingKey>(key: K, value: Settings[K]) =>
  void getSettingsStore().set(key, value);

/**
 * One responsive page: stacked cards on a phone, two columns from `lg`. The same controls at
 * every width, so there is a single layout to keep in line with the design boards.
 */
export function SettingsView() {
  const t = useTranslations('settings');
  const settings = useSettings();
  const loaded = useSettingsLoaded();

  if (!loaded) {
    return (
      <div className="grid gap-4 lg:grid-cols-2" aria-busy>
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  const seconds = (n: number) => t('seconds', { count: n });

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card title={t('playback.title')}>
        <Row title={t('playback.speed')}>
          <Segmented
            label={t('playback.speed')}
            options={DEFAULT_SPEED_OPTIONS.map((v) => ({ value: v, label: `${v}×` }))}
            value={settings.defaultSpeed}
            onChange={(v) => set('defaultSpeed', v)}
          />
        </Row>
        <Row title={t('playback.skipBack')}>
          <Segmented
            label={t('playback.skipBack')}
            options={SKIP_BACK_OPTIONS.map((v) => ({ value: v, label: seconds(v) }))}
            value={settings.skipBackSeconds}
            onChange={(v) => set('skipBackSeconds', v)}
          />
        </Row>
        <Row title={t('playback.skipForward')}>
          <Segmented
            label={t('playback.skipForward')}
            options={SKIP_FORWARD_OPTIONS.map((v) => ({ value: v, label: seconds(v) }))}
            value={settings.skipForwardSeconds}
            onChange={(v) => set('skipForwardSeconds', v)}
          />
        </Row>
        <Row title={t('playback.autoRewind')} hint={t('playback.autoRewindHint')}>
          <Switch
            label={t('playback.autoRewind')}
            checked={settings.autoRewind}
            onChange={(v) => set('autoRewind', v)}
          />
        </Row>
        <Row title={t('playback.continue')} hint={t('playback.continueHint')}>
          <Switch
            label={t('playback.continue')}
            checked={settings.continueToNextChapter}
            onChange={(v) => set('continueToNextChapter', v)}
          />
        </Row>
      </Card>

      <div className="flex flex-col gap-4">
        <AccountCard />
        <Card title={t('appearance.title')}>
          <Row title={t('appearance.theme')}>
            <Segmented
              label={t('appearance.theme')}
              options={THEMES.map((v) => ({ value: v, label: t(`appearance.${v}`) }))}
              value={settings.theme}
              onChange={(v) => set('theme', v)}
            />
          </Row>
          <Row title={t('language.title')}>
            <LanguageSwitcher />
          </Row>
        </Card>

        <Card title={t('downloads.title')} badge={<Badge variant="secondary">{t('soon')}</Badge>}>
          <Row title={t('downloads.wifiOnly')} hint={t('downloads.wifiOnlyHint')}>
            <Switch label={t('downloads.wifiOnly')} checked={true} onChange={() => {}} disabled />
          </Row>
          <Row title={t('downloads.autoRemove')} hint={t('downloads.autoRemoveHint')}>
            <Switch
              label={t('downloads.autoRemove')}
              checked={false}
              onChange={() => {}}
              disabled
            />
          </Row>
          <Row title={t('downloads.storage')} hint={t('downloads.storageHint')}>
            <button
              type="button"
              disabled
              className="border-border rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {t('downloads.manage')}
            </button>
          </Row>
        </Card>
      </div>
    </div>
  );
}
