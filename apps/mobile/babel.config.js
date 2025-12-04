module.exports = function (api) {
    api.cache(true);
    return {
        presets: ['babel-preset-expo'],
        plugins: [
            // worklets-core plugin removed - not using frame processors
        ],
    };
};
