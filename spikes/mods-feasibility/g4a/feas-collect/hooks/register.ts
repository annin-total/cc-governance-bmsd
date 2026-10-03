import type { EngineInterface, Register } from 'claude-code'

type Rec = Record<string, unknown>

const COMMAND = 'feas-mod'
const MAX_STR = 1000
// 本文を持ちうるキー。記録には長さだけを残す
const BODY_KEYS = new Set(['prompt', 'tool_response', 'last_assistant_message', 'custom_instructions', 'error', 'message'])

let seq = 0

function _redact(v: unknown, key = ''): unknown {
  if (typeof v === 'string') return BODY_KEYS.has(key) || v.length > MAX_STR ? { len: v.length } : v
  if (Array.isArray(v)) return v.map((x) => _redact(x))
  if (v && typeof v === 'object') {
    const out: Rec = {}
    for (const [k, x] of Object.entries(v as Rec)) out[k] = BODY_KEYS.has(k) ? { len: JSON.stringify(x ?? '').length } : _redact(x, k)
    return out
  }
  return v
}

async function _write($: EngineInterface, ev: string, rec: Rec): Promise<void> {
  try {
    const dir = await $.env.get('FEAS_LOG_DIR')
    const line = JSON.stringify({ side: 'mod', ev, at: Date.now(), seq: ++seq, ...rec })
    $.ui.log(`FEAS ${ev} seq=${seq}`, { to: 'debug' })
    if (!dir) return
    await $.fs.write(`${dir}/mod-${Date.now()}-${String(seq).padStart(4, '0')}-${ev}.json`, `${line}\n`)
  } catch (err) {
    $.ui.log(`FEAS write failed: ${String(err)}`, { to: 'debug' })
  }
}

async function _snapshot($: EngineInterface): Promise<Rec> {
  const out: Rec = {}
  try { out.context = (await $.session.usage()).context } catch (err) { out.contextError = String(err) }
  try { out.version = await $.session.version() } catch (err) { out.versionError = String(err) }
  try { out.sessionId = await $.session.id() } catch (err) { out.sessionIdError = String(err) }
  return out
}

async function _run($: EngineInterface, argv: string[]): Promise<Rec> {
  try {
    const r = await $.process.run(argv, { timeoutMs: 3000 })
    return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr }
  } catch (err) {
    return { error: String(err) }
  }
}

async function _identity($: EngineInterface): Promise<Rec> {
  const env: Rec = {}
  try {
    env.CC_GOVERNANCE_DISABLE = await $.env.get('CC_GOVERNANCE_DISABLE')
    env.CLAUDE_CONFIG_DIR = await $.env.get('CLAUDE_CONFIG_DIR')
    env.CLAUDE_CODE_ENTRYPOINT = await $.env.get('CLAUDE_CODE_ENTRYPOINT')
  } catch (err) {
    env.error = String(err)
  }
  return {
    hostname: await _run($, ['hostname']),
    gitEmail: await _run($, ['git', 'config', '--global', 'user.email']),
    env,
  }
}

// classic.* を記録して素通しする。記録の失敗で連鎖を止めない
async function _observe($: EngineInterface, name: string, e: unknown): Promise<void> {
  try {
    await _write($, name, { e: _redact(e), ...(await _snapshot($)) })
  } catch (err) {
    $.ui.log(`FEAS observe failed: ${String(err)}`, { to: 'debug' })
  }
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({ name: COMMAND, description: 'feas-collect の応答だけを返す' })
      await _write($, 'session.start', { isInteractive: e.isInteractive, cwd: e.cwd, ...(await _identity($)), ...(await _snapshot($)) })
    } catch (err) {
      $.ui.log(`FEAS session.start failed: ${String(err)}`, { to: 'debug' })
    }
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    await _write($, 'command.run', { args: e.args })
    return { text: 'feas-mod ok' }
  })

  on('classic.SessionStart', async ($, e, next) => { await _observe($, 'SessionStart', e); return next(e) })
  on('classic.UserPromptSubmit', async ($, e, next) => { await _observe($, 'UserPromptSubmit', e); return next(e) })
  on('classic.UserPromptExpansion', async ($, e, next) => { await _observe($, 'UserPromptExpansion', e); return next(e) })
  on('classic.PostToolUse', async ($, e, next) => { await _observe($, 'PostToolUse', e); return next(e) })
  on('classic.PostToolUseFailure', async ($, e, next) => { await _observe($, 'PostToolUseFailure', e); return next(e) })
  on('classic.PreCompact', async ($, e, next) => { await _observe($, 'PreCompact', e); return next(e) })
  on('classic.Stop', async ($, e, next) => { await _observe($, 'Stop', e); return next(e) })
  on('classic.SessionEnd', async ($, e, next) => { await _observe($, 'SessionEnd', e); return next(e) })
}
