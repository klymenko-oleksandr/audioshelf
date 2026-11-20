import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '@/components/ui/toast';
import { absoluteUrl, shareLink } from './share';

vi.mock('@/components/ui/toast', () => ({ toast: vi.fn() }));

const messages = { copied: 'Link copied', failed: 'Could not copy' };
const target = { title: 'Кобзар', path: '/book/kobzar' };

function stub(nav: Partial<Navigator>) {
  vi.stubGlobal('navigator', nav);
}

beforeEach(() => vi.mocked(toast).mockClear());
afterEach(() => vi.unstubAllGlobals());

describe('absoluteUrl', () => {
  it('is relative to this site', () => {
    expect(absoluteUrl('/book/kobzar')).toBe(`${window.location.origin}/book/kobzar`);
  });
});

describe('shareLink', () => {
  it('uses the share sheet when there is one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stub({ share });
    await shareLink(target, messages);
    expect(share).toHaveBeenCalledWith({
      title: 'Кобзар',
      url: `${window.location.origin}/book/kobzar`,
    });
    expect(toast).not.toHaveBeenCalled();
  });

  it('says nothing when the share sheet is closed', async () => {
    const clipboard = { writeText: vi.fn() };
    stub({
      share: vi.fn().mockRejectedValue(new DOMException('closed', 'AbortError')),
      clipboard,
    } as never);
    await shareLink(target, messages);
    expect(clipboard.writeText).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('copies the link without a share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stub({ clipboard: { writeText } } as never);
    await shareLink(target, messages);
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/book/kobzar`);
    expect(toast).toHaveBeenCalledWith({ title: 'Link copied' });
  });

  it('copies the link when the share sheet fails for another reason', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stub({
      share: vi.fn().mockRejectedValue(new Error('denied')),
      clipboard: { writeText },
    } as never);
    await shareLink(target, messages);
    expect(writeText).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({ title: 'Link copied' });
  });

  it('says so when the link cannot be copied', async () => {
    stub({ clipboard: { writeText: vi.fn().mockRejectedValue(new Error('no')) } } as never);
    await shareLink(target, messages);
    expect(toast).toHaveBeenCalledWith({ title: 'Could not copy', variant: 'error' });
  });
});
