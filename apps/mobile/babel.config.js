module.exports = function (api) {
    api.cache(true);
    return {
        presets: ['babel-preset-expo'],
        plugins: [
            // expo-routerに必須
            'expo-router/babel',
            // react-native-vision-cameraのframe processorsに必須
            'react-native-worklets-core/plugin',
        ],
    };
};
