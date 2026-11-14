'use client';

/**
 * Last resort: the root layout itself failed, so there is no shell, no translations and no
 * stylesheet to rely on. Plain markup, both languages, and a full reload.
 */
export default function GlobalError() {
  return (
    <html lang="uk">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          fontFamily: 'ui-monospace, Menlo, monospace',
          fontSize: 14,
          lineHeight: 1.6,
          textAlign: 'center',
          colorScheme: 'light dark',
        }}
      >
        <div>
          <p>
            Щось пішло не так. Ваш прогрес збережено.
            <br />
            Something went wrong. Your progress is saved.
          </p>
          <a href="">Перезавантажити · Reload</a>
        </div>
      </body>
    </html>
  );
}
