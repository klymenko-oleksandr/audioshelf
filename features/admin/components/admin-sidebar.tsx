import { RiHeadphoneLine, RiLogoutBoxRLine } from '@remixicon/react';
import Link from 'next/link';
import { signOut } from '@/app/(admin)/admin/login/actions';
import { AdminNav } from './admin-nav';

/** Canvas: AdminBooks sidebar. Desktop only; the panel is not built for phones (PRD). */
export function AdminSidebar({ bookCount }: { bookCount: number }) {
  return (
    <aside className="bg-sidebar border-sidebar-border sticky top-0 flex h-dvh flex-col gap-6 border-r px-3 py-5">
      <div className="flex h-8 items-center gap-2.5 px-2">
        <span className="bg-foreground text-background grid size-8 place-items-center rounded-md">
          <RiHeadphoneLine size={18} aria-hidden />
        </span>
        <span className="flex flex-col">
          <span className="font-heading text-base leading-[18px] font-semibold">Audioshelf</span>
          <span className="text-muted-foreground text-[11px]">Admin</span>
        </span>
      </div>

      <AdminNav bookCount={bookCount} />

      <div className="grow" />

      <div className="flex flex-col gap-1">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground flex h-8 items-center gap-2 px-2.5 text-xs"
        >
          <RiHeadphoneLine size={16} aria-hidden />
          Open listening app
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="text-muted-foreground hover:text-foreground flex h-8 w-full cursor-pointer items-center gap-2 px-2.5 text-xs"
          >
            <RiLogoutBoxRLine size={16} aria-hidden />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
