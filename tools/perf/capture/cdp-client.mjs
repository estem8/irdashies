export class CDP {
  serial = 0;
  pending = new Map();
  events = new Map();
  constructor(ws) {
    this.ws = ws;
    ws.addEventListener('message', ({ data }) => {
      const msg = JSON.parse(data);
      if (msg.id) {
        const item = this.pending.get(msg.id);
        if (!item) return;
        this.pending.delete(msg.id);
        clearTimeout(item.timeout);
        if (msg.error) item.reject(new Error(JSON.stringify(msg.error)));
        else item.resolve(msg.result);
      } else for (const cb of this.events.get(msg.method) ?? []) cb(msg.params);
    });
    ws.addEventListener('close', () => {
      for (const item of this.pending.values()) {
        clearTimeout(item.timeout);
        item.reject(new Error('CDP closed'));
      }
      this.pending.clear();
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    return new CDP(ws);
  }
  call(method, params = {}) {
    const id = ++this.serial;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout: ${method}`));
      }, 60_000);
      this.pending.set(id, { resolve, reject, timeout });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  event(method) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.events.delete(method);
        reject(new Error(`Timeout event: ${method}`));
      }, 60_000);
      this.events.set(method, [
        (params) => {
          clearTimeout(timeout);
          this.events.delete(method);
          resolve(params);
        },
      ]);
    });
  }
  async evaluate(expression) {
    const result = await this.call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
}
