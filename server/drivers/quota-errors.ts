const QUOTA_EXHAUSTED = /\bpayment required\b|\binsufficient[ _](?:account[ _])?(?:funds|balance|credits?|quota)\b|\bnot enough quota\b|\b(?:credit|account) balance is too low\b|\bout of credits?\b|\bno credits? (?:left|remaining)\b|\bused all (?:available |of (?:your|its) )?credits\b|额度已用完/i;

export function isQuotaExhausted(text: string): boolean {
  return QUOTA_EXHAUSTED.test(text) || /\b(?:HTTP |status |API Error:? )402\b/i.test(text);
}

export function quotaExhaustedMessage(engine: string, language = "en"): string {
  return language.startsWith("zh")
    ? `${engine} 的额度已用完：充值或在设置里给这个 bot 换一个模型后再继续。`
    : `${engine} is out of credits: add credits or choose another model for this bot in Settings before continuing.`;
}
