const redis = require('./redis');
const { promisify } = require('util');

class RedisClient {
    constructor() {
        this.client = redis.createClient({
            host: process.env.REDIS_HOST,
            port: process.env.REDIS_PORT,
        });

        this.getAsync = promisify(this.client.get).bind(this.client);
        this.setAsync = promisify(this.client.set).bind(this.client);
        this.delAsync = promisify(this.client.del).bind(this.client);
        this.client.on('error', (err) => console.log(err));
    }

    isAlive () {
        return this.client.connected;
    }

    async get(key) {
        return this.getAsync(key);
    }

    async set(key, value, duration) {
        return this.setAsync(key, value, 'EX', duration);
    }

    async del(key) {
        return this.delAsync(key);
    }
}

module.exports = RedisClient;
