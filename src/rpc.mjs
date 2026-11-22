import { EventEmitter } from 'node:events';

// A transport is an owned duplex stream. Never retry a possibly delivered request.
export class Rpc extends EventEmitter {
  constructor(input, output, { timeout = 15000, maxBytes = 8 * 1024 * 1024 } = {}) {
    super(); this.input = input; this.output = output; this.timeout = timeout;
    this.pending = new Map(); this.nextId = 0; this.buffer = ''; this.closed = false;
    input.setEncoding('utf8');
    input.on('data', chunk => {
      if (this.closed) return;
      this.buffer += chunk;
      if (Buffer.byteLength(this.buffer) > maxBytes) return this.close('RPC_FRAME_LIMIT');
      let end;
      while ((end = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1);
        if (!line.trim()) continue;
        try { this.receive(JSON.parse(line)); } catch { this.close('RPC_INVALID_MESSAGE'); }
      }
    });
    input.on('end', () => this.close('RPC_DISCONNECTED'));
    input.on('error', () => this.close('RPC_IO_ERROR'));
    output.on('error', () => this.close('RPC_IO_ERROR'));
  }
  receive(m) {
    if (this.closed) return;
    if (!m || typeof m !== 'object' || Array.isArray(m)) throw Error('INVALID');
    if (typeof m.method === 'string') { this.emit(m.id === undefined ? 'notification' : 'request', m); return; }
    const p = this.pending.get(m.id);
    if (!p) return; // late or unsolicited responses never become a new request
    this.pending.delete(m.id); clearTimeout(p.timer);
    if (m.error) p.reject(Object.assign(Error('RPC_REJECTED'), { code: m.error.code }));
    else if ('result' in m) p.resolve(m.result);
    else p.reject(Error('RPC_INVALID_RESPONSE'));
  }
  send(message) {
    if (this.closed || this.output.destroyed) throw Error('RPC_DISCONNECTED');
    this.output.write(JSON.stringify(message) + '\n', error => { if (error) this.close('RPC_WRITE_FAILED'); });
  }
  call(method, params = {}) {
    if (this.closed) return Promise.reject(Error('RPC_DISCONNECTED'));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(Error('RPC_TIMEOUT_RESULT_UNKNOWN')); }, this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); } catch (e) { clearTimeout(timer); this.pending.delete(id); reject(e); }
    });
  }
  close(reason = 'RPC_DISCONNECTED') {
    if (this.closed) return;
    this.closed = true; this.buffer = '';
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(Error(reason)); }
    this.pending.clear(); this.emit('disconnect', reason);
  }
}
