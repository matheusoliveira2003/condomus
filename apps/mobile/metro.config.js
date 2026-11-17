const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Modelos do TensorFlow Lite (reconhecimento facial) entram no app como arquivos.
config.resolver.assetExts.push("tflite");

module.exports = config;
