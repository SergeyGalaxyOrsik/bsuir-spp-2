import { Repeater } from "graphql-yoga";
import type { Sql } from "./db.ts";
import type { Logger } from "./logger.ts";

/**
 * Cross-replica pub/sub on top of Postgres LISTEN/NOTIFY. Every replica receives every
 * notification, so subscriptions work no matter which replica a client is connected to.
 */
export class PgChannel {
  private listeners = new Set<(payload: string) => void>();
  private listening: Promise<unknown> | undefined;

  constructor(
    private readonly sql: Sql,
    private readonly channel: string,
    private readonly log: Logger,
  ) {}

  private ensureListening() {
    this.listening ??= this.sql
      .listen(
        this.channel,
        (payload) => this.listeners.forEach((fn) => fn(payload)),
        () => this.log.info({ channel: this.channel }, "listening for notifications"),
      )
      .catch((error: unknown) => {
        this.listening = undefined;
        throw error;
      });
    return this.listening;
  }

  subscribe(): AsyncIterable<string> {
    return new Repeater<string>(async (push, stop) => {
      await this.ensureListening();
      const fn = (payload: string) => void push(payload);
      this.listeners.add(fn);
      await stop;
      this.listeners.delete(fn);
    });
  }
}
