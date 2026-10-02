import type { Register } from 'claude-code'

export const register: Register = (on) => {
  on('classic.*', ($, e, next) => next.to(e, 'append'))
}
