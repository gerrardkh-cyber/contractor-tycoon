// src/ui - DOM + Canvas rendering and input.
//
// Contract (CLAUDE.md):
//   - Calls src/core only. Performs NO rule calculation.
//   - All player-facing strings live in strings.en.ts, all colours and sizes
//     in theme.ts. No image files.

export { mount } from './app';
export { theme } from './theme';
export { strings } from './strings';
