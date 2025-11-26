module.exports = function (api) {
    api.cache(true);
    return {
        presets: ['babel-preset-expo'],
        plugins: [
            // react-native-vision-cameraのframe processorsに必須
            'react-native-worklets-core/plugin',
        ],
    };
};
