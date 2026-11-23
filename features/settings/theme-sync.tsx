'use client';

import { useEffect } from 'react';
import { applyTheme, writeThemeMirror } from './theme';
import { useSettings, useSettingsLoaded } from './use-settings';

/**
 * Keeps `<html data-theme>` and the localStorage mirror in line with the saved theme, in
 * every tab. It waits for the first read: until then the blocking script in `<head>` (which
 * read the mirror) is right, and applying the default would undo it.
 */
export function ThemeSync() {
  const loaded = useSettingsLoaded();
  const { theme } = useSettings();

  useEffect(() => {
    if (!loaded) return;
    applyTheme(theme);
    writeThemeMirror(theme);
  }, [loaded, theme]);

  return null;
}
