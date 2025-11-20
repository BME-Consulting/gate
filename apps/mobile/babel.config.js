module.exports = function (api) {
    api.cache(true);
    return {
        presets: ['babel-preset-expo'],
        plugins: [
            // expo-routerに必須
            'expo-router/babel',
        ],
    };
};
