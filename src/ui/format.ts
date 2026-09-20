// Presentation-only formatting. No rules here: every number arrives already
// computed by src/core.

import { strings } from './strings.en';

export function money(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '-' : '';
  return `${sign}$${Math.abs(rounded).toLocaleString('en-US')}`;
}

export function moneySigned(amount: number): string {
  const rounded = Math.round(amount);
  return `${rounded >= 0 ? '+' : '-'}$${Math.abs(rounded).toLocaleString('en-US')}`;
}

export function percent(ratio: number, digits = 0): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function percentSigned(ratio: number, digits = 1): string {
  const value = ratio * 100;
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

export function duration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return strings.units.seconds(seconds);
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return strings.units.minutesSeconds(minutes, seconds % 60);
  return strings.units.hoursMinutes(Math.floor(minutes / 60), minutes % 60);
}

export function multiplier(value: number): string {
  return `x${value.toFixed(2)}`;
}
