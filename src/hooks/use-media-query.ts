import { useState, useEffect } from 'react';

/**
 * Custom hook to detect if a given CSS media query matches the current viewport.
 *
 * @param query The CSS media query string, e.g. '(max-width: 768px)'
 * @returns boolean indicating whether the query currently matches
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQueryList = window.matchMedia(query);
    setMatches(mediaQueryList.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    if (mediaQueryList.addEventListener) {
      mediaQueryList.addEventListener('change', handleChange);
    } else {
      // Legacy browser support
      mediaQueryList.addListener(handleChange);
    }

    return () => {
      if (mediaQueryList.removeEventListener) {
        mediaQueryList.removeEventListener('change', handleChange);
      } else {
        mediaQueryList.removeListener(handleChange);
      }
    };
  }, [query]);

  return matches;
}

/**
 * Custom hook to detect if the current device has a mobile viewport (<= 768px).
 *
 * @returns boolean True if viewport width is <= 768px
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 768px)');
}

/**
 * Custom hook to detect if the current device has a desktop viewport (>= 1024px).
 *
 * @returns boolean True if viewport width is >= 1024px
 */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}

/**
 * Custom hook to detect if the current device has a tablet viewport (769px - 1023px).
 *
 * @returns boolean True if viewport width is between 769px and 1023px
 */
export function useIsTablet(): boolean {
  return useMediaQuery('(min-width: 769px) and (max-width: 1023px)');
}
