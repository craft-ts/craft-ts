import type { SendContextEnvironmentProfile } from '@craft-ts/core';

/** Best-effort browser profile; the raw user-agent is retained for diagnostics. */
export function captureDebugSessionEnvironment(
  browser: Pick<
    Window,
    'navigator' | 'screen' | 'innerWidth' | 'innerHeight' | 'devicePixelRatio'
  > = window,
): SendContextEnvironmentProfile {
  const navigator = browser.navigator;
  const userAgent = navigator.userAgent;
  const browserInfo = identifyBrowser(userAgent);
  let timeZone: string | undefined;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // Some constrained runtimes do not expose timezone data.
  }
  return {
    ...browserInfo,
    ...(navigator.platform ? { platform: navigator.platform } : {}),
    ...(userAgent ? { userAgent } : {}),
    viewport: { width: browser.innerWidth, height: browser.innerHeight },
    ...(Number.isFinite(browser.devicePixelRatio)
      ? { devicePixelRatio: browser.devicePixelRatio }
      : {}),
    ...(navigator.language ? { language: navigator.language } : {}),
    ...(navigator.languages?.length
      ? { languages: [...navigator.languages].slice(0, 10) }
      : {}),
    ...(timeZone ? { timeZone } : {}),
    screen: { width: browser.screen.width, height: browser.screen.height },
  };
}

export function identifyBrowser(
  userAgent: string,
): Pick<
  SendContextEnvironmentProfile,
  'browser' | 'browserVersion' | 'engine'
> {
  const patterns: readonly [
    RegExp,
    string,
    SendContextEnvironmentProfile['engine'],
  ][] = [
    [/Firefox\/([\d.]+)/, 'Firefox', 'gecko'],
    [/Edg\/([\d.]+)/, 'Edge', 'chromium'],
    [/OPR\/([\d.]+)/, 'Opera', 'chromium'],
    [/Chrome\/([\d.]+)/, 'Chrome', 'chromium'],
    [/Version\/([\d.]+).*Safari\//, 'Safari', 'webkit'],
  ];
  for (const [pattern, browser, engine] of patterns) {
    const version = pattern.exec(userAgent)?.[1];
    if (version) return { browser, browserVersion: version, engine };
  }
  return { engine: 'unknown' };
}

export function environmentDifferences(
  recorded: SendContextEnvironmentProfile | undefined,
  current: SendContextEnvironmentProfile,
): readonly string[] {
  if (!recorded) return [];
  const differences: string[] = [];
  if (recorded.browser && recorded.browser !== current.browser)
    differences.push(
      `navigateur ${recorded.browser} → ${current.browser ?? 'inconnu'}`,
    );
  if (recorded.engine && recorded.engine !== current.engine)
    differences.push(
      `moteur ${recorded.engine} → ${current.engine ?? 'inconnu'}`,
    );
  const recordedMajor = recorded.browserVersion?.split('.')[0];
  const currentMajor = current.browserVersion?.split('.')[0];
  if (recordedMajor && currentMajor && recordedMajor !== currentMajor)
    differences.push(`version majeure ${recordedMajor} → ${currentMajor}`);
  if (
    recorded.platform &&
    current.platform &&
    recorded.platform !== current.platform
  )
    differences.push(`plateforme ${recorded.platform} → ${current.platform}`);
  if (
    recorded.language &&
    current.language &&
    recorded.language !== current.language
  )
    differences.push(`langue ${recorded.language} → ${current.language}`);
  if (
    recorded.timeZone &&
    current.timeZone &&
    recorded.timeZone !== current.timeZone
  )
    differences.push(`fuseau ${recorded.timeZone} → ${current.timeZone}`);
  if (
    recorded.devicePixelRatio !== undefined &&
    current.devicePixelRatio !== undefined &&
    recorded.devicePixelRatio !== current.devicePixelRatio
  )
    differences.push(
      `densité d’écran ${recorded.devicePixelRatio} → ${current.devicePixelRatio}`,
    );
  return differences;
}
