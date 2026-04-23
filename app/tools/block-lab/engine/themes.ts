export type ThemeName = 'desert' | 'forest' | 'space';

export interface Theme {
  name: ThemeName;
  label: string;
  emoji: string;
  boardBg: string;
  boardBg2: string;
  grid: string;
  wallFill: string;
  wallShade: string;
  wallHighlight: string;
  pathFill: string;
  pathFill2: string;
  goalGlow: string;
  goalFill: string;
  itemFill: string;
  itemAccent: string;
  botPrimary: string;
  botAccent: string;
  particleColor: string;
  textColor: string;
}

export const THEMES: Record<ThemeName, Theme> = {
  desert: {
    name: 'desert', label: 'Desert', emoji: '🏜️',
    boardBg: '#EEDFAE', boardBg2: '#E4D08F',
    grid: 'rgba(160,120,60,0.15)',
    wallFill: '#9B8462', wallShade: '#7A6548', wallHighlight: '#BBA880',
    pathFill: '#EEDFAE', pathFill2: '#E8D89E',
    goalGlow: 'rgba(243,182,63,0.65)', goalFill: '#F3B63F',
    itemFill: '#C49A3C', itemAccent: '#FFD54A',
    botPrimary: '#4C8DFF', botAccent: '#FFD54A',
    particleColor: '#FFD54A',
    textColor: '#5A4020',
  },
  forest: {
    name: 'forest', label: 'Forest', emoji: '🌿',
    boardBg: '#BFE38A', boardBg2: '#9ECD68',
    grid: 'rgba(40,90,30,0.13)',
    wallFill: '#4E6E28', wallShade: '#3A5220', wallHighlight: '#6A9040',
    pathFill: '#BFE38A', pathFill2: '#B4D880',
    goalGlow: 'rgba(78,210,78,0.65)', goalFill: '#4EC84E',
    itemFill: '#996633', itemAccent: '#FF9944',
    botPrimary: '#4C8DFF', botAccent: '#FFD54A',
    particleColor: '#AADD44',
    textColor: '#1E4010',
  },
  space: {
    name: 'space', label: 'Space', emoji: '🚀',
    boardBg: '#18233D', boardBg2: '#0B1020',
    grid: 'rgba(57,208,255,0.18)',
    wallFill: '#3A4866', wallShade: '#1E2A44', wallHighlight: '#5A6888',
    pathFill: '#1A2840', pathFill2: '#141E30',
    goalGlow: 'rgba(57,208,255,0.75)', goalFill: '#39D0FF',
    itemFill: '#8E6BFF', itemAccent: '#39D0FF',
    botPrimary: '#71B7FF', botAccent: '#FFE066',
    particleColor: '#39D0FF',
    textColor: '#C8E8FF',
  },
};

export function themeForLevel(levelIdx: number): ThemeName {
  if (levelIdx < 4) return 'desert';
  if (levelIdx < 8) return 'forest';
  return 'space';
}
