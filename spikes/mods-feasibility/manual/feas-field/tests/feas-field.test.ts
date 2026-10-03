import { expect, mock, test } from 'claude-code/testing'
import { ECHO_SAMPLE } from '../hooks/argv'
import { errorCode, maskText } from '../hooks/mask'

const PROXY = 'http://someone:pw123@proxy.corp.invalid:8080'
// 秘密情報の検査に引っかからないよう、ダミーの値を連結で組み立てる
const TOKEN = ['sk', 'ant', 'api03', 'AbCdEf0123456789AbCdEf0123456789'].join('-')

async function _run($: any, args: string): Promise<string> {
  const out = await $.command.run({ command: 'feas-field', args } as never)
  return String(out.text)
}

test('info は値を伏せ、プロキシはスキームだけを出す', async ($, on) => {
  mock.store(on)
  mock.env(on, { HOME: '/Users/someone', HTTPS_PROXY: PROXY, CLAUDE_CODE_USE_BEDROCK: '1' })
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'host-a\n', stderr: '' } }) as never)
  const text = await _run($, 'info')
  expect(text).toContain('"CLAUDE_CODE_USE_BEDROCK": "1"')
  expect(text).toContain('set(http://…')
  expect(text).not.toContain('proxy.corp')
  expect(text).not.toContain('pw123')
  expect(text).not.toContain('host-a')
  expect(text).not.toContain('/Users/someone')
})

test('localhost 以外へは FEAS_ALLOW_REMOTE が無いと送らない', async ($, on) => {
  mock.env(on, {})
  const calls: string[] = []
  on('http.fetch', ($, e) => {
    calls.push(e.url)
    return { value: { status: 200, ok: true, headers: {}, text: '' } } as never
  })
  const text = await _run($, 'fetch POST https://receiver.invalid/ingest')
  expect(text).toMatch(/localhost 以外へは送らない/)
  expect(calls.length).toBe(0)
})

test('localhost への送信が失敗しても URL を出さない', async ($, on) => {
  mock.env(on, {})
  on('http.fetch', () => {
    throw new Error('$.http.fetch(http://127.0.0.1:18850/secret-path) failed: ECONNREFUSED: Unable to connect.')
  })
  const text = await _run($, 'fetch POST http://127.0.0.1:18850/secret-path')
  expect(text).toContain('"error":')
  expect(text).not.toContain('secret-path')
})

test('maskText はメールアドレス・12 桁の番号・トークンを伏せる', () => {
  const out = maskText(`a@example.com arn:aws:bedrock:us-east-1:123456789012:x ${TOKEN} CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS`)
  expect(out).not.toContain('a@example.com')
  expect(out).not.toContain('123456789012')
  expect(out).not.toContain(TOKEN)
  expect(out).toContain('CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS')
})

test('errorCode は本体の文言から符号だけを抜く', () => {
  const msg = 'HooksError: feas: $.http.fetch(https://receiver.invalid/x) failed: DEPTH_ZERO_SELF_SIGNED_CERT: self signed certificate'
  expect(errorCode(new Error(msg))).toBe('DEPTH_ZERO_SELF_SIGNED_CERT')
  expect(errorCode(new Error('feas: $.http.fetch(http://127.0.0.1:1/) failed: The operation timed out.'))).toBe('TIMEOUT')
})

test('py は Python が返した文字列が送ったものと一致したかを返す', async ($, on) => {
  mock.env(on, {})
  let echo = ECHO_SAMPLE
  on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify({ echo, stdoutEnc: 'cp932' }), stderr: '' } }) as never)
  expect(await _run($, 'py')).toContain('"eq": true')
  echo = '設定の適用 ? ? ?'
  const garbled = await _run($, 'py')
  expect(garbled).toContain('"eq": false')
  expect(garbled).not.toContain('"eq": true')
})
