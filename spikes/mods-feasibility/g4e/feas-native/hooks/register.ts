import type { EngineInterface, Register } from 'claude-code'

type Rec = Record<string, unknown>

const ERR_HEAD = 160

let seq = 0

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

async function _snap($: EngineInterface): Promise<Rec> {
  const out: Rec = {}
  try { out.context = (await $.session.usage()).context } catch (err) { out.contextError = String(err) }
  try { out.sessionId = await $.session.id() } catch (err) { out.sessionIdError = String(err) }
  return out
}

const TAIL_BYTES = '262144'

// prompt_id・permission_mode は独自イベントに無いので、transcript の最後の利用者の行から読む（代替手段の試し）
function _lastPrompt(text: string): Rec {
  const out: Rec = { promptIdTx: null, permissionModeTx: null }
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"promptId"')) continue
    try {
      const d = JSON.parse(lines[i]) as Rec
      if (d.type !== 'user' || !d.promptId) continue
      if (out.promptIdTx === null) out.promptIdTx = d.promptId
      // permissionMode は利用者が打った行にだけ付く（tool_result の行には無い）
      if ('permissionMode' in d) { out.permissionModeTx = d.permissionMode; out.modePromptId = d.promptId; return out }
    } catch { /* tail の先頭は途中から始まる */ }
  }
  return out
}

async function _txPath($: EngineInterface): Promise<string> {
  const cfg = await $.env.get('CLAUDE_CONFIG_DIR')
  const home = await $.env.get('HOME')
  const root = await $.session.root()
  return `${cfg ?? `${home}/.claude`}/projects/${root.replace(/[^a-zA-Z0-9]/g, '-')}/${await $.session.id()}.jsonl`
}

async function _promptIdTx($: EngineInterface): Promise<Rec> {
  const out: Rec = {}
  try {
    const path = await _txPath($)
    try {
      const text = await $.fs.read(path)
      Object.assign(out, _lastPrompt(text), { txBytes: text.length })
    } catch (err) { out.promptIdTxError = String(err) }
    try {
      const r = await $.process.run(['tail', '-c', TAIL_BYTES, path], { timeoutMs: 3000 })
      const t = _lastPrompt(r.stdout)
      out.tail = { exitCode: r.exitCode, promptId: t.promptIdTx, permissionMode: t.permissionModeTx }
    } catch (err) { out.tailError = String(err) }
  } catch (err) {
    out.txPathError = String(err)
  }
  return out
}

async function _configRows($: EngineInterface): Promise<unknown> {
  try {
    const rows = await $.config.list()
    return rows.filter((r) => /mode|perm|effort/i.test(r.key)).map((r) => ({ key: r.key, value: r.value }))
  } catch (err) {
    return { error: String(err) }
  }
}

async function _safe($: EngineInterface, name: string, fn: () => Promise<void>): Promise<void> {
  try { await fn() } catch (err) { $.ui.log(`FEAS ${name} failed: ${String(err)}`, { to: 'debug' }) }
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await _safe($, 'session.start', async () => {
      const msgs = await $.session.messages()
      await _write($, 'session.start', {
        isInteractive: e.isInteractive, surface: e.surface, turns: await $.session.turns(), messages: msgs.length,
        model: await $.session.model(), config: await _configRows($), ...(await _snap($)),
      })
    })
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await _safe($, 'prompt.submit', async () => {
      await _write($, 'prompt.submit', { textLen: e.text.length, origin: e.origin, wait: e.wait, turnId: e.turnId, ...(await _snap($)) })
    })
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    const r = await next(e)
    await _safe($, 'turn.start', async () => {
      await _write($, 'turn.start', { turnId: e.turnId, textLen: e.text.length, ...(await _promptIdTx($)), ...(await _snap($)) })
    })
    return r
  })

  on('turn.step', async function* ($, e, next) {
    await _safe($, 'turn.step', async () => {
      await _write($, 'turn.step', { turnId: e.turnId, index: e.index, model: e.model, effort: e.effort ?? '<absent>', messageCount: e.messageCount, agentId: e.agentId, config: await _configRows($) })
    })
    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await _safe($, 'turn.complete', async () => {
      await _write($, 'turn.complete', {
        turnId: e.turnId, reason: e.reason, isAborted: e.isAborted, agentId: e.agentId, durationMs: e.durationMs,
        usage: e.usage, turns: await $.session.turns(), ...(await _promptIdTx($)), ...(await _snap($)),
      })
    })
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const base: Rec = { tool: e.tool, tool_use_id: e.tool_use_id, agentId: e.agentId, skill: (e as Rec).skill }
    let r
    try {
      r = await next(e)
    } catch (err) {
      await _write($, 'tool.call', { ...base, threw: String(err), ...(await _snap($)) })
      throw err
    }
    await _safe($, 'tool.call', async () => {
      await _write($, 'tool.call', {
        ...base, isError: r.isError ?? false, deny: r.deny, isReadOnly: r.isReadOnly,
        errHead: r.isError ? String(r.text ?? '').slice(0, ERR_HEAD) : undefined, ...(await _snap($)),
      })
    })
    return r
  })

  on('session.compact', async ($, e, next) => {
    await _safe($, 'session.compact', async () => {
      await _write($, 'session.compact', { trigger: e.trigger, agentId: e.agentId, hasInstructions: e.instructions !== undefined, messages: e.messages.length, ...(await _snap($)) })
    })
    const r = await next(e)
    await _safe($, 'session.compact.after', async () => { await _write($, 'session.compact.after', { trigger: e.trigger, skipped: 'skip' in r, ...(await _snap($)) }) })
    return r
  })

  on('session.end', async ($, e, next) => {
    await _safe($, 'session.end', async () => {
      await _write($, 'session.end', { reason: e.reason, endingSessionId: e.sessionId, ...(await _snap($)) })
    })
    const r = await next(e)
    await _safe($, 'session.end.after', async () => { await _write($, 'session.end.after', { reason: e.reason, ...(await _snap($)) }) })
    return r
  })

  on('command.run', async ($, e, next) => {
    await _safe($, 'command.run', async () => {
      let info: unknown
      try { info = (await $.command.list()).find((c) => c.name === e.command) } catch (err) { info = { error: String(err) } }
      await _write($, 'command.run', { command: e.command, argsLen: e.args.length, origin: e.origin, info, ...(await _snap($)) })
    })
    const r = await next(e)
    await _safe($, 'command.run.after', async () => { await _write($, 'command.run.after', { command: e.command, ...(await _snap($)) }) })
    return r
  })

  // sec-default が飛ばすイベントの陽性対照
  on('skill.prompt', async ($, e, next) => {
    await _safe($, 'skill.prompt', async () => { await _write($, 'skill.prompt', { skill: e.skill }) })
    return next(e)
  })
  on('classic.SessionStart', async ($, e, next) => {
    await _safe($, 'classic.SessionStart', async () => { await _write($, 'classic.SessionStart', { source: (e as Rec).source }) })
    return next(e)
  })
}
