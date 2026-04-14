export type ThemeMode = 'dark' | 'light'

export interface AppTheme {
  id: string
  label: string
  mode: ThemeMode
  description?: string
  canvas: {
    background: string
    backgroundEffect?: string
    gridSmall: string
    gridLarge: string
    gridGlowSmall: string
    gridGlowLarge: string
  }
  surface: {
    app: string
    sidebarOverlay: string
    sidebar: string
    panel: string
    panelMuted: string
    panelElevated: string
    titlebar: string
    input: string
    hover: string
    selection: string
    selectionBorder: string
    accentSoft: string
  }
  border: {
    subtle: string
    default: string
    strong: string
    accent: string
  }
  text: {
    primary: string
    secondary: string
    muted: string
    disabled: string
    inverse: string
  }
  accent: {
    base: string
    hover: string
    soft: string
  }
  status: {
    success: string
    warning: string
    danger: string
  }
  chat: {
    background: string
    placeholder: string
    input: string
    inputBorder: string
    text: string
    textSecondary: string
    muted: string
    subtle: string
    divider: string
    assistantBubble: string
    assistantBubbleBorder: string
    userBubble: string
    userBubbleBorder: string
    dropdownBackground: string
    dropdownBorder: string
    dropdownActiveBackground: string
    dropdownHoverBackground: string
  }
  terminal: {
    background: string
    foreground: string
    cursor: string
    cursorAccent: string
    selection: string
    black: string
    red: string
    green: string
    yellow: string
    blue: string
    magenta: string
    cyan: string
    white: string
    brightBlack: string
    brightRed: string
    brightGreen: string
    brightYellow: string
    brightBlue: string
    brightMagenta: string
    brightCyan: string
    brightWhite: string
  }
  editor: {
    monacoBase: 'vs-dark' | 'vs'
    background: string
  }
  extension: {
    background: string
    panel: string
    border: string
    text: string
    muted: string
    accent: string
  }
  shadow: {
    panel: string
    modal: string
  }
}

const THEMES: Record<string, AppTheme> = {
  'default-dark': {
    id: 'default-dark',
    label: 'Default Dark',
    mode: 'dark',
    description: 'Matches the darker Settings + Chat baseline.',
    canvas: {
      background: '#15171a',
      backgroundEffect: '',
      gridSmall: '#2a2e35',
      gridLarge: '#3a3f48',
      gridGlowSmall: 'rgba(255,255,255,0.58)',
      gridGlowLarge: 'rgba(255,255,255,0.72)',
    },
    surface: {
      app: '#101114',
      sidebarOverlay: 'rgba(14,15,18,0.88)',
      sidebar: '#101216',
      panel: '#111317',
      panelMuted: '#171a1f',
      panelElevated: '#1a1d23',
      titlebar: '#1b1e24',
      input: '#15181d',
      hover: 'rgba(255,255,255,0.05)',
      selection: 'rgba(122,162,255,0.12)',
      selectionBorder: 'rgba(122,162,255,0.24)',
      accentSoft: 'rgba(122,162,255,0.16)',
    },
    border: {
      subtle: 'rgba(255,255,255,0.05)',
      default: 'rgba(255,255,255,0.08)',
      strong: 'rgba(255,255,255,0.14)',
      accent: 'rgba(122,162,255,0.35)',
    },
    text: {
      primary: '#e7eaf0',
      secondary: '#c3cad6',
      muted: '#88909c',
      disabled: '#5b626e',
      inverse: '#0f1012',
    },
    accent: {
      base: '#7aa2ff',
      hover: '#94b6ff',
      soft: 'rgba(122,162,255,0.16)',
    },
    status: {
      success: '#56c288',
      warning: '#ffbf5f',
      danger: '#ff7b72',
    },
    chat: {
      background: '#0d0f12',
      placeholder: '#626a77',
      input: '#232327',
      inputBorder: '#383840',
      text: '#e7eaf0',
      textSecondary: '#c3cad6',
      muted: '#88909c',
      subtle: '#5b626e',
      divider: 'rgba(255,255,255,0.08)',
      assistantBubble: '#171a1f',
      assistantBubbleBorder: 'rgba(255,255,255,0.07)',
      userBubble: '#1a3551',
      userBubbleBorder: '#2b557f',
      dropdownBackground: '#17171b',
      dropdownBorder: '#2f2f37',
      dropdownActiveBackground: '#26262c',
      dropdownHoverBackground: '#202026',
    },
    terminal: {
      background: '#0d0f12',
      foreground: '#d8dde6',
      cursor: '#d4d9e2',
      cursorAccent: '#0d0f12',
      selection: 'rgba(122,162,255,0.25)',
      black: '#0d0f12',
      red: '#ff7b72',
      green: '#56c288',
      yellow: '#d8b66a',
      blue: '#7aa2ff',
      magenta: '#c792ea',
      cyan: '#64d2ff',
      white: '#d8dde6',
      brightBlack: '#6e7682',
      brightRed: '#ff9b95',
      brightGreen: '#79d8a0',
      brightYellow: '#e5c47f',
      brightBlue: '#9cbcff',
      brightMagenta: '#d8abff',
      brightCyan: '#8adfff',
      brightWhite: '#ffffff',
    },
    editor: {
      monacoBase: 'vs-dark',
      background: '#111317',
    },
    extension: {
      background: '#111317',
      panel: '#1b1e24',
      border: 'rgba(255,255,255,0.08)',
      text: '#e7eaf0',
      muted: '#88909c',
      accent: '#7aa2ff',
    },
    shadow: {
      panel: '0 10px 36px rgba(0,0,0,0.42)',
      modal: '0 32px 80px rgba(0,0,0,0.62)',
    },
  },
  'graphite-dark': {
    id: 'graphite-dark',
    label: 'Graphite Dark',
    mode: 'dark',
    description: 'Neutral greys with slightly softer contrast.',
    canvas: {
      background: '#171717',
      backgroundEffect: '',
      gridSmall: '#2d2d2d',
      gridLarge: '#3f3f3f',
      gridGlowSmall: 'rgba(255,255,255,0.52)',
      gridGlowLarge: 'rgba(255,255,255,0.64)',
    },
    surface: {
      app: '#121212',
      sidebarOverlay: 'rgba(18,18,18,0.9)',
      sidebar: '#141414',
      panel: '#151515',
      panelMuted: '#1c1c1c',
      panelElevated: '#202020',
      titlebar: '#222222',
      input: '#1a1a1a',
      hover: 'rgba(255,255,255,0.045)',
      selection: 'rgba(143,151,165,0.13)',
      selectionBorder: 'rgba(143,151,165,0.24)',
      accentSoft: 'rgba(143,151,165,0.18)',
    },
    border: {
      subtle: 'rgba(255,255,255,0.05)',
      default: 'rgba(255,255,255,0.08)',
      strong: 'rgba(255,255,255,0.13)',
      accent: 'rgba(143,151,165,0.28)',
    },
    text: {
      primary: '#ededed',
      secondary: '#d5d5d5',
      muted: '#9a9a9a',
      disabled: '#686868',
      inverse: '#121212',
    },
    accent: {
      base: '#8f96a0',
      hover: '#bcc3cc',
      soft: 'rgba(143,151,165,0.18)',
    },
    status: {
      success: '#73c991',
      warning: '#f0d28a',
      danger: '#ff9080',
    },
    chat: {
      background: '#111111',
      placeholder: '#6f6f6f',
      input: '#171717',
      inputBorder: 'rgba(255,255,255,0.08)',
      text: '#ededed',
      textSecondary: '#d5d5d5',
      muted: '#9a9a9a',
      subtle: '#686868',
      divider: 'rgba(255,255,255,0.08)',
      assistantBubble: '#1a1a1a',
      assistantBubbleBorder: 'rgba(255,255,255,0.06)',
      userBubble: '#252a30',
      userBubbleBorder: '#353c44',
      dropdownBackground: '#151515',
      dropdownBorder: 'rgba(255,255,255,0.08)',
      dropdownActiveBackground: '#202020',
      dropdownHoverBackground: 'rgba(255,255,255,0.045)',
    },
    terminal: {
      background: '#101010',
      foreground: '#dfdfdf',
      cursor: '#f0f0f0',
      cursorAccent: '#101010',
      selection: 'rgba(143,151,165,0.22)',
      black: '#101010',
      red: '#ff9080',
      green: '#73c991',
      yellow: '#f0d28a',
      blue: '#9bb4d1',
      magenta: '#d1a0ff',
      cyan: '#8ad8f2',
      white: '#dfdfdf',
      brightBlack: '#7d7d7d',
      brightRed: '#ffaea2',
      brightGreen: '#8fdb9a',
      brightYellow: '#f7df9f',
      brightBlue: '#b7d9ff',
      brightMagenta: '#e1b6ff',
      brightCyan: '#a8e6f9',
      brightWhite: '#ffffff',
    },
    editor: {
      monacoBase: 'vs-dark',
      background: '#151515',
    },
    extension: {
      background: '#151515',
      panel: '#202020',
      border: 'rgba(255,255,255,0.08)',
      text: '#ededed',
      muted: '#9a9a9a',
      accent: '#8f96a0',
    },
    shadow: {
      panel: '0 10px 32px rgba(0,0,0,0.42)',
      modal: '0 28px 72px rgba(0,0,0,0.6)',
    },
  },
  'onecode-midnight': {
    id: 'onecode-midnight',
    label: '1Code Midnight',
    mode: 'dark',
    description: 'An imported-style dark preset with cooler indigo chrome.',
    canvas: {
      background: '#12131a',
      backgroundEffect: '',
      gridSmall: '#272a39',
      gridLarge: '#383d52',
      gridGlowSmall: 'rgba(199,207,255,0.56)',
      gridGlowLarge: 'rgba(199,207,255,0.72)',
    },
    surface: {
      app: '#0f1118',
      sidebarOverlay: 'rgba(13,14,21,0.9)',
      sidebar: '#10131c',
      panel: '#111521',
      panelMuted: '#181d2b',
      panelElevated: '#1d2332',
      titlebar: '#202638',
      input: '#151a27',
      hover: 'rgba(199,207,255,0.06)',
      selection: 'rgba(131,139,255,0.16)',
      selectionBorder: 'rgba(131,139,255,0.3)',
      accentSoft: 'rgba(131,139,255,0.18)',
    },
    border: {
      subtle: 'rgba(199,207,255,0.06)',
      default: 'rgba(199,207,255,0.1)',
      strong: 'rgba(199,207,255,0.16)',
      accent: 'rgba(131,139,255,0.34)',
    },
    text: {
      primary: '#edf1ff',
      secondary: '#d4daef',
      muted: '#8a93b3',
      disabled: '#5f6680',
      inverse: '#0f1118',
    },
    accent: {
      base: '#838bff',
      hover: '#a4abff',
      soft: 'rgba(131,139,255,0.18)',
    },
    status: {
      success: '#66d9a3',
      warning: '#f5c97a',
      danger: '#ff8a8a',
    },
    chat: {
      background: '#0d1017',
      placeholder: '#6e7899',
      input: '#131824',
      inputBorder: 'rgba(199,207,255,0.1)',
      text: '#edf1ff',
      textSecondary: '#d4daef',
      muted: '#8a93b3',
      subtle: '#5f6680',
      divider: 'rgba(199,207,255,0.1)',
      assistantBubble: '#171c28',
      assistantBubbleBorder: 'rgba(199,207,255,0.08)',
      userBubble: '#25245a',
      userBubbleBorder: '#3c4191',
      dropdownBackground: '#111521',
      dropdownBorder: 'rgba(199,207,255,0.1)',
      dropdownActiveBackground: '#1d2332',
      dropdownHoverBackground: 'rgba(199,207,255,0.06)',
    },
    terminal: {
      background: '#0d111b',
      foreground: '#dce3ff',
      cursor: '#c9d0ff',
      cursorAccent: '#0d111b',
      selection: 'rgba(131,139,255,0.24)',
      black: '#0d111b',
      red: '#ff8a8a',
      green: '#66d9a3',
      yellow: '#f5c97a',
      blue: '#8ba4ff',
      magenta: '#d8a8ff',
      cyan: '#7adcf0',
      white: '#dce3ff',
      brightBlack: '#6e7899',
      brightRed: '#ffaaa5',
      brightGreen: '#86e9ba',
      brightYellow: '#ffd694',
      brightBlue: '#a7bbff',
      brightMagenta: '#e6c0ff',
      brightCyan: '#9ae8ff',
      brightWhite: '#ffffff',
    },
    editor: {
      monacoBase: 'vs-dark',
      background: '#111521',
    },
    extension: {
      background: '#111521',
      panel: '#202638',
      border: 'rgba(199,207,255,0.1)',
      text: '#edf1ff',
      muted: '#8a93b3',
      accent: '#838bff',
    },
    shadow: {
      panel: '0 10px 36px rgba(4,6,12,0.48)',
      modal: '0 30px 80px rgba(4,6,12,0.68)',
    },
  },
  'runext-shell': {
    id: 'runext-shell',
    label: 'Runext Shell',
    mode: 'dark',
    description: 'Matches the runext app chrome with the warm amber accent, glass panels, and vignette backdrop.',
    canvas: {
      background: '#111111',
      backgroundEffect:
        'radial-gradient(circle at top right, rgba(184, 119, 79, 0.16), transparent 28%), radial-gradient(circle at top left, rgba(255, 255, 255, 0.05), transparent 22%), linear-gradient(180deg, #131313 0%, #0f0f0f 100%)',
      gridSmall: 'rgba(243,241,234,0.06)',
      gridLarge: 'rgba(184,119,79,0.12)',
      gridGlowSmall: 'rgba(243,241,234,0.3)',
      gridGlowLarge: 'rgba(184,119,79,0.28)',
    },
    surface: {
      app: 'radial-gradient(circle at top right, rgba(184, 119, 79, 0.16), transparent 28%), radial-gradient(circle at top left, rgba(255, 255, 255, 0.05), transparent 22%), linear-gradient(180deg, #131313 0%, #0f0f0f 100%)',
      sidebarOverlay: 'rgba(25,25,25,0.92)',
      sidebar: '#1d1d1d',
      panel: '#1d1d1d',
      panelMuted: '#232323',
      panelElevated: '#2b2b2b',
      titlebar: 'rgba(24,24,24,0.88)',
      input: '#1f1f1f',
      hover: 'rgba(255,255,255,0.06)',
      selection: 'rgba(184,119,79,0.18)',
      selectionBorder: 'rgba(209,145,101,0.28)',
      accentSoft: 'rgba(184,119,79,0.18)',
    },
    border: {
      subtle: 'rgba(255,255,255,0.05)',
      default: 'rgba(255,255,255,0.08)',
      strong: 'rgba(255,255,255,0.14)',
      accent: 'rgba(209,145,101,0.4)',
    },
    text: {
      primary: '#f3f1ea',
      secondary: 'rgba(243,241,234,0.68)',
      muted: 'rgba(243,241,234,0.42)',
      disabled: 'rgba(243,241,234,0.3)',
      inverse: '#17120f',
    },
    accent: {
      base: '#b8774f',
      hover: '#d19165',
      soft: 'rgba(184,119,79,0.18)',
    },
    status: {
      success: '#8fcf9a',
      warning: '#d19165',
      danger: '#df7a72',
    },
    chat: {
      background: '#141414',
      placeholder: '#7f7970',
      input: '#1f1f1f',
      inputBorder: '#343434',
      text: '#f3f1ea',
      textSecondary: '#b4aea5',
      muted: '#7f7970',
      subtle: 'rgba(243,241,234,0.42)',
      divider: '#353535',
      assistantBubble: '#1d1d1d',
      assistantBubbleBorder: '#353535',
      userBubble: 'rgba(184,119,79,0.18)',
      userBubbleBorder: 'rgba(209,145,101,0.4)',
      dropdownBackground: 'rgba(25,25,25,0.92)',
      dropdownBorder: '#353535',
      dropdownActiveBackground: '#2b2b2b',
      dropdownHoverBackground: '#222222',
    },
    terminal: {
      background: '#141414',
      foreground: '#f3f1ea',
      cursor: '#f3f1ea',
      cursorAccent: '#141414',
      selection: 'rgba(184,119,79,0.18)',
      black: '#111111',
      red: '#df7a72',
      green: '#8fcf9a',
      yellow: '#d8b06b',
      blue: '#8fb6d8',
      magenta: '#c79ad9',
      cyan: '#87cfc8',
      white: '#f3f1ea',
      brightBlack: '#7f7970',
      brightRed: '#e79a93',
      brightGreen: '#a9d9b1',
      brightYellow: '#e5c490',
      brightBlue: '#abcbe6',
      brightMagenta: '#d7b3e4',
      brightCyan: '#a6ddd7',
      brightWhite: '#ffffff',
    },
    editor: {
      monacoBase: 'vs-dark',
      background: '#141414',
    },
    extension: {
      background: '#141414',
      panel: '#1d1d1d',
      border: '#353535',
      text: '#f3f1ea',
      muted: '#b4aea5',
      accent: '#b8774f',
    },
    shadow: {
      panel: '0 24px 80px rgba(0,0,0,0.45)',
      modal: '0 28px 96px rgba(0,0,0,0.5)',
    },
  },
  'paper-light': {
    id: 'paper-light',
    label: 'Paper Light',
    mode: 'light',
    description: 'A bright workspace with subtle chrome and cooler borders.',
    canvas: {
      background: '#f3f5f8',
      backgroundEffect: '',
      gridSmall: '#d8dde6',
      gridLarge: '#c5ccd8',
      gridGlowSmall: 'rgba(40,49,66,0.18)',
      gridGlowLarge: 'rgba(40,49,66,0.24)',
    },
    surface: {
      app: '#eef2f7',
      sidebarOverlay: 'rgba(250,252,255,0.92)',
      sidebar: '#fbfcfe',
      panel: '#ffffff',
      panelMuted: '#f5f7fb',
      panelElevated: '#eef2f7',
      titlebar: '#f3f6fb',
      input: '#ffffff',
      hover: 'rgba(31,41,55,0.05)',
      selection: 'rgba(53,104,255,0.1)',
      selectionBorder: 'rgba(53,104,255,0.22)',
      accentSoft: 'rgba(53,104,255,0.12)',
    },
    border: {
      subtle: 'rgba(15,23,42,0.06)',
      default: 'rgba(15,23,42,0.12)',
      strong: 'rgba(15,23,42,0.18)',
      accent: 'rgba(53,104,255,0.3)',
    },
    text: {
      primary: '#1b2430',
      secondary: '#2d3748',
      muted: '#586676',
      disabled: '#7a8594',
      inverse: '#ffffff',
    },
    accent: {
      base: '#3568ff',
      hover: '#4b79ff',
      soft: 'rgba(53,104,255,0.12)',
    },
    status: {
      success: '#1f8f5f',
      warning: '#c07b12',
      danger: '#d14a4a',
    },
    chat: {
      background: '#ffffff',
      placeholder: '#778395',
      input: '#ffffff',
      inputBorder: 'rgba(15,23,42,0.12)',
      text: '#1b2430',
      textSecondary: '#2d3748',
      muted: '#6f7a8a',
      subtle: '#9aa3b2',
      divider: 'rgba(15,23,42,0.12)',
      assistantBubble: '#f4f6fa',
      assistantBubbleBorder: 'rgba(15,23,42,0.08)',
      userBubble: '#e8f0ff',
      userBubbleBorder: '#bfd0ff',
      dropdownBackground: '#ffffff',
      dropdownBorder: 'rgba(15,23,42,0.12)',
      dropdownActiveBackground: '#eef2f7',
      dropdownHoverBackground: 'rgba(31,41,55,0.05)',
    },
    terminal: {
      background: '#f9fafb',
      foreground: '#1f232a',
      cursor: '#1f232a',
      cursorAccent: '#f9fafb',
      selection: 'rgba(53,104,255,0.18)',
      black: '#1f232a',
      red: '#cf222e',
      green: '#1f883d',
      yellow: '#9a6700',
      blue: '#0969da',
      magenta: '#8250df',
      cyan: '#1b7c83',
      white: '#57606a',
      brightBlack: '#6e7781',
      brightRed: '#e85c63',
      brightGreen: '#2da56b',
      brightYellow: '#b8841b',
      brightBlue: '#3a82f7',
      brightMagenta: '#9c6bff',
      brightCyan: '#2a9aa4',
      brightWhite: '#24292f',
    },
    editor: {
      monacoBase: 'vs',
      background: '#ffffff',
    },
    extension: {
      background: '#ffffff',
      panel: '#f3f6fb',
      border: 'rgba(15,23,42,0.12)',
      text: '#1b2430',
      muted: '#6f7a8a',
      accent: '#3568ff',
    },
    shadow: {
      panel: '0 10px 26px rgba(15,23,42,0.12)',
      modal: '0 28px 64px rgba(15,23,42,0.16)',
    },
  },
  'morph-dark': {
    id: 'morph-dark',
    label: 'Morph',
    mode: 'dark',
    description: 'Deep charcoal with olive-green accents — inspired by morph.so.',
    canvas: {
      background: '#18181c',
      backgroundEffect: '',
      gridSmall: '#26262c',
      gridLarge: '#32323a',
      gridGlowSmall: 'rgba(200,214,78,0.22)',
      gridGlowLarge: 'rgba(200,214,78,0.32)',
    },
    surface: {
      app: '#131316',
      sidebarOverlay: 'rgba(19,19,22,0.92)',
      sidebar: '#151518',
      panel: '#1a1a1e',
      panelMuted: '#1f1f24',
      panelElevated: '#24242a',
      titlebar: '#1e1e23',
      input: '#18181c',
      hover: 'rgba(200,214,78,0.06)',
      selection: 'rgba(200,214,78,0.10)',
      selectionBorder: 'rgba(200,214,78,0.22)',
      accentSoft: 'rgba(200,214,78,0.12)',
    },
    border: {
      subtle: 'rgba(200,214,78,0.06)',
      default: 'rgba(200,214,78,0.10)',
      strong: 'rgba(200,214,78,0.18)',
      accent: 'rgba(200,214,78,0.30)',
    },
    text: {
      primary: '#e8e6e0',
      secondary: '#d4d0c8',
      muted: '#aaa69c',
      disabled: '#6a6760',
      inverse: '#131316',
    },
    accent: {
      base: '#c8d64e',
      hover: '#d8e65e',
      soft: 'rgba(200,214,78,0.12)',
    },
    status: {
      success: '#a0c850',
      warning: '#e8a838',
      danger: '#f06868',
    },
    chat: {
      background: '#151518',
      placeholder: '#6a675e',
      input: '#1e1e23',
      inputBorder: 'rgba(200,214,78,0.12)',
      text: '#e8e6e0',
      textSecondary: '#c4c0b6',
      muted: '#8a877e',
      subtle: '#5e5c56',
      divider: 'rgba(200,214,78,0.08)',
      assistantBubble: '#1f1f24',
      assistantBubbleBorder: 'rgba(200,214,78,0.08)',
      userBubble: '#2a2a1e',
      userBubbleBorder: 'rgba(200,214,78,0.18)',
      dropdownBackground: '#1a1a1e',
      dropdownBorder: 'rgba(200,214,78,0.10)',
      dropdownActiveBackground: '#24242a',
      dropdownHoverBackground: 'rgba(200,214,78,0.06)',
    },
    terminal: {
      background: '#141417',
      foreground: '#dddbd4',
      cursor: '#c8d64e',
      cursorAccent: '#141417',
      selection: 'rgba(200,214,78,0.18)',
      black: '#141417',
      red: '#f06868',
      green: '#a0c850',
      yellow: '#e8a838',
      blue: '#6898d0',
      magenta: '#c080d8',
      cyan: '#58b8b0',
      white: '#dddbd4',
      brightBlack: '#6a675e',
      brightRed: '#f88888',
      brightGreen: '#b8e060',
      brightYellow: '#f0c048',
      brightBlue: '#88b8e8',
      brightMagenta: '#d8a0f0',
      brightCyan: '#78d8d0',
      brightWhite: '#f0eee8',
    },
    editor: {
      monacoBase: 'vs-dark',
      background: '#1a1a1e',
    },
    extension: {
      background: '#1a1a1e',
      panel: '#24242a',
      border: 'rgba(200,214,78,0.10)',
      text: '#e8e6e0',
      muted: '#8a877e',
      accent: '#c8d64e',
    },
    shadow: {
      panel: '0 10px 36px rgba(0,0,0,0.48)',
      modal: '0 32px 80px rgba(0,0,0,0.6)',
    },
  },
  'warm-light': {
    id: 'warm-light',
    label: 'Warm Light',
    mode: 'light',
    description: 'Soft cream tones with warm amber accents — easy on the eyes.',
    canvas: {
      background: '#f5f0ea',
      backgroundEffect: '',
      gridSmall: '#e2dbd2',
      gridLarge: '#d0c8bd',
      gridGlowSmall: 'rgba(162,100,28,0.14)',
      gridGlowLarge: 'rgba(162,100,28,0.20)',
    },
    surface: {
      app: '#f0ebe4',
      sidebarOverlay: 'rgba(245,240,234,0.94)',
      sidebar: '#faf7f2',
      panel: '#fffdf8',
      panelMuted: '#f5f0ea',
      panelElevated: '#eee8e0',
      titlebar: '#f5f0ea',
      input: '#fffdf8',
      hover: 'rgba(120,80,20,0.05)',
      selection: 'rgba(186,120,40,0.10)',
      selectionBorder: 'rgba(186,120,40,0.22)',
      accentSoft: 'rgba(186,120,40,0.10)',
    },
    border: {
      subtle: 'rgba(120,80,20,0.06)',
      default: 'rgba(120,80,20,0.12)',
      strong: 'rgba(120,80,20,0.20)',
      accent: 'rgba(186,120,40,0.30)',
    },
    text: {
      primary: '#2c2418',
      secondary: '#4a3e30',
      muted: '#7a6e5e',
      disabled: '#9a8e7e',
      inverse: '#fffdf8',
    },
    accent: {
      base: '#ba7828',
      hover: '#d08830',
      soft: 'rgba(186,120,40,0.10)',
    },
    status: {
      success: '#3d8c50',
      warning: '#c07b12',
      danger: '#c44040',
    },
    chat: {
      background: '#fffdf8',
      placeholder: '#9a8e7e',
      input: '#fffdf8',
      inputBorder: 'rgba(120,80,20,0.12)',
      text: '#2c2418',
      textSecondary: '#4a3e30',
      muted: '#7a6e5e',
      subtle: '#9a8e7e',
      divider: 'rgba(120,80,20,0.10)',
      assistantBubble: '#f5f0ea',
      assistantBubbleBorder: 'rgba(120,80,20,0.08)',
      userBubble: '#f0e4d0',
      userBubbleBorder: '#dcc8a8',
      dropdownBackground: '#fffdf8',
      dropdownBorder: 'rgba(120,80,20,0.12)',
      dropdownActiveBackground: '#eee8e0',
      dropdownHoverBackground: 'rgba(120,80,20,0.05)',
    },
    terminal: {
      background: '#faf6f0',
      foreground: '#2c2418',
      cursor: '#2c2418',
      cursorAccent: '#faf6f0',
      selection: 'rgba(186,120,40,0.18)',
      black: '#2c2418',
      red: '#c44040',
      green: '#3d8c50',
      yellow: '#a06800',
      blue: '#3568c0',
      magenta: '#8848a0',
      cyan: '#287878',
      white: '#7a6e5e',
      brightBlack: '#9a8e7e',
      brightRed: '#d85050',
      brightGreen: '#4ca860',
      brightYellow: '#b88018',
      brightBlue: '#4878d0',
      brightMagenta: '#a060b8',
      brightCyan: '#389090',
      brightWhite: '#2c2418',
    },
    editor: {
      monacoBase: 'vs',
      background: '#fffdf8',
    },
    extension: {
      background: '#fffdf8',
      panel: '#f5f0ea',
      border: 'rgba(120,80,20,0.12)',
      text: '#2c2418',
      muted: '#7a6e5e',
      accent: '#ba7828',
    },
    shadow: {
      panel: '0 8px 24px rgba(80,50,10,0.08)',
      modal: '0 24px 56px rgba(80,50,10,0.12)',
    },
  },
  'linear-light': {
    id: 'linear-light',
    label: 'Linear Light',
    mode: 'light',
    description: 'Cool blue-grey workspace inspired by modern productivity tools.',
    canvas: {
      background: '#f2f4f8',
      backgroundEffect: '',
      gridSmall: '#d8dce6',
      gridLarge: '#c4cad8',
      gridGlowSmall: 'rgba(80,100,200,0.14)',
      gridGlowLarge: 'rgba(80,100,200,0.20)',
    },
    surface: {
      app: '#edf0f6',
      sidebarOverlay: 'rgba(242,244,248,0.94)',
      sidebar: '#f8f9fc',
      panel: '#ffffff',
      panelMuted: '#f2f4f8',
      panelElevated: '#eaecf2',
      titlebar: '#f2f4f8',
      input: '#ffffff',
      hover: 'rgba(60,80,160,0.04)',
      selection: 'rgba(80,100,200,0.08)',
      selectionBorder: 'rgba(80,100,200,0.20)',
      accentSoft: 'rgba(80,100,200,0.08)',
    },
    border: {
      subtle: 'rgba(20,30,60,0.05)',
      default: 'rgba(20,30,60,0.10)',
      strong: 'rgba(20,30,60,0.16)',
      accent: 'rgba(80,100,200,0.28)',
    },
    text: {
      primary: '#1a1e2e',
      secondary: '#363c50',
      muted: '#6a7088',
      disabled: '#8a90a4',
      inverse: '#ffffff',
    },
    accent: {
      base: '#5064c8',
      hover: '#6478e0',
      soft: 'rgba(80,100,200,0.08)',
    },
    status: {
      success: '#28845c',
      warning: '#c07b12',
      danger: '#d04848',
    },
    chat: {
      background: '#ffffff',
      placeholder: '#8a90a4',
      input: '#ffffff',
      inputBorder: 'rgba(20,30,60,0.10)',
      text: '#1a1e2e',
      textSecondary: '#363c50',
      muted: '#6a7088',
      subtle: '#8a90a4',
      divider: 'rgba(20,30,60,0.08)',
      assistantBubble: '#f2f4f8',
      assistantBubbleBorder: 'rgba(20,30,60,0.06)',
      userBubble: '#e8ecff',
      userBubbleBorder: '#c0c8f0',
      dropdownBackground: '#ffffff',
      dropdownBorder: 'rgba(20,30,60,0.10)',
      dropdownActiveBackground: '#eaecf2',
      dropdownHoverBackground: 'rgba(60,80,160,0.04)',
    },
    terminal: {
      background: '#f8f9fc',
      foreground: '#1a1e2e',
      cursor: '#1a1e2e',
      cursorAccent: '#f8f9fc',
      selection: 'rgba(80,100,200,0.16)',
      black: '#1a1e2e',
      red: '#d04848',
      green: '#28845c',
      yellow: '#9a6800',
      blue: '#3058c0',
      magenta: '#7c40b0',
      cyan: '#1a7888',
      white: '#6a7088',
      brightBlack: '#8a90a4',
      brightRed: '#e06060',
      brightGreen: '#38a070',
      brightYellow: '#b88018',
      brightBlue: '#4070d8',
      brightMagenta: '#9458c8',
      brightCyan: '#2a90a0',
      brightWhite: '#1a1e2e',
    },
    editor: {
      monacoBase: 'vs',
      background: '#ffffff',
    },
    extension: {
      background: '#ffffff',
      panel: '#f2f4f8',
      border: 'rgba(20,30,60,0.10)',
      text: '#1a1e2e',
      muted: '#6a7088',
      accent: '#5064c8',
    },
    shadow: {
      panel: '0 8px 24px rgba(20,30,60,0.08)',
      modal: '0 24px 56px rgba(20,30,60,0.12)',
    },
  },
  'garden-light': {
    id: 'garden-light',
    label: 'Garden',
    mode: 'light',
    description: 'Natural green tones for a calm, focused workspace.',
    canvas: {
      background: '#f0f4f0',
      backgroundEffect: '',
      gridSmall: '#d4dcd4',
      gridLarge: '#bec8be',
      gridGlowSmall: 'rgba(48,96,56,0.14)',
      gridGlowLarge: 'rgba(48,96,56,0.20)',
    },
    surface: {
      app: '#eaf0ea',
      sidebarOverlay: 'rgba(240,244,240,0.94)',
      sidebar: '#f6faf6',
      panel: '#fcfefc',
      panelMuted: '#f0f4f0',
      panelElevated: '#e6ece6',
      titlebar: '#f0f4f0',
      input: '#fcfefc',
      hover: 'rgba(40,80,48,0.04)',
      selection: 'rgba(48,96,56,0.08)',
      selectionBorder: 'rgba(48,96,56,0.20)',
      accentSoft: 'rgba(48,96,56,0.08)',
    },
    border: {
      subtle: 'rgba(20,50,20,0.05)',
      default: 'rgba(20,50,20,0.10)',
      strong: 'rgba(20,50,20,0.16)',
      accent: 'rgba(48,96,56,0.28)',
    },
    text: {
      primary: '#1a2e1c',
      secondary: '#2e4430',
      muted: '#5a7060',
      disabled: '#7e9480',
      inverse: '#fcfefc',
    },
    accent: {
      base: '#306038',
      hover: '#408048',
      soft: 'rgba(48,96,56,0.08)',
    },
    status: {
      success: '#2a7840',
      warning: '#b87818',
      danger: '#c84040',
    },
    chat: {
      background: '#fcfefc',
      placeholder: '#7e9480',
      input: '#fcfefc',
      inputBorder: 'rgba(20,50,20,0.10)',
      text: '#1a2e1c',
      textSecondary: '#2e4430',
      muted: '#5a7060',
      subtle: '#7e9480',
      divider: 'rgba(20,50,20,0.08)',
      assistantBubble: '#f0f4f0',
      assistantBubbleBorder: 'rgba(20,50,20,0.06)',
      userBubble: '#e0f0e4',
      userBubbleBorder: '#b8d4bc',
      dropdownBackground: '#fcfefc',
      dropdownBorder: 'rgba(20,50,20,0.10)',
      dropdownActiveBackground: '#e6ece6',
      dropdownHoverBackground: 'rgba(40,80,48,0.04)',
    },
    terminal: {
      background: '#f6faf6',
      foreground: '#1a2e1c',
      cursor: '#1a2e1c',
      cursorAccent: '#f6faf6',
      selection: 'rgba(48,96,56,0.16)',
      black: '#1a2e1c',
      red: '#c84040',
      green: '#2a7840',
      yellow: '#907000',
      blue: '#2860b0',
      magenta: '#7040a0',
      cyan: '#187068',
      white: '#5a7060',
      brightBlack: '#7e9480',
      brightRed: '#d85858',
      brightGreen: '#389050',
      brightYellow: '#a88818',
      brightBlue: '#3878c8',
      brightMagenta: '#8858b8',
      brightCyan: '#289080',
      brightWhite: '#1a2e1c',
    },
    editor: {
      monacoBase: 'vs',
      background: '#fcfefc',
    },
    extension: {
      background: '#fcfefc',
      panel: '#f0f4f0',
      border: 'rgba(20,50,20,0.10)',
      text: '#1a2e1c',
      muted: '#5a7060',
      accent: '#306038',
    },
    shadow: {
      panel: '0 8px 24px rgba(20,40,20,0.08)',
      modal: '0 24px 56px rgba(20,40,20,0.10)',
    },
  },
}

export type AppearanceMode = 'dark' | 'light' | 'system'

/** Which theme id to apply given appearance mode, saved dark preset, and OS dark preference. */
export function resolveEffectiveThemeId(
  appearance: AppearanceMode | undefined,
  themeId: string,
  systemPrefersDark: boolean,
): string {
  const a = appearance ?? 'dark'
  const theme = THEMES[themeId]
  if (a === 'light') {
    // Use the selected theme if it's a light theme, otherwise fall back to paper-light
    return theme?.mode === 'light' ? themeId : 'paper-light'
  }
  if (a === 'system') {
    if (systemPrefersDark) {
      return theme?.mode === 'dark' ? themeId : DEFAULT_THEME_ID
    }
    return theme?.mode === 'light' ? themeId : 'paper-light'
  }
  // Dark mode — use selected if dark, otherwise default
  return theme?.mode === 'dark' ? themeId : (THEMES[themeId] ? themeId : DEFAULT_THEME_ID)
}

export const DEFAULT_THEME_ID = 'default-dark'
const BUILTIN_THEME_IDS = new Set(Object.keys(THEMES))
export const THEME_PRESETS = Object.values(THEMES)
export const THEME_OPTIONS = THEME_PRESETS.map(({ id, label, mode, description }) => ({ id, label, mode, description }))

/** Register or update a custom (extension-provided) theme at runtime. Builtins are immutable. */
export function registerCustomTheme(theme: AppTheme): void {
  if (BUILTIN_THEME_IDS.has(theme.id)) return
  THEMES[theme.id] = theme
  const presetIndex = THEME_PRESETS.findIndex(t => t.id === theme.id)
  if (presetIndex >= 0) THEME_PRESETS[presetIndex] = theme
  else THEME_PRESETS.push(theme)

  const option = { id: theme.id, label: theme.label, mode: theme.mode, description: theme.description }
  const optionIndex = THEME_OPTIONS.findIndex(t => t.id === theme.id)
  if (optionIndex >= 0) THEME_OPTIONS[optionIndex] = option
  else THEME_OPTIONS.push(option)
}

/** Remove a custom theme registered at runtime. Builtins are immutable. */
export function unregisterCustomTheme(themeId: string): void {
  if (!themeId || BUILTIN_THEME_IDS.has(themeId)) return
  delete THEMES[themeId]
  const presetIndex = THEME_PRESETS.findIndex(t => t.id === themeId)
  if (presetIndex >= 0) THEME_PRESETS.splice(presetIndex, 1)
  const optionIndex = THEME_OPTIONS.findIndex(t => t.id === themeId)
  if (optionIndex >= 0) THEME_OPTIONS.splice(optionIndex, 1)
}

export function getThemeById(id?: string | null): AppTheme {
  if (!id) return THEMES[DEFAULT_THEME_ID]
  return THEMES[id] ?? THEMES[DEFAULT_THEME_ID]
}

export function getThemeCanvasDefaults(id?: string | null): Pick<AppTheme['canvas'], 'background' | 'gridSmall' | 'gridLarge'> {
  const theme = getThemeById(id)
  return {
    background: theme.canvas.background,
    gridSmall: theme.canvas.gridSmall,
    gridLarge: theme.canvas.gridLarge,
  }
}
