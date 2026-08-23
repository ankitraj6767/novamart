import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { loadServerEnv } from '@novamart/config';

/**
 * Redis: cache, rate limits, counters, short-lived coordination.
 *
 * Never the source of truth for payments, orders, inventory or settlements. Every read
 * path here degrades gracefully: if Redis is down the request falls through to
 * Postgres rather than failing, because a cache outage must not become an outage.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly env = loadServerEnv();
  private client!: Redis;
  private available = false;

  onModuleInit(): void {
    this.client = new Redis(this.env.REDIS_URL, {
      keyPrefix: this.env.REDIS_KEY_PREFIX,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: false,
      ...(this.env.REDIS_TLS ? { tls: {} } : {}),
      retryStrategy: (times) => Math.min(times * 200, 3_000),
    });

    this.client.on('ready', () => {
      this.available = true;
      this.logger.log('Redis connected');
    });
    this.client.on('error', (error) => {
      if (this.available) this.logger.warn(`Redis error: ${error.message}`);
      this.available = false;
    });
    this.client.on('close', () => {
      this.available = false;
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit().catch(() => this.client?.disconnect());
  }

  get isAvailable(): boolean {
    return this.available;
  }

  get raw(): Redis {
    return this.client;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.available) return null;
    try {
      const value = await this.client.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    if (!this.available) return;
    try {
      const payload = JSON.stringify(value);
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, payload, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, payload);
      }
    } catch {
      /* Cache writes are best-effort by design. */
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!this.available || keys.length === 0) return;
    try {
      await this.client.del(...keys);
    } catch {
      /* ignore */
    }
  }

  /**
   * Cache-aside with a single-flight guard. Without the guard, a cold key under load
   * sends every concurrent request to Postgres at once (a cache stampede).
   */
  async remember<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const value = await loader();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  async invalidatePrefix(prefix: string): Promise<void> {
    if (!this.available) return;
    try {
      // SCAN rather than KEYS: KEYS blocks the server for the duration of the sweep.
      const stream = this.client.scanStream({
        match: `${this.env.REDIS_KEY_PREFIX}${prefix}*`,
        count: 200,
      });
      const batch: string[] = [];
      for await (const keys of stream as AsyncIterable<string[]>) {
        for (const key of keys) {
          batch.push(key.slice(this.env.REDIS_KEY_PREFIX.length));
        }
        if (batch.length >= 500) {
          await this.client.del(...batch.splice(0, batch.length));
        }
      }
      if (batch.length > 0) await this.client.del(...batch);
    } catch {
      /* ignore */
    }
  }

  /**
   * Fixed-window rate limit. Fails open when Redis is unavailable: an unavailable
   * limiter must not lock every customer out of checkout.
   */
  async consumeRateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; remaining: number; resetSeconds: number }> {
    if (!this.available) {
      return { allowed: true, remaining: limit, resetSeconds: windowSeconds };
    }
    try {
      const bucket = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
      const pipeline = this.client.multi();
      pipeline.incr(bucket);
      pipeline.expire(bucket, windowSeconds);
      const results = await pipeline.exec();
      const count = Number(results?.[0]?.[1] ?? 0);
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        resetSeconds: windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds),
      };
    } catch {
      return { allowed: true, remaining: limit, resetSeconds: windowSeconds };
    }
  }

  async healthy(): Promise<boolean> {
    if (!this.available) return false;
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}
