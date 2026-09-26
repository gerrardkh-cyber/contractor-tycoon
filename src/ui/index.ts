// src/ui - DOM + SVG rendering and input.
//
// Contract (CLAUDE.md):
//   - Calls src/core only. Performs NO rule calculation.
//   - All player-facing strings live in strings.en.ts, with strings.ko.ts
//     matching it key for key. Korean exists nowhere else.
//   - All colours and sizes live in theme.ts. No image files.

export { mount } from './app';
export { theme } from './theme';
export { strings } from './strings';
