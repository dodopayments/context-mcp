'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const CSS_ID = 'fumadocs-dynamic-css';

export function DocsCss() {
  const pathname = usePathname();
  const href = useRef<string | null>(null);

  useEffect(() => {
    if (pathname.startsWith('/docs')) {
      const el = document.getElementById(CSS_ID) as HTMLLinkElement;
      if (el) return;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.id = CSS_ID;
      if (href.current) {
        link.href = href.current;
      } else {
        const next = document.querySelector<HTMLLinkElement>(
          'link[rel="stylesheet"][href*="fumadocs-ui"]'
        );
        if (next) {
          href.current = next.href;
          next.id = CSS_ID;
          return;
        }
        return;
      }
      document.head.appendChild(link);
    } else {
      document.getElementById(CSS_ID)?.remove();
    }
  }, [pathname]);

  return null;
}
