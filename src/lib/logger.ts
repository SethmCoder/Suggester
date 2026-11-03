type LogPayload = Record<string, unknown>;

export const logger = {
  info(event: string, payload?: LogPayload) {
    console.info(JSON.stringify({ level: "info", event, ...payload }));
  },
  warn(event: string, payload?: LogPayload) {
    console.warn(JSON.stringify({ level: "warn", event, ...payload }));
  },
  error(event: string, payload?: LogPayload) {
    console.error(JSON.stringify({ level: "error", event, ...payload }));
  },
};
