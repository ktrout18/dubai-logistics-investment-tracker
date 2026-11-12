/**
 * Colours for the briefing categories (the category rule itself lives in
 * shared/briefing.ts: `briefingCategoryOf`). Not project-specific.
 */
import type { BriefingCategory } from '../../shared/index.ts';

export const CATEGORY_COLORS: Record<BriefingCategory, string> = {
  grade_a: '#00606B',
  other_modern: '#5DB7BF',
  other_infrastructure: '#5F6B70',
};
