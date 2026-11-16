'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { isActivePath } from '@/lib/ui/nav';

interface NavLinkProps {
  href: string;
  /** Other sections that count as this link's section. */
  also?: readonly string[];
  className?: string;
  /** Shown before the children when this is not the current section. */
  icon?: ReactNode;
  /** Shown instead of `icon` on the current section. Defaults to `icon`. */
  activeIcon?: ReactNode;
  children?: ReactNode;
}

/**
 * A link that knows whether it points at the current section.
 * Style the active state with `aria-[current=page]:` variants.
 */
export function NavLink({ href, also, className, icon, activeIcon, children }: NavLinkProps) {
  const active = isActivePath(usePathname(), href, also);

  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={className}>
      {active ? (activeIcon ?? icon) : icon}
      {children}
    </Link>
  );
}
