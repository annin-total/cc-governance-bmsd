import type { EngineInterface, Register } from 'claude-code'

const NOTICES_FILE = 'notices.json'
const SEEN_KEY_PREFIX = 'seen:'
const DEFAULT_LABEL = '詳細を開く'
const SEEN_LABEL = '既読にする'
const GUIDE = 'ctrl+x tab でボタンへ、Enter で既読（tab で次へ・クリックでも可）'
// 押すとフォーカスが次のボタンへ移るため、Enter の二度押しで次のお知らせまで既読になるのを防ぐ
const PRESS_GUARD_MS = 1000
const URL_SCHEME = 'https://'
const URL_MAX_LENGTH = 2048
// 印字できる ASCII 以外（空白・制御文字・非 ASCII）と、引数やシェルの区切りになりうる文字を拒否する。
// 角括弧（IPv6 の表記）も拒否し、validate（urlsplit）とホストの判定を揃える
const URL_FORBIDDEN = /[^\x21-\x7e]|["<>\\^`|{}[\]]/

type Notice = { id: string; title: string; body: string; url?: unknown; label?: unknown }

let _lastPressAt = Number.NEGATIVE_INFINITY

function _isNotice(value: unknown): value is Notice {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const n = value as Record<string, unknown>
  return typeof n.id === 'string' && n.id !== '' && typeof n.title === 'string' && typeof n.body === 'string'
}

function _validUrl(url: unknown): string | undefined {
  if (typeof url !== 'string' || !url.startsWith(URL_SCHEME) || url.length > URL_MAX_LENGTH) return undefined
  if (URL_FORBIDDEN.test(url)) return undefined
  const authority = url.slice(URL_SCHEME.length).split(/[/?#]/, 1)[0] ?? ''
  const hostPort = authority.slice(authority.lastIndexOf('@') + 1)
  return hostPort.split(':', 1)[0] ? url : undefined
}

function _label(notice: Notice): string {
  return typeof notice.label === 'string' && notice.label !== '' ? notice.label : DEFAULT_LABEL
}

function _logText(notice: Notice): string {
  const url = _validUrl(notice.url)
  return [notice.title, notice.body, url].filter(Boolean).join(' / ').replace(/\s*\n\s*/g, ' ')
}

async function _unread($: EngineInterface): Promise<Notice[]> {
  if (await $.env.get('CC_GOVERNANCE_DISABLE')) return []
  const parsed: unknown = JSON.parse(await $.fs.read(`${$.plugin.root}/${NOTICES_FILE}`))
  if (!Array.isArray(parsed)) return []
  const notices = parsed.filter(_isNotice)
  const seen = await Promise.all(notices.map(n => $.store.get(SEEN_KEY_PREFIX + n.id)))
  return notices.filter((_, i) => seen[i] === undefined)
}

async function _markSeen($: EngineInterface, id: string): Promise<void> {
  try {
    const now = await $.clock.now()
    if (now - _lastPressAt < PRESS_GUARD_MS) return
    _lastPressAt = now
    await $.store.set(SEEN_KEY_PREFIX + id, true)
    $.ui.invalidate('ui.render')
  } catch {
    // 書けなければ未読のまま残し、次の描画で再び出す
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      if (!e.isInteractive) for (const n of await _unread($)) $.ui.log(_logText(n))
    } catch {
      // お知らせの失敗で利用者の作業を妨げない
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    let unread: Notice[] = []
    try {
      if (!e.props.hasSurvey) unread = await _unread($)
    } catch {
      unread = []
    }
    if (unread.length === 0) return next(e)
    const below = await next(e)
    const { Box, Button, Link, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          <Text dimColor>{GUIDE}</Text>
          {unread.map(n => {
            const url = _validUrl(n.url)
            return (
              <Box key={n.id} flexDirection="column" marginTop={1}>
                <Box flexDirection="row" gap={1}>
                  <Button key={`seen:${n.id}`} label={SEEN_LABEL} onPress={() => _markSeen($, n.id)} />
                  <Text bold>{n.title}</Text>
                </Box>
                <Text>{n.body}</Text>
                {url && <Link href={url} label={_label(n)} />}
                {url && <Text dimColor>{url}</Text>}
              </Box>
            )
          })}
        </Box>
        {below}
      </Box>
    )
  }).catch(($, e, next) => next(e))
}
