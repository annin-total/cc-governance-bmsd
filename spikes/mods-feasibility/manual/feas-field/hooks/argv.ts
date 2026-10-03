// detach の起動方法。「mod-py:」は mod → Python（detach_check.py launch）→ 送信役、「mod:」は mod が直接起動する
export const POSIX_METHODS = ['mod-py:popen', 'mod-py:nohup', 'mod:sh-nohup'] as const
export const WINDOWS_METHODS = [
  'mod-py:popen', 'mod-py:breakaway', 'mod-py:cmd-start', 'mod-py:start-process', 'mod-py:wmi', 'mod:start-process',
] as const

export const PYTHONS: readonly (readonly string[])[] = [['python3'], ['python'], ['py', '-3']]

export function detachArgv(method: string, py: string, script: string, dir: string): string[] {
  if (method === 'mod:sh-nohup') {
    return ['sh', '-c', 'nohup "$0" "$1" sleep "$2" "$3" >/dev/null 2>&1 </dev/null &', py, script, method, dir]
  }
  if (method === 'mod:start-process') {
    const args = [`'"${script}"'`, "'sleep'", `'${method}'`, `'"${dir}"'`].join(',')
    return ['powershell', '-NoProfile', '-NonInteractive', '-Command', `Start-Process -WindowStyle Hidden -FilePath '${py}' -ArgumentList ${args}`]
  }
  return [py, script, 'launch', method.slice('mod-py:'.length), dir, method]
}

// stdin で受けた文字列を、エンコーディングの情報と一緒に stdout へ返す（Python 3.9 で動く書き方にする）
export const PY_ECHO = [
  'import json, locale, sys',
  'mode = sys.argv[1]',
  "text = sys.stdin.read() if mode != 'buffer' else sys.stdin.buffer.read().decode('utf-8')",
  "out = json.dumps({'stdinEnc': sys.stdin.encoding, 'stdoutEnc': sys.stdout.encoding, 'preferred': locale.getpreferredencoding(False), 'utf8Mode': sys.flags.utf8_mode, 'echo': text}, ensure_ascii=False)",
  "sys.stdout.buffer.write(out.encode('utf-8')) if mode == 'buffer' else print(out)",
].join('\n')

// cp932 に無い文字（✓・𠮷）と、cp932 にある文字（日本語・é）を混ぜる
export const ECHO_SAMPLE = '設定の適用 é ✓ 𠮷'

export const ECHO_MODES = [
  { mode: 'text', env: {} },
  { mode: 'text', env: { PYTHONUTF8: '1' } },
  { mode: 'buffer', env: {} },
] as const
