// F7 — Thin WebSocket client for alp-battle.
//
// Single shared socket per browser tab. Reconnects on accidental drops
// with a 2s backoff cap (long-form battle UX is wrecked by reconnect
// loops — better to surface the failure to the user).

import { auth } from "./api";

export interface BattleEnvelope<P = unknown> {
  t: string;
  p?: P;
}

type Handler = (env: BattleEnvelope) => void;

const BATTLE_WS_PATH = "/battle/v1/socket"; // proxied by nginx

class BattleClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private connecting = false;
  private retryDelayMs = 1000;

  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.connecting) return;
    this.connecting = true;
    try {
      const token = auth.getTokens?.()?.accessToken ?? "";
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const url = `${proto}://${window.location.host}${BATTLE_WS_PATH}?token=${encodeURIComponent(token)}`;
      this.ws = new WebSocket(url);
      await new Promise<void>((resolve, reject) => {
        if (!this.ws) {
          reject(new Error("no socket"));
          return;
        }
        this.ws.onopen = () => {
          this.retryDelayMs = 1000;
          resolve();
        };
        this.ws.onerror = () => reject(new Error("ws error"));
      });
      this.ws.onmessage = (ev) => {
        try {
          const env = JSON.parse(ev.data) as BattleEnvelope;
          this.handlers.forEach((h) => h(env));
        } catch {
          /* drop malformed */
        }
      };
      this.ws.onclose = () => {
        this.ws = null;
        // Schedule one reconnect; back off if it fails repeatedly.
        setTimeout(() => {
          this.connect().catch(() => {
            this.retryDelayMs = Math.min(this.retryDelayMs * 2, 10000);
          });
        }, this.retryDelayMs);
      };
    } finally {
      this.connecting = false;
    }
  }

  send<P>(t: string, p?: P): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ t, p }));
  }

  on(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  close(): void {
    this.handlers.clear();
    this.ws?.close();
    this.ws = null;
  }
}

export const battleClient = new BattleClient();
