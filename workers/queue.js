// workers/queue.js
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { URL } from 'url';

if (!process.env.REDIS_URL) {
    console.warn("⚠️ REDIS_URL not found. Job queue will not function.");
}

const getRedisConnectionOptions = () => {
    if (!process.env.REDIS_URL) {
        return null;
    }
    try {
        const redisUrl = new URL(process.env.REDIS_URL);
        const options = {
            host: redisUrl.hostname,
            port: parseInt(redisUrl.port, 10),
            password: redisUrl.password,
            ...(redisUrl.protocol === 'rediss:' ? { tls: {} } : {}),
            maxRetriesPerRequest: null,
        };
        console.log(`[Queue] Attempting to connect to Redis at ${options.host}:${options.port}`);
        return options;
    } catch (e) {
        console.error("[Queue] FATAL: Could not parse REDIS_URL.", e);
        return null;
    }
};

const connectionOptions = getRedisConnectionOptions();

export const QUEUE_CONFIG = {
    connection: connectionOptions ? new IORedis(connectionOptions) : null,
};

export const enrichmentQueue = QUEUE_CONFIG.connection
    ? new Queue('enrichment-queue', QUEUE_CONFIG)
    : null;

export const hiringSignalsQueue = QUEUE_CONFIG.connection
    ? new Queue('hiring-signals-queue', QUEUE_CONFIG)
    : null;