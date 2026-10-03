// 貼り返す結果に、メールアドレス・アカウント番号・トークン・利用者名を含めないための伏せ字
const EMAIL = /[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+/g
const AWS_ACCOUNT = /\b\d{12}\b/g
// 英字と数字が混ざった 32 文字以上（トークン・UUID）。環境変数名（英大文字と _）とパスの区切りは含めない
const LONG_TOKEN = /[A-Za-z0-9+=-]{32,}/g

export function maskText(text: string, homes: readonly string[] = []): string {
  let out = text
  for (const home of homes) {
    if (home.length <= 3) continue
    // JSON にした後の文字列では Windows のパスの \ が \\ になっている
    out = out.split(home.replace(/\\/g, '\\\\')).join('~').split(home).join('~')
  }
  return out
    .replace(EMAIL, '<email>')
    .replace(AWS_ACCOUNT, '<acct>')
    .replace(LONG_TOKEN, (m) => (/\d/.test(m) && /[a-z]/i.test(m) ? `<len=${m.length}>` : m))
}

// 値は出さず、有無とスキームだけを返す（プロキシの URL は社内のホスト名を含む）
export function urlShape(value: string | undefined): string {
  if (value === undefined) return 'unset'
  const m = /^([a-z][a-z0-9+.-]*):\/\//i.exec(value)
  return m?.[1] ? `set(${m[1].toLowerCase()}://…, len=${value.length})` : `set(len=${value.length})`
}

export function presence(value: string | undefined): string {
  return value === undefined ? 'unset' : `set(len=${value.length})`
}

// HooksError の message には URL が入るので、符号（ECONNREFUSED など）だけを抜く
export function errorCode(err: unknown): string {
  const text = String(err)
  const m = /(?:failed|aborted): ([A-Z_]{3,})/.exec(text)
  if (m?.[1]) return m[1]
  if (/timed out/i.test(text)) return 'TIMEOUT'
  if (/no complete answer within/.test(text)) return 'ABORTED_30S'
  return `OTHER(len=${text.length})`
}
