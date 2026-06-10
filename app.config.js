export default {
  name: "Galla",
  slug: "enterprise-inventory-pos",
  version: "1.0.0",
  orientation: "default",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  assetBundlePatterns: ["**/*"],
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.enterprise.inventorypos",
  },
  android: {
    package: "com.enterprise.inventorypos",
    softwareKeyboardLayoutMode: "resize",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#ffffff",
    },
  },
  web: { bundler: "metro", favicon: "./assets/favicon.png" },
  plugins: [
    "expo-router",
    ["expo-camera", { cameraPermission: "Allow $(PRODUCT_NAME) to access your camera to scan barcodes." }],
    ["expo-image-picker", { photosPermission: "Allow $(PRODUCT_NAME) to access your photos to attach product, layout and store images.", cameraPermission: "Allow $(PRODUCT_NAME) to use the camera to capture product images." }],
    ["expo-splash-screen", { image: "./assets/splash-icon.png", imageWidth: 180, resizeMode: "contain", backgroundColor: "#ffffff", dark: { backgroundColor: "#020617" } }],
    ["expo-speech-recognition", { microphonePermission: "Allow Galla to use the microphone for voice search.", speechRecognitionPermission: "Allow Galla to recognize speech for voice search.", androidSpeechServicePackages: ["com.google.android.googlequicksearchbox"] }],
  ],
  scheme: "enterprise-inventory-pos",
  experiments: { typedRoutes: true, tsconfigPaths: true },
  extra: {
    eas: {
      projectId: "d8a279fc-4531-48dd-834f-59a503e3d36d",
    },
  },
};
