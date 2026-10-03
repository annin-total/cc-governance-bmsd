import type { EngineInterface, Register } from 'claude-code'

type Rec = Record<string, unknown>

// 書き込み先はすべてこの下に限る。隔離 CLAUDE_CONFIG_DIR と記録先の両方を検査する
const SAFE = '/private/tmp/claude-501/-Users-terasawayuki-Documents-program-Development-bmsd-governance/f992ce3b-129e-420b-8958-71bb1bc1dc77/scratchpad/g4c/'
const COMMAND = 'feas4c'
const BIG_CHARS = 3_500_000
const BIG_ROUNDS = 10
const SET: Rec = {
  'env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE': '60',
  'extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate': true,
  autoUpdatesChannel: 'latest',
  'env.DISABLE_AUTOUPDATER': '0',
  'env.DISABLE_UPDATES': '0',
  'env.CLAUDE_CODE_PACKAGE_MANAGER_AUTO_UPDATE': '1',
}

let seq = 0

function _guard(path: string): string {
  if (!path.startsWith(SAFE)) throw new Error(`refused: ${path} is outside SAFE`)
  return path
}

function _err(err: unknown): Rec {
  const e = err as { name?: string; code?: string; message?: string }
  return { error: String(err), name: e?.name, code: e?.code }
}

async function _cfg($: EngineInterface): Promise<string> {
  const cfg = await $.env.get('CLAUDE_CONFIG_DIR')
  if (!cfg) throw new Error('CLAUDE_CONFIG_DIR is unset')
  return _guard(`${cfg.replace(/\/$/, '')}/`).replace(/\/$/, '')
}

async function _out($: EngineInterface, name: string, rec: Rec): Promise<void> {
  try {
    const dir = await $.env.get('FEAS_OUT')
    $.ui.log(`FEAS4C ${name} ${JSON.stringify(rec).slice(0, 600)}`, { to: 'debug' })
    if (!dir) return
    const path = _guard(`${dir}/mod-${Date.now()}-${String(++seq).padStart(3, '0')}-${name}.json`)
    await $.fs.write(path, `${JSON.stringify({ side: 'mod', name, at: Date.now(), ...rec }, null, 1)}\n`)
  } catch (err) {
    $.ui.log(`FEAS4C out failed: ${String(err)}`, { to: 'debug' })
  }
}

async function _stat($: EngineInterface, path: string): Promise<unknown> {
  try { return await $.fs.stat(path, { resolve: true }) } catch (err) { return _err(err) }
}

async function _try(f: () => Promise<unknown>): Promise<unknown> {
  try { return { ok: await f() } } catch (err) { return _err(err) }
}

async function _mv($: EngineInterface, src: string, dst: string): Promise<unknown> {
  return _try(() => $.process.run(['mv', '-f', _guard(src), _guard(dst)], { timeoutMs: 10000 }))
}

function _setPath(obj: Rec, path: string, value: unknown): void {
  const keys = path.split('.')
  let cur = obj
  for (const k of keys.slice(0, -1)) {
    if (typeof cur[k] !== 'object' || cur[k] === null || Array.isArray(cur[k])) cur[k] = {}
    cur = cur[k] as Rec
  }
  cur[keys[keys.length - 1]] = value
}

function _describe(text: unknown): Rec {
  if (typeof text !== 'string') return { type: typeof text }
  const head = [...text.slice(0, 4)].map((c) => c.codePointAt(0))
  let parsed: unknown
  try { parsed = { ok: JSON.parse(text) } } catch (err) { parsed = _err(err) }
  return { type: 'string', length: text.length, head, hasFFFD: text.includes('�'), parsed }
}

async function _markWrite($: EngineInterface, viaMv: boolean, real = false): Promise<Rec> {
  const cfg = await _cfg($)
  const link = `${cfg}/settings.json`
  const before = await _stat($, link)
  const path = real ? ((before as { realPath?: string }).realPath ?? link) : link
  const cur = await _try(async () => JSON.parse(await $.fs.read(path)))
  const data = ((cur as Rec).ok as Rec) ?? {}
  const mark = `mod-${Date.now()}`
  _setPath(data, 'env.FEAS_MARK', mark)
  const text = `${JSON.stringify(data, null, 2)}\n`
  const t0 = Date.now()
  const write = viaMv
    ? await _try(async () => { await $.fs.write(_guard(`${path}.modtmp`), text); return _mv($, `${path}.modtmp`, path) })
    : await _try(() => $.fs.write(_guard(path), text))
  return { path, mark, before, write, ms: Date.now() - t0, after: await _stat($, link) }
}

async function _big($: EngineInterface, viaMv: boolean): Promise<Rec> {
  const cfg = await _cfg($)
  const path = `${cfg}/big/big.json`
  const chars = Number((await $.env.get('FEAS_BIGN')) ?? BIG_CHARS)
  const rounds = Number((await $.env.get('FEAS_ROUNDS')) ?? BIG_ROUNDS)
  // FEAS_BIGMIX=1 のとき b を 1/1000 の長さにして、長さの違う上書きで途中が見えるかを見る
  const mix = (await $.env.get('FEAS_BIGMIX')) === '1'
  const texts = ['a', 'b'].map((c) => `{"k":"${c.repeat(c === 'b' && mix ? Math.floor(chars / 1000) : chars)}"}\n`)
  const times: number[] = []
  for (let i = 0; i < rounds * 2; i++) {
    const t0 = Date.now()
    if (viaMv) {
      await $.fs.write(_guard(`${path}.tmp`), texts[i % 2])
      await _mv($, `${path}.tmp`, path)
    } else {
      await $.fs.write(_guard(path), texts[i % 2])
    }
    times.push(Date.now() - t0)
  }
  return { path, chars, rounds: rounds * 2, times: times.slice(0, 40) }
}

async function _reads($: EngineInterface): Promise<Rec> {
  const cfg = await _cfg($)
  const out: Rec = {}
  for (const name of ['bom.json', 'latin1.json', 'broken.json', 'missing.json', 'sjis.json']) {
    const p = `${cfg}/r/${name}`
    const text = await _try(() => $.fs.read(p))
    out[name] = 'ok' in (text as Rec) ? _describe((text as Rec).ok) : text
    out[`${name}:bytes`] = await _try(async () => ((await $.fs.read(p, { as: 'bytes' })) as { base64: string }).base64.slice(0, 40))
  }
  out.settingsUser = await _try(() => $.settings.read({ source: 'user' }))
  out.settingsMerged = await _try(async () => (await $.settings.read()).env)
  return out
}

async function _fmt($: EngineInterface): Promise<Rec> {
  const cfg = await _cfg($)
  const data = JSON.parse(await $.fs.read(`${cfg}/fmt/in.json`)) as Rec
  for (const [k, v] of Object.entries(SET)) _setPath(data, k, v)
  await $.fs.write(_guard(`${cfg}/fmt/out-js.json`), `${JSON.stringify(data, null, 2)}\n`)
  return { wrote: `${cfg}/fmt/out-js.json` }
}

async function _perm($: EngineInterface): Promise<Rec> {
  const cfg = await _cfg($)
  const d = `${cfg}/perm`
  const out: Rec = {}
  out.newInNewDir = await _try(() => $.fs.write(_guard(`${d}/sub/new.json`), '{}\n'))
  out.overwrite600 = await _try(() => $.fs.write(_guard(`${d}/exist600.json`), '{"x":1}\n'))
  out.existsBefore = await $.fs.exists(`${d}/excl.json`)
  out.excl1 = await _try(() => $.fs.write(_guard(`${d}/excl.json`), 'first\n'))
  out.excl2 = await _try(() => $.fs.write(_guard(`${d}/excl.json`), 'second\n'))
  out.list = await _try(() => $.fs.list(d))
  out.rm = await _try(() => $.process.run(['rm', '-f', _guard(`${d}/todelete.json`)]))
  out.rmExists = await $.fs.exists(`${d}/todelete.json`)
  return out
}

async function _mtime($: EngineInterface): Promise<Rec> {
  const cfg = await _cfg($)
  const a = (await $.fs.stat(`${cfg}/mt/a.json`)) as { mtimeMs: number }
  const b = (await $.fs.stat(`${cfg}/mt/b.json`)) as { mtimeMs: number }
  const l = await $.fs.list(`${cfg}/mt`)
  return { a: String(a.mtimeMs), b: String(b.mtimeMs), equal: a.mtimeMs === b.mtimeMs, list: l.map((x) => [x.name, String(x.mtimeMs)]) }
}

async function _decode($: EngineInterface): Promise<Rec> {
  const cfg = await _cfg($)
  const out: Rec = { hasTextDecoder: typeof TextDecoder, hasFromBase64: typeof (Uint8Array as unknown as Rec).fromBase64 }
  for (const name of ['bom.json', 'latin1.json', 'sjis.json']) {
    out[name] = await _try(async () => {
      const { base64 } = (await $.fs.read(`${cfg}/r/${name}`, { as: 'bytes' })) as { base64: string }
      const bytes = (Uint8Array as unknown as { fromBase64: (s: string) => Uint8Array }).fromBase64(base64)
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes).slice(0, 30)
    })
  }
  return out
}

// 書き込みと置き換えだけを外部の Python に任せる案。本文は stdin で渡す
const PY_REPLACE = 'import os,sys,tempfile\nd=os.path.dirname(sys.argv[1])\nfd,t=tempfile.mkstemp(dir=d,prefix=".settings-",suffix=".tmp")\nwith os.fdopen(fd,"wb") as f: f.write(sys.stdin.buffer.read())\nos.replace(t,sys.argv[1])\n'

async function _pyReplace($: EngineInterface): Promise<Rec> {
  const cfg = await _cfg($)
  const st = (await $.fs.stat(`${cfg}/settings.json`, { resolve: true })) as { realPath?: string }
  const real = _guard(st.realPath ?? `${cfg}/settings.json`)
  const text = `${JSON.stringify({ env: { FEAS_MARK: `pyrep-${Date.now()}`, JP: '日本語' } }, null, 2)}\n`
  const r = await _try(() => $.process.run(['python3', '-c', PY_REPLACE, real], { stdin: text, timeoutMs: 10000 }))
  return { real, r, after: await _stat($, `${cfg}/settings.json`) }
}

// O_EXCL・0600 の代わり: sh の noclobber（set -C）は O_EXCL で開く
async function _excl($: EngineInterface): Promise<Rec> {
  const cfg = await _cfg($)
  const p = _guard(`${cfg}/perm/backup-excl.json`)
  const argv = ['sh', '-c', 'umask 077; set -C; cat > "$1"', 'sh', p]
  const first = await _try(() => $.process.run(argv, { stdin: '{"b":1}\n' }))
  const second = await _try(() => $.process.run(argv, { stdin: '{"b":2}\n' }))
  return { first, second, content: await $.fs.read(p) }
}

async function _run($: EngineInterface, where: string, name: string): Promise<void> {
  const tbl: Record<string, () => Promise<Rec>> = {
    write: () => _markWrite($, false),
    writemv: () => _markWrite($, true),
    writereal: () => _markWrite($, false, true),
    writemvreal: () => _markWrite($, true, true),
    big: () => _big($, false),
    bigmv: () => _big($, true),
    reads: () => _reads($),
    fmt: () => _fmt($),
    perm: () => _perm($),
    mtime: () => _mtime($),
    decode: () => _decode($),
    excl: () => _excl($),
    pyreplace: () => _pyReplace($),
    settings: async () => ({ user: await _try(() => $.settings.read({ source: 'user' })), merged: await _try(() => $.settings.read()) }),
  }
  const f = tbl[name]
  if (!f) return
  const t0 = Date.now()
  try {
    await _out($, `${where}-${name}`, { ...(await f()), elapsed: Date.now() - t0 })
  } catch (err) {
    await _out($, `${where}-${name}-failed`, _err(err))
  }
}

async function _probe($: EngineInterface, ev: string, e: Rec): Promise<void> {
  const rec: Rec = { source: e.source, file_path: e.file_path }
  rec.envFEAS_MARK = await _try(() => $.env.get('FEAS_MARK'))
  rec.mergedFEAS_MARK = await _try(async () => ((await $.settings.read()).env as Rec | undefined)?.FEAS_MARK)
  rec.userFEAS_MARK = await _try(async () => ((await $.settings.read({ source: 'user' })).env as Rec | undefined)?.FEAS_MARK)
  await _out($, `probe-${ev}`, rec)
}

async function _scn($: EngineInterface): Promise<[string, string]> {
  const v = (await $.env.get('FEAS_SCN')) ?? ''
  const [where, name] = v.split(':')
  return [where ?? '', name ?? '']
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({ name: COMMAND, description: 'feas-set の検証を実行する' })
      const [where, name] = await _scn($)
      if (where === 'ss') await _run($, 'ss', name)
    } catch (err) {
      $.ui.log(`FEAS4C session.start failed: ${String(err)}`, { to: 'debug' })
    }
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const name = String((e as Rec).args ?? '').trim()
    if (name === 'probe') await _probe($, 'cmd', {})
    else await _run($, 'cmd', name)
    return { text: `feas4c ${name} done` }
  })

  on('classic.SessionStart', async ($, e, next) => {
    const [where, name] = await _scn($)
    if (where === 'cs') await _run($, 'cs', name)
    await _probe($, 'SessionStart', e as Rec)
    return next(e)
  })
  on('classic.UserPromptSubmit', async ($, e, next) => { await _probe($, 'UserPromptSubmit', e as Rec); return next(e) })
  on('classic.ConfigChange', async ($, e, next) => { await _probe($, 'ConfigChange', e as Rec); return next(e) })
}
