/**
 * The four seasons: the brand layer of Herbier, once per season, day and night.
 *
 * Only what carries the brand changes — the paper, the greens (or the rusts, or the
 * blues) of the action, the sage that marks a selection, the code surface, the planes
 * of the forest, the light. The tones that carry a meaning stay where `herbier` put
 * them: slate for information, ochre for the important, rust for the warning, wine
 * for the danger. A warning is the same warning in July and in January.
 *
 * Values are the ones of the seasons mock-up. The tints it computes at run time
 * (the hover of a sage fill, the halo of a field, the marked lines of the code) are
 * computed once here, the way `herbier` does it, and every season is proved against
 * WCAG AA in `seasons.spec.ts`.
 */
import { definePalette } from '@craft-ts/style';

export const spring = definePalette('spring', {
  surface: {
    page: { light: '#F3F5E6', dark: '#101A13' },
    raised: { light: '#FBFCF2', dark: '#162419' },
    selected: { light: '#DDEED0', dark: '#1B3022' },
    selectedHover: { light: '#C1DABA', dark: '#2F4B37' },
    selectedActive: { light: '#ACCAA9', dark: '#3F5E46' },
    navHover: { light: '#E6F1D9', dark: '#17271C' },
    code: { light: '#17281D', dark: '#0B140E' },
    codeHighlight: { light: '#22342B', dark: '#202C29' },
    codeAdd: { light: '#243627', dark: '#212D20' },
    codeRemove: { light: '#2C332A', dark: '#2F2926' },
    codeWarning: { light: '#293522', dark: '#292B19' },
    tip: { light: '#DDEED0', dark: '#1B3022' },
  },
  text: {
    strong: { light: '#1E2D22', dark: '#E6EDDC' },
    body: { light: '#1E2D22', dark: '#E6EDDC' },
    muted: { light: '#435A48', dark: '#B8C7B4' },
    subtle: { light: '#53695A', dark: '#98AA97' },
    link: { light: '#245A38', dark: '#B5E5BB' },
    tip: { light: '#245A38', dark: '#B5E5BB' },
  },
  border: {
    subtle: { light: '#CCD8BC', dark: '#2A3D2E' },
    strong: { light: '#53695A', dark: '#98AA97' },
    tip: { light: '#97B696', dark: '#56755C' },
    focusHalo: { light: '#C2D5C2', dark: '#3B5640' },
    codeLine: { light: '#2A392F', dark: '#1F2721' },
  },
  accent: {
    action: { light: '#2E6F45', dark: '#9AD6A4' },
    actionHover: { light: '#245A38', dark: '#B5E5BB' },
    actionActive: { light: '#1D482D', dark: '#C4EAC9' },
    onAction: { light: '#F6FBF1', dark: '#0E1A12' },
    decor: { light: '#7FB069', dark: '#86B77A' },
    accent2: { light: '#E7A4B8', dark: '#E8A9BC' },
    snow: { light: '#FFFFFF', dark: '#DCEAF4' },
  },
  effect: {
    shadow: { light: '#D9DDCF', dark: '#0A100B' },
    glow: { light: '#FAF4C5', dark: '#212E25' },
  },
  decor: {
    forestBack: { light: '#DDEBCF', dark: '#243B2B' },
    forestRidge: { light: '#C4DFB2', dark: '#1D3324' },
    forestMiddle: { light: '#9FCB92', dark: '#172A1E' },
    forestNear: { light: '#5C9B68', dark: '#112017' },
    forestFront: { light: '#38764E', dark: '#0A140D' },
    contour: { light: '#CCDAC6', dark: '#26382A' },
  },
});

export const summer = definePalette('summer', {
  surface: {
    page: { light: '#F6F1DB', dark: '#0E1B12' },
    raised: { light: '#FFFBEA', dark: '#14241A' },
    selected: { light: '#DAEBC2', dark: '#1A3320' },
    selectedHover: { light: '#BCD6AC', dark: '#2D4C32' },
    selectedActive: { light: '#A5C79B', dark: '#3B5F3F' },
    navHover: { light: '#E5EDCC', dark: '#15291A' },
    code: { light: '#14261A', dark: '#0A150C' },
    codeHighlight: { light: '#1F3329', dark: '#1F2D27' },
    codeAdd: { light: '#213525', dark: '#202E1E' },
    codeRemove: { light: '#2A3228', dark: '#2E2A24' },
    codeWarning: { light: '#263320', dark: '#282C17' },
    tip: { light: '#DAEBC2', dark: '#1A3320' },
  },
  text: {
    strong: { light: '#1B2A1C', dark: '#EAEED8' },
    body: { light: '#1B2A1C', dark: '#EAEED8' },
    muted: { light: '#44563F', dark: '#BCCBB0' },
    subtle: { light: '#4F6140', dark: '#9CAF90' },
    link: { light: '#165229', dark: '#ADE0A8' },
    tip: { light: '#165229', dark: '#ADE0A8' },
  },
  border: {
    subtle: { light: '#D8D2A8', dark: '#2A3F2B' },
    strong: { light: '#4F6140', dark: '#9CAF90' },
    tip: { light: '#90B188', dark: '#527554' },
    focusHalo: { light: '#C0D2B8', dark: '#36543B' },
    codeLine: { light: '#27372C', dark: '#1E281F' },
  },
  accent: {
    action: { light: '#1E6A38', dark: '#8FD08F' },
    actionHover: { light: '#165229', dark: '#ADE0A8' },
    actionActive: { light: '#124221', dark: '#BDE6B9' },
    onAction: { light: '#F7FBEF', dark: '#0C1A10' },
    decor: { light: '#5FA55A', dark: '#6FB46A' },
    accent2: { light: '#F0BE4A', dark: '#F0C85A' },
    snow: { light: '#FFFFFF', dark: '#DCEAF4' },
  },
  effect: {
    shadow: { light: '#DCD9C5', dark: '#08100B' },
    glow: { light: '#FDE498', dark: '#252C19' },
  },
  decor: {
    forestBack: { light: '#D3E5B2', dark: '#213E26' },
    forestRidge: { light: '#ADD18C', dark: '#1B3421' },
    forestMiddle: { light: '#74B063', dark: '#152A1B' },
    forestNear: { light: '#33834A', dark: '#0F2015' },
    forestFront: { light: '#1D5C36', dark: '#09140D' },
    contour: { light: '#CBD6BA', dark: '#233826' },
  },
});

export const autumn = definePalette('autumn', {
  surface: {
    page: { light: '#F4EADA', dark: '#1A130D' },
    raised: { light: '#FCF6EA', dark: '#231A12' },
    selected: { light: '#F1DCC0', dark: '#33261A' },
    selectedHover: { light: '#DCC4A7', dark: '#4F3C2A' },
    selectedActive: { light: '#CCB293', dark: '#644D35' },
    navHover: { light: '#F2E2CA', dark: '#291E15' },
    code: { light: '#271B12', dark: '#120C07' },
    codeHighlight: { light: '#312821', dark: '#262623' },
    codeAdd: { light: '#332B1D', dark: '#27261A' },
    codeRemove: { light: '#3B2820', dark: '#352320' },
    codeWarning: { light: '#382918', dark: '#2F2413' },
    tip: { light: '#F1DCC0', dark: '#33261A' },
  },
  text: {
    strong: { light: '#2B2018', dark: '#F0E4D2' },
    body: { light: '#2B2018', dark: '#F0E4D2' },
    muted: { light: '#5A4636', dark: '#CDBBA2' },
    subtle: { light: '#664F3A', dark: '#AD9A82' },
    link: { light: '#583716', dark: '#F0BC8A' },
    tip: { light: '#583716', dark: '#F0BC8A' },
  },
  border: {
    subtle: { light: '#D8C6A8', dark: '#3D2E20' },
    strong: { light: '#664F3A', dark: '#AD9A82' },
    tip: { light: '#B79D7F', dark: '#7B5F45' },
    focusHalo: { light: '#D4C4B2', dark: '#584430' },
    codeLine: { light: '#382D25', dark: '#251F1B' },
  },
  accent: {
    action: { light: '#6E4521', dark: '#E2B07C' },
    actionHover: { light: '#583716', dark: '#F0BC8A' },
    actionActive: { light: '#462C12', dark: '#F3C9A1' },
    onAction: { light: '#FFF7EA', dark: '#1F140B' },
    decor: { light: '#C98B3C', dark: '#D9A04A' },
    accent2: { light: '#C4572B', dark: '#E0804A' },
    snow: { light: '#FFFFFF', dark: '#DCEAF4' },
  },
  effect: {
    shadow: { light: '#DAD3C4', dark: '#100B08' },
    glow: { light: '#FAD59F', dark: '#2E2013' },
  },
  decor: {
    forestBack: { light: '#EEDDC2', dark: '#3A2A1D' },
    forestRidge: { light: '#E3C294', dark: '#2F2217' },
    forestMiddle: { light: '#D0985F', dark: '#251A11' },
    forestNear: { light: '#A9613A', dark: '#1B120B' },
    forestFront: { light: '#6F3C28', dark: '#110B06' },
    contour: { light: '#D9C9B5', dark: '#3A2C1F' },
  },
});

export const winter = definePalette('winter', {
  surface: {
    page: { light: '#EDF1F5', dark: '#0D141C' },
    raised: { light: '#F9FBFD', dark: '#131D28' },
    selected: { light: '#DCE7F0', dark: '#172A3B' },
    selectedHover: { light: '#C0D1DD', dark: '#2A4154' },
    selectedActive: { light: '#ABC0CF', dark: '#385368' },
    navHover: { light: '#E3EBF2', dark: '#13212F' },
    code: { light: '#16212B', dark: '#0A1119' },
    codeHighlight: { light: '#212E38', dark: '#1F2A33' },
    codeAdd: { light: '#233034', dark: '#202B2A' },
    codeRemove: { light: '#2B2D37', dark: '#2E272F' },
    codeWarning: { light: '#282E2F', dark: '#282822' },
    tip: { light: '#DCE7F0', dark: '#172A3B' },
  },
  text: {
    strong: { light: '#1B2733', dark: '#E4ECF3' },
    body: { light: '#1B2733', dark: '#E4ECF3' },
    muted: { light: '#415163', dark: '#B3C3D2' },
    subtle: { light: '#4B5C70', dark: '#92A5B8' },
    link: { light: '#214962', dark: '#AED3EC' },
    tip: { light: '#214962', dark: '#AED3EC' },
  },
  border: {
    subtle: { light: '#C7D2DE', dark: '#25364A' },
    strong: { light: '#4B5C70', dark: '#92A5B8' },
    tip: { light: '#95ABBA', dark: '#506A7E' },
    focusHalo: { light: '#C0CED9', dark: '#35495A' },
    codeLine: { light: '#29333C', dark: '#1E242B' },
  },
  accent: {
    action: { light: '#2D5B7B', dark: '#8EBBDA' },
    actionHover: { light: '#214962', dark: '#AED3EC' },
    actionActive: { light: '#1A3A4E', dark: '#BEDCF0' },
    onAction: { light: '#F3F9FD', dark: '#0B1620' },
    decor: { light: '#8FB3C9', dark: '#6F9BB8' },
    accent2: { light: '#BFD8E8', dark: '#CFE6F5' },
    snow: { light: '#FFFFFF', dark: '#DCEAF4' },
  },
  effect: {
    shadow: { light: '#D4D9DC', dark: '#080C11' },
    glow: { light: '#DFECF9', dark: '#1F2A35' },
  },
  decor: {
    forestBack: { light: '#E4EBF1', dark: '#1B2C3D' },
    forestRidge: { light: '#CCD9E4', dark: '#162536' },
    forestMiddle: { light: '#A7BDCE', dark: '#111E2D' },
    forestNear: { light: '#62829A', dark: '#0C1621' },
    forestFront: { light: '#36536C', dark: '#070E16' },
    contour: { light: '#C7D3DD', dark: '#222F3A' },
  },
});
