import type { EngineInterface, HttpInit, Register } from 'claude-code'

const COMMAND = 'g4b'
const GEN = Math.random().toString(36).slice(2, 8)

async function _cfg($: EngineInterface) {
  return {
    end: (await $.env.get('G4B_END')) ?? 'none',
    url: (await $.env.get('G4B_URL')) ?? '',
    size: Number((await $.env.get('G4B_SIZE')) ?? '1000'),
    timeoutMs: Number((await $.env.get('G4B_TIMEOUT_MS')) ?? '0'),
    out: (await $.env.get('G4B_OUT')) ?? '',
    every: Number((await $.env.get('G4B_EVERY_MS')) ?? '0'),
    sender: (await $.env.get('G4B_SENDER')) ?? '',
    extendEnd: (await $.env.get('G4B_EXTEND_END_MS')) ?? '',
  }
}

function _log($: EngineInterface, text: string): void {
  $.ui.log(`g4b[${GEN}] ${text}`, { to: 'debug' })
}

function _body(size: number): string {
  const lines: string[] = []
  let n = 0
  let bytes = 0
  while (bytes < size) {
    const line = JSON.stringify({ kind: 'event', i: n, text: '日本語テキスト😀 é ü', pad: 'x'.repeat(200) }) + '\n'
    lines.push(line)
    bytes += new TextEncoder().encode(line).length
    n += 1
  }
  return lines.join('')
}

function _describe(err: unknown): string {
  if (!(err instanceof Error)) return `non-Error ${typeof err} ${String(err)}`
  const extra: Record<string, unknown> = {}
  for (const k of Object.getOwnPropertyNames(err)) {
    if (k !== 'stack') extra[k] = (err as unknown as Record<string, unknown>)[k]
  }
  return JSON.stringify({ name: err.name, ctor: err.constructor?.name, message: err.message, props: extra, cause: String((err as { cause?: unknown }).cause) })
}

async function _fetchWithTimeout($: EngineInterface, url: string, init: HttpInit, ms: number) {
  if (ms <= 0) return $.http.fetch(url, init)
  let timer: { cancel: () => void } | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = $.clock.after(ms, () => reject(new Error(`timeout ${ms}ms`)))
  })
  try {
    return await Promise.race([$.http.fetch(url, init), timeout])
  } finally {
    timer?.cancel()
  }
}

async function _send($: EngineInterface, where: string): Promise<string> {
  const c = await _cfg($)
  const body = _body(c.size)
  const t0 = await $.clock.now()
  _log($, `${where}: send start url=${c.url} chars=${body.length} timeoutMs=${c.timeoutMs}`)
  try {
    const res = await _fetchWithTimeout($, c.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-ndjson', 'X-Ingest-Token': 'tok-g4b-123' },
      body,
    }, c.timeoutMs)
    const msg = `${where}: send done status=${res.status} ms=${(await $.clock.now()) - t0}`
    _log($, msg)
    return msg
  } catch (err) {
    const msg = `${where}: send threw ms=${(await $.clock.now()) - t0} ${_describe(err)}`
    _log($, msg)
    return msg
  }
}

async function _detach($: EngineInterface, where: string): Promise<string> {
  const c = await _cfg($)
  const t0 = await $.clock.now()
  const script = `nohup python3 '${c.sender}' '${c.url}' '${c.out}' >/dev/null 2>&1 </dev/null &`
  try {
    const r = await $.process.run(['sh', '-c', script], { timeoutMs: 5000 })
    const msg = `${where}: detach exit=${r.exitCode} ms=${(await $.clock.now()) - t0}`
    _log($, msg)
    return msg
  } catch (err) {
    const msg = `${where}: detach threw ms=${(await $.clock.now()) - t0} ${_describe(err)}`
    _log($, msg)
    return msg
  }
}

async function _lineCount($: EngineInterface, path: string): Promise<number> {
  if (!(await $.fs.exists(path))) return 0
  const text = await $.fs.read(path)
  return typeof text === 'string' ? text.split('\n').filter((l) => l !== '').length : -1
}

async function _command($: EngineInterface, args: string): Promise<string> {
  const [op, ...rest] = args.trim().split(/\s+/)
  const c = await _cfg($)
  const sid = await $.session.id()
  switch (op) {
    case 'send':
      return _send($, 'command')
    case 'detach':
      return _detach($, 'command')
    case 'bgnoredir': {
      const t0 = await $.clock.now()
      try {
        const r = await $.process.run(['sh', '-c', 'sleep 4 &'], { timeoutMs: 10000 })
        return `bgnoredir exit=${r.exitCode} ms=${(await $.clock.now()) - t0}`
      } catch (err) {
        return `bgnoredir threw ms=${(await $.clock.now()) - t0} ${_describe(err)}`
      }
    }
    case 'err': {
      try {
        const r = await $.http.fetch(rest[0], { method: 'POST', body: 'x' })
        return `status=${r.status} ok=${r.ok} text=${r.text.slice(0, 80)}`
      } catch (err) {
        return `threw ${_describe(err)}`
      }
    }
    case 'qstore': {
      const n = Number(rest[0])
      const key = rest[1] === 'shared' ? 'q:shared' : `q:${sid}`
      _log($, `qstore begin t=${await $.clock.now()}`)
      for (let i = 0; i < n; i++) {
        const cur = ((await $.store.get(key)) as string[] | undefined) ?? []
        await $.store.set(key, [...cur, `${sid}:${i}`])
      }
      return `qstore key=${key} wrote=${n} now=${(((await $.store.get(key)) as string[]) ?? []).length} t=${await $.clock.now()}`
    }
    case 'qfs': {
      const n = Number(rest[0])
      const path = `${c.out}/queue/${sid}.jsonl`
      let text = ''
      _log($, `qfs begin t=${await $.clock.now()}`)
      for (let i = 0; i < n; i++) {
        text += JSON.stringify({ sid, i }) + '\n'
        await $.fs.write(path, text)
      }
      return `qfs path=${path} wrote=${n} now=${await _lineCount($, path)} t=${await $.clock.now()}`
    }
    case 'count': {
      const keys = await $.store.keys()
      let total = 0
      const per: string[] = []
      for (const k of keys.filter((x) => x.startsWith('q:'))) {
        const v = ((await $.store.get(k)) as string[] | undefined) ?? []
        total += v.length
        per.push(`${k.slice(2, 10)}=${v.length}`)
      }
      const dir = `${c.out}/queue`
      let fsTotal = 0
      const fsPer: string[] = []
      if (await $.fs.exists(dir)) {
        for (const e of await $.fs.list(dir)) {
          const n = await _lineCount($, `${dir}/${e.name}`)
          fsTotal += n
          fsPer.push(`${e.name.slice(0, 8)}=${n}`)
        }
      }
      return `store keys=${keys.length} q-total=${total} [${per.join(' ')}]\nfs files=${fsPer.length} total=${fsTotal} [${fsPer.join(' ')}]`
    }
    case 'big': {
      const mib = Number(rest[0])
      await $.store.set('keep', 'keep-me')
      const before = (await $.store.keys()).length
      try {
        await $.store.set(rest[1] ?? 'big', 'y'.repeat(Math.floor(mib * 1024 * 1024)))
        return `big set ok mib=${mib} keys=${(await $.store.keys()).join(',')}`
      } catch (err) {
        const keep = await $.store.get('keep')
        const big = await $.store.get('big')
        return `big rejected ${_describe(err)} keysBefore=${before} keysAfter=${(await $.store.keys()).join(',')} keep=${String(keep)} bigLen=${typeof big === 'string' ? big.length : String(big)}`
      }
    }
    case 'sdel': {
      await $.store.delete(rest[0])
      return `sdel ${rest[0]} keys=${(await $.store.keys()).join(',')}`
    }
    case 'sclear': {
      for (const k of await $.store.keys()) await $.store.delete(k)
      return `cleared keys=${(await $.store.keys()).length}`
    }
    case 'fsbig': {
      const path = `${c.out}/big.txt`
      const mib = Number(rest[0])
      try {
        await $.fs.write(path, 'z'.repeat(Math.floor(mib * 1024 * 1024)))
        const st = await $.fs.stat(path)
        try {
          const t = await $.fs.read(path)
          return `fs write ok size=${st.size} read ok len=${(t as string).length}`
        } catch (err) {
          return `fs write ok size=${st.size} read threw ${_describe(err)}`
        }
      } catch (err) {
        return `fs write threw ${_describe(err)}`
      }
    }
    case 'ls': {
      const dir = rest[0]
      const out: string[] = []
      for (const e of await $.fs.list(dir)) {
        const st = await $.fs.stat(`${dir}/${e.name}`)
        out.push(`${e.name} kind=${e.kind} size=${e.size} mtime=${e.mtimeMs} stat.mtime=${st.mtimeMs} link=${e.isLink}`)
      }
      return out.join('\n')
    }
    case 'read': {
      try {
        const t = await $.fs.read(rest[0])
        return `read ok len=${(t as string).length}`
      } catch (err) {
        return `read threw ${_describe(err)}`
      }
    }
    case 'trunc': {
      await $.fs.write(rest[0], '')
      const st = await $.fs.stat(rest[0])
      return `trunc size=${st.size} exists=${await $.fs.exists(rest[0])}`
    }
    case 'rm': {
      try {
        const r = await $.process.run(['rm', '-f', '--', rest[0]])
        return `rm exit=${r.exitCode} exists=${await $.fs.exists(rest[0])}`
      } catch (err) {
        return `rm threw ${_describe(err)}`
      }
    }
    case 'legacy': {
      const cfgDir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${(await $.env.get('HOME')) ?? ''}/.claude`
      const path = `${cfgDir}/plugins/data/${rest[0]}/queue.jsonl`
      const pluginData = await $.env.get('CLAUDE_PLUGIN_DATA')
      try {
        const lines = await _lineCount($, path)
        return `legacy path=${path} lines=${lines} CLAUDE_PLUGIN_DATA=${String(pluginData)} root=${$.plugin.root}`
      } catch (err) {
        return `legacy threw ${_describe(err)}`
      }
    }
    default:
      return `gen=${GEN} unknown op=${op}`
  }
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: COMMAND, description: 'g4b の検証操作' })
    const c = await _cfg($)
    _log($, `session.start interactive=${e.isInteractive}`)
    if (c.extendEnd !== '') {
      await $.env.set('CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS', c.extendEnd)
      _log($, `set CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS=${c.extendEnd}`)
    }
    if (c.every > 0) {
      $.clock.every(c.every, () => {
        void $.clock.now().then((t) => {
          _log($, `every tick t=${t}`)
          return $.http.fetch(`${c.url}?gen=${GEN}`, { method: 'POST', body: `tick ${GEN} ${t}` })
        }).catch(() => undefined)
      })
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    const c = await _cfg($)
    _log($, `session.end reason=${e.reason} budget.ms=${next.budget.ms} remaining=${next.budget.remainingMs}`)
    if (c.end === 'send') await _send($, 'session.end')
    if (c.end === 'send3') for (const k of [1, 2, 3]) await _send($, `session.end#${k}`)
    if (c.end === 'detach') await _detach($, 'session.end')
    _log($, `session.end after remaining=${next.budget.remainingMs}`)
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => ({ text: await _command($, e.args) }))
}
