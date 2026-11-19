type Units = 'metric' | 'imperial';
export type GaugeKind = 'temperature' | 'pressure' | 'load';

export const UNIT_LABELS: Readonly<
  Record<GaugeKind, Readonly<Record<Units, string>>>
> = {
  temperature: { metric: '°C', imperial: '°F' },
  pressure: { metric: 'bar', imperial: 'psi' },
  load: { metric: '%', imperial: '%' },
};

export const fixed = <T>(value: T) =>
  function* () {
    return value;
  };
