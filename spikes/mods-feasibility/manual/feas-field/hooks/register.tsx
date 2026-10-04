import type { EngineInterface, Register } from 'claude-code'
import { detachArgv, ECHO_MODES, ECHO_SAMPLE, POSIX_METHODS, PY_ECHO, PYTHONS, WINDOWS_METHODS } from './argv'
import { errorCode, maskText, presence, urlShape } from './mask'
import { bump, emptyRecord, KEY_PREFIX, pushTurn, staleKeys, turnRow, type Record_ } from './record'

// $ は import 先の関数へ渡せない（validate が拒否する）ため、$ を使う処理はすべてこのファイルに置く
type Rec = Record<string, unknown>

const COMMAND = 'feas-field'
const USAGE = '使い方: /feas-field info | log | py | fetch <GET|POST> <url> | detach | hold <秒> | update <plugin>@<marketplace> | reload | ui'
const PLUGIN_SPEC = /^[\w.-]+@[\w.-]+$/
const UPDATE_TIMEOUT_MS = 60000
const LOCAL_URL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/
const HOLD_MAX_SEC = 120
const RUN_TIMEOUT_MS = 15000
const PY_NODE = 'import platform; print(platform.node())'

let start: Rec = {}
let tier: unknown = 'unknown（自分の store.keys の hook が呼ばれなかった）'
let sid = ''
let prev: Record_ | null = null
// classic.SessionStart は session.start より先に来ることがあるので、ここでは作り直さない
let cur: Record_ = emptyRecord()
let isBandOn = false
let isReloadPending = false
let reloadNote: unknown = null
let syncNote: unknown = null

async function _homes($: EngineInterface): Promise<string[]> {
  return [await $.env.get('HOME'), await $.env.get('USERPROFILE')].filter((v): v is string => !!v)
}

async function _isWindows($: EngineInterface): Promise<boolean> {
  return (await $.env.get('OS')) === 'Windows_NT'
}

async function _configDir($: EngineInterface): Promise<string> {
  const cfg = await $.env.get('CLAUDE_CONFIG_DIR')
  if (cfg) return cfg
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? ''
  return `${home}${home.includes('\\') ? '\\' : '/'}.claude`
}

async function _count($: EngineInterface, name: string): Promise<void> {
  bump(cur, name)
  if (!sid) return
  await $.store.set(`${KEY_PREFIX}${sid}`, cur)
  for (const k of staleKeys(await $.store.keys())) await $.store.delete(k)
}

async function _try<T>(fn: () => Promise<T>): Promise<T | string> {
  try { return await fn() } catch (err) { return `error(${errorCode(err)})` }
}

async function _envs($: EngineInterface): Promise<Rec> {
  return {
    OS: (await $.env.get('OS')) ?? 'unset',
    CLAUDE_CODE_ENTRYPOINT: (await $.env.get('CLAUDE_CODE_ENTRYPOINT')) ?? 'unset',
    CLAUDE_CODE_USE_BEDROCK: (await $.env.get('CLAUDE_CODE_USE_BEDROCK')) ?? 'unset',
    AWS_REGION: (await $.env.get('AWS_REGION')) ?? 'unset',
    HTTPS_PROXY: urlShape(await $.env.get('HTTPS_PROXY')),
    https_proxy: urlShape(await $.env.get('https_proxy')),
    HTTP_PROXY: urlShape(await $.env.get('HTTP_PROXY')),
    NO_PROXY: presence(await $.env.get('NO_PROXY')),
    NODE_EXTRA_CA_CERTS: presence(await $.env.get('NODE_EXTRA_CA_CERTS')),
    CLAUDE_CODE_CERT_STORE: (await $.env.get('CLAUDE_CODE_CERT_STORE')) ?? 'unset',
    CLAUDE_CONFIG_DIR: presence(await $.env.get('CLAUDE_CONFIG_DIR')),
    HOME: presence(await $.env.get('HOME')),
    USERPROFILE: presence(await $.env.get('USERPROFILE')),
    CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS: (await $.env.get('CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS')) ?? 'unset',
    DISABLE_AUTOUPDATER: (await $.env.get('DISABLE_AUTOUPDATER')) ?? 'unset',
    FORCE_AUTOUPDATE_PLUGINS: (await $.env.get('FORCE_AUTOUPDATE_PLUGINS')) ?? 'unset',
  }
}

// 値は出さずキー名と真偽だけを出す（env の値やマーケットプレイスの URL は社内の情報を含みうる）
async function _settings($: EngineInterface): Promise<Rec> {
  const policy = (await $.settings.read({ source: 'policy' })) as Rec
  const user = (await $.settings.read({ source: 'user' })) as Rec
  const guard = (((policy.pluginConfigs ?? {}) as Rec)['cc-plugin-sec-default@builtin'] ?? {}) as Rec
  return {
    policyKeys: Object.keys(policy).sort(),
    policyEnvKeys: Object.keys((policy.env ?? {}) as Rec).sort(),
    policyPrependPlugins: policy.prependPlugins ?? 'unset',
    policyAppendPlugins: policy.appendPlugins ?? 'unset',
    policyAllowManagedModsOnly: ((guard.options ?? {}) as Rec).allowManagedModsOnly ?? 'unset',
    policyAllowManagedHooksOnly: policy.allowManagedHooksOnly ?? 'unset',
    policyDisableSideloadFlags: policy.disableSideloadFlags ?? 'unset',
    userPrependPlugins: user.prependPlugins ?? 'unset',
  }
}

// hostname と platform.node() が一致するかだけを見る。値そのもの（端末名）は出さない
async function _hostCheck($: EngineInterface): Promise<Rec> {
  const out: Rec = {}
  let host: string | undefined
  try {
    const r = await $.process.run(['hostname'], { timeoutMs: RUN_TIMEOUT_MS })
    host = r.stdout.trim()
    out.hostname = { exitCode: r.exitCode, len: host.length }
  } catch (err) { out.hostname = `cannot start(${errorCode(err)})` }
  const same = (v: string) => ({ len: v.length, eq: v === host, eqIgnoreCase: v.toLowerCase() === host?.toLowerCase() })
  for (const argv of PYTHONS) {
    try {
      const r = await $.process.run([...argv, '-c', PY_NODE], { timeoutMs: RUN_TIMEOUT_MS })
      out[argv.join(' ')] = { exitCode: r.exitCode, ...same(r.stdout.trim()) }
    } catch (err) { out[argv.join(' ')] = `cannot start(${errorCode(err)})` }
  }
  const computer = await $.env.get('COMPUTERNAME')
  if (computer !== undefined) out.COMPUTERNAME = same(computer)
  return out
}

async function _storeFiles($: EngineInterface): Promise<unknown> {
  await $.store.set('probe', Date.now())
  const entries = await $.fs.list(`${await _configDir($)}/plugins/store`)
  return entries.filter((f) => f.name.startsWith($.plugin.name)).map((f) => ({ name: f.name, size: f.size }))
}

async function _info($: EngineInterface): Promise<string> {
  const homes = await _homes($)
  await $.store.keys()
  return JSON.stringify({
    version: await _try(() => $.session.version()),
    sessionStart: start,
    surfaces: await _try(() => $.session.surfaces()),
    tier,
    model: maskText(String(await _try(() => $.session.model())), homes),
    usage: await _try(async () => {
      const u = await $.session.usage()
      return { context: u.context, rateLimits: u.rateLimits.length, hasCost: u.cost !== undefined }
    }),
    env: await _envs($),
    settings: await _try(() => _settings($)),
    configDir: maskText(await _configDir($), homes),
    pluginRoot: maskText($.plugin.root, homes),
    storeFiles: await _try(() => _storeFiles($)),
    process: await _try(() => _hostCheck($)),
  }, null, 2)
}

async function _fetch($: EngineInterface, args: string[]): Promise<string> {
  const [method = '', url = ''] = args
  const isPost = method.toUpperCase() === 'POST'
  if (!(isPost || method.toUpperCase() === 'GET') || !/^https?:\/\//.test(url)) return USAGE
  if (!LOCAL_URL.test(url) && (await $.env.get('FEAS_ALLOW_REMOTE')) !== '1') {
    return 'localhost 以外へは送らない。検証用の受信先に送るときだけ FEAS_ALLOW_REMOTE=1 を付けて起動する'
  }
  const t0 = Date.now()
  try {
    const r = await $.http.fetch(url, {
      method: isPost ? 'POST' : 'GET',
      headers: isPost ? { 'Content-Type': 'application/json' } : {},
      body: isPost ? JSON.stringify({ probe: COMMAND, at: t0 }) : undefined,
    })
    return JSON.stringify({ status: r.status, ok: r.ok, bodyLen: r.text.length, ms: Date.now() - t0 })
  } catch (err) {
    return JSON.stringify({ error: errorCode(err), name: (err as Error).name, ms: Date.now() - t0 })
  }
}

async function _detach($: EngineInterface): Promise<string> {
  const py = await $.env.get('FEAS_PY')
  const script = await $.env.get('FEAS_DETACH_SCRIPT')
  const dir = await $.env.get('FEAS_DETACH_DIR')
  if (!py || !script || !dir) return 'FEAS_PY・FEAS_DETACH_SCRIPT・FEAS_DETACH_DIR が無い。detach_check.py run から起動する'
  const rows: Rec[] = []
  for (const method of (await _isWindows($)) ? WINDOWS_METHODS : POSIX_METHODS) {
    const t0 = Date.now()
    try {
      const r = await $.process.run(detachArgv(method, py, script, dir), { timeoutMs: RUN_TIMEOUT_MS })
      rows.push({ method, exitCode: r.exitCode, ms: Date.now() - t0, stderrHead: r.stderr.slice(0, 160) })
    } catch (err) {
      rows.push({ method, error: errorCode(err), ms: Date.now() - t0 })
    }
  }
  return JSON.stringify({ launched: rows }, null, 2)
}

// 設定の適用を任せる同梱の Python を、mod から起動して stdin・stdout で受け渡せるか
async function _py($: EngineInterface): Promise<string> {
  const rows: Rec[] = []
  for (const argv of PYTHONS) {
    for (const { mode, env } of ECHO_MODES) {
      const row: Rec = { python: argv.join(' '), mode, env: Object.keys(env).join(',') || '-' }
      try {
        const r = await $.process.run([...argv, '-c', PY_ECHO, mode], { stdin: ECHO_SAMPLE, env: { ...env }, timeoutMs: RUN_TIMEOUT_MS })
        row.exitCode = r.exitCode
        try {
          const d = JSON.parse(r.stdout) as Rec
          Object.assign(row, { eq: d.echo === ECHO_SAMPLE, stdinEnc: d.stdinEnc, stdoutEnc: d.stdoutEnc, preferred: d.preferred, utf8Mode: d.utf8Mode })
        } catch { row.stdoutHead = r.stdout.slice(0, 80) }
        if (r.exitCode !== 0) row.stderrTail = r.stderr.trim().split('\n').slice(-1)[0]?.slice(0, 160)
      } catch (err) { row.error = `cannot start(${errorCode(err)})` }
      rows.push(row)
    }
  }
  return JSON.stringify({ sample: ECHO_SAMPLE, rows }, null, 2)
}

async function _hold($: EngineInterface, sec: string | undefined): Promise<string> {
  const n = Math.max(0, Math.min(Math.floor(Number(sec ?? '0')) || 0, HOLD_MAX_SEC))
  const t0 = Date.now()
  // $.clock.sleep は hook の 10 秒の予算に数えられるため、外部の sleep で待つ
  const argv = (await _isWindows($)) ? ['powershell', '-NoProfile', '-Command', `Start-Sleep -Seconds ${n}`] : ['sleep', String(n)]
  const r = await $.process.run(argv, { timeoutMs: (n + 10) * 1000 })
  return JSON.stringify({ heldMs: Date.now() - t0, exitCode: r.exitCode })
}

// claude plugin の更新を mod から起動できるか。marketplace を取り直してから、プラグインを更新する
async function _runUpdate($: EngineInterface, spec: string): Promise<Rec[]> {
  const steps = [['marketplace', 'update', spec.split('@')[1]!], ['update', spec]]
  const rows: Rec[] = []
  for (const step of steps) {
    const t0 = Date.now()
    try {
      const r = await $.process.run(['claude', 'plugin', ...step], { timeoutMs: UPDATE_TIMEOUT_MS })
      rows.push({ step: step.join(' '), exitCode: r.exitCode, ms: Date.now() - t0, out: r.stdout.trim().slice(-200), err: r.stderr.trim().slice(-120) })
    } catch (err) { rows.push({ step: step.join(' '), error: errorCode(err), ms: Date.now() - t0 }) }
  }
  return rows
}

async function _update($: EngineInterface, spec: string | undefined): Promise<string> {
  if (!spec || !PLUGIN_SPEC.test(spec)) return '使い方: /feas-field update <plugin>@<marketplace>'
  return JSON.stringify(await _runUpdate($, spec), null, 2)
}

// 起動時に更新し、版が変わったときだけ reload する。結果は syncNote に残す
async function _autoSync($: EngineInterface, spec: string): Promise<void> {
  if (!PLUGIN_SPEC.test(spec)) return
  const rootBefore = $.plugin.root.split('/').slice(-1)[0]
  const rows = await _runUpdate($, spec)
  const isUpdated = rows.some((r) => /updated from/.test(String(r.out)))
  syncNote = {
    at: Date.now(), isUpdated, rootBefore, rootAfter: $.plugin.root.split('/').slice(-1)[0],
    steps: rows.map((r) => ({ exitCode: r.exitCode ?? r.error, head: String(r.out ?? '').replace(/\s+/g, ' ').slice(-90) })),
  }
  if (isUpdated) await _tryReload($, 'autosync')
}

// /reload-plugins を mod から実行できるか。command.run の中からは実行できない（host が拒否する）ので、後のイベントから待たずに呼び、結果は reloadNote に残す
async function _tryReload($: EngineInterface, from: string): Promise<void> {
  const t0 = Date.now()
  try {
    const r = await $.command.run({ command: 'reload-plugins' })
    reloadNote = { from, ok: true, ms: Date.now() - t0, text: String(r?.text ?? '').slice(0, 200) }
  } catch (err) {
    reloadNote = { from, error: errorCode(err), message: String((err as Error).message).slice(0, 200), ms: Date.now() - t0 }
  }
}

async function _dispatch($: EngineInterface, args: string): Promise<string> {
  const [sub, ...rest] = args.trim().split(/\s+/)
  if (sub === 'info') return _info($)
  if (sub === 'log') {
    const usageNow = await _try(async () => (await $.session.usage()).context)
    return JSON.stringify({ sessionIdLen: sid.length, previousProcesses: prev, thisProcess: cur, usageNow, reloadNote, syncNote }, null, 2)
  }
  if (sub === 'fetch') return _fetch($, rest)
  if (sub === 'detach') return _detach($)
  if (sub === 'py') return _py($)
  if (sub === 'hold') return _hold($, rest[0])
  if (sub === 'update') return _update($, rest[0])
  if (sub === 'reload') {
    isReloadPending = true
    return 'reload を予約した。次の turn.complete で reload-plugins を実行する。結果は /feas-field log の reloadNote'
  }
  if (sub === 'ui') {
    isBandOn = !isBandOn
    $.ui.toast('feas-field: toast')
    await $.ui.invalidate('ui.render')
    return `band=${isBandOn ? 'on' : 'off'}（もう一度で切り替え）`
  }
  return USAGE
}

export const register: Register = (on) => {
  // 自分の $ 呼び出しに付けた hook は next.origin に自分の tier が載る
  on('store.keys', ($, e, next) => {
    if (next.origin.plugin === $.plugin.name) tier = next.origin.tier
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    start = { surface: e.surface, isInteractive: e.isInteractive }
    // お知らせのバンドの代わり。起動直後から出し、新規・resume で描かれるかを見る
    if ((await $.env.get('FEAS_BAND')) === '1') isBandOn = true
    if ((await $.env.get('FEAS_AUTORELOAD')) === '1') void _tryReload($, 'session.start')
    const syncSpec = await $.env.get('FEAS_AUTOSYNC')
    if (syncSpec) void _autoSync($, syncSpec)
    await $.command.register({ name: COMMAND, description: 'Mods の検証値を出す（モデルを呼ばない）' })
    sid = await $.session.id()
    const saved = await $.store.get(`${KEY_PREFIX}${sid}`)
    prev = saved ? (saved as Record_) : null
    await _count($, 'session.start')
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => { await _count($, 'prompt.submit'); return next(e) })
  on('turn.start', async ($, e, next) => { await _count($, 'turn.start'); return next(e) })
  on('session.compact', async ($, e, next) => { await _count($, 'session.compact'); return next(e) })
  on('session.end', async ($, e, next) => { await _count($, 'session.end'); return next(e) })

  on('turn.step', async function* ($, e, next) {
    cur.lastStep = { model: maskText(String(e.model)), effort: e.effort ?? '<absent>', isSubagent: e.agentId !== undefined }
    await _count($, 'turn.step')
    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    pushTurn(cur, turnRow(e as unknown as Rec, (await $.session.usage()).context))
    await _count($, 'turn.complete')
    if (isReloadPending) {
      isReloadPending = false
      void _tryReload($, 'turn.complete')
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    await _count($, r.isError ? 'tool.call(isError)' : 'tool.call')
    return r
  })

  on('command.run', async ($, e, next) => {
    await _count($, 'command.run')
    if (e.command !== COMMAND) return next(e)
    return { text: maskText(await _dispatch($, e.args), await _homes($)) }
  })

  on('classic.SessionStart', async ($, e, next) => { await _count($, 'classic.SessionStart'); return next(e) })
  on('classic.UserPromptSubmit', async ($, e, next) => { await _count($, 'classic.UserPromptSubmit'); return next(e) })
  on('classic.UserPromptExpansion', async ($, e, next) => { await _count($, 'classic.UserPromptExpansion'); return next(e) })
  on('classic.PostToolUse', async ($, e, next) => { await _count($, 'classic.PostToolUse'); return next(e) })
  on('classic.PostToolUseFailure', async ($, e, next) => { await _count($, 'classic.PostToolUseFailure'); return next(e) })
  on('classic.PreCompact', async ($, e, next) => { await _count($, 'classic.PreCompact'); return next(e) })
  on('classic.Stop', async ($, e, next) => { await _count($, 'classic.Stop'); return next(e) })
  on('classic.SessionEnd', async ($, e, next) => { await _count($, 'classic.SessionEnd'); return next(e) })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!isBandOn) return next(e)
    const { Box, Link, Text } = $.ui.resolve(e)
    const id = (await $.session.id()).slice(0, 8)
    return (
      <Box key="feas-band">
        <Text>feas-field band sid={id} starts={cur.counts['session.start'] ?? 0} </Text>
        <Link href="https://example.com/" label="example.com を開く" />
      </Box>
    )
  })
}
