// Vertical-dimension constants for furniture and cabinetry. Pulled out of
// Furniture3D.tsx so that 2D consumers (Specs cross-section diagram,
// Elevations view) can reuse the same numbers without dragging three.js
// into their bundle.

import type { FurnitureKind } from './types';

// Standing height of each catalog piece, inches from floor to top.
// Informational for the 3D models (each mesh bakes its own geometry) but
// authoritative for any 2D elevation/section renderer.
export const FURNITURE_HEIGHTS: Record<FurnitureKind, number> = {
  'bed-twin': 26, 'bed-full': 26, 'bed-queen': 26, 'bed-king': 26, 'crib': 38,
  'nightstand': 24, 'dresser': 32, 'wardrobe': 72,
  'toilet': 30, 'sink-vanity': 34, 'sink-pedestal': 34, 'bathtub': 22, 'shower-stall': 80,
  'cabinet-base': 36, 'cabinet-upper': 30,
  'fridge': 70, 'stove-range': 36, 'sink-kitchen': 36, 'dishwasher': 34, 'island': 36,
  'sofa-3': 34, 'loveseat': 34, 'armchair': 36, 'coffee-table': 17, 'end-table': 24,
  'tv-console': 24, 'bookshelf': 72,
  'dining-table-4': 30, 'dining-table-6': 30, 'dining-table-8': 30,
  'dining-chair': 34, 'buffet': 36,
  'desk': 30, 'office-chair': 38, 'filing-cabinet': 52,
};

// Upper cabinets float ABOVE the floor — top of a typical 36" base cabinet
// plus an 18" backsplash gap before the uppers start.
export const CABINET_UPPER_FLOOR_OFFSET = 54;
