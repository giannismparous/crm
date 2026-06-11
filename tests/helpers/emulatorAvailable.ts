import { createConnection } from "node:net";

export function isPortOpen(host: string, port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const done = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => done(true));
    socket.on("timeout", () => done(false));
    socket.on("error", () => done(false));
  });
}

export async function isFirestoreEmulatorUp(): Promise<boolean> {
  return isPortOpen("127.0.0.1", 8080);
}
