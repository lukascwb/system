module.exports = {
    database: {
        connectionPool: {
            max: 10,
            min: 2,
            acquire: 60000,
            idle: 30000,
            evict: 10000,
            handleDisconnects: true,
        },
        queryTimeout: 30000,
        logging: console.log, // Enable logging for debugging
    },
    rateLimiting: {
        searchApiDelay: 500, // milliseconds
        maxRetries: 5,
        retryDelay: 2000, // milliseconds
    },
    batchProcessing: {
        defaultBatchSize: 10,
        delayBetweenBatches: 3000, // milliseconds
    },
    cache: {
        amazonProductCacheDuration: 2592000000, // 1 month in milliseconds
    },
    performanceMonitoring: {
        enabled: true,
    },
};
