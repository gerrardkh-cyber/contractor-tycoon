// Where each guided step's target lives on the screen.
//
// Kept apart from app.ts so the mapping is one list rather than a switch
// buried in the shell: the guide knows what it wants to point at, this says
// where that is, and `tests/guide-targets.test.ts` checks the two agree.

import { GUIDE_TOAST_SELECTOR } from './overlays';
import type { DrawerId } from './drawers';
import type { TargetName } from './tutorial';

export const TARGET_SELECTOR: Record<TargetName, string> = {
  namedCard: '[data-guide="named-card"]',
  siteProgress: '[data-guide="site-progress"]',
  cash: '[data-guide="cash"]',
  toast: GUIDE_TOAST_SELECTOR,
  rainChoice: '[data-guide="rain-choice"]',
  punchButton: '[data-guide="punch-button"]',
  siteCard: '[data-guide="site-card"]',
  tierButtons: '[data-guide="tier-buttons"]',
  subcontractors: '[data-guide="subcontractors"]',
};

/**
 * Order 008 §5: these targets live inside a drawer, so the guide opens it
 * before it points. Everything else is out on the scene already.
 */
export const TARGET_DRAWER: Partial<Record<TargetName, DrawerId>> = {
  namedCard: 'bid',
  tierButtons: 'bid',
  subcontractors: 'company',
};
