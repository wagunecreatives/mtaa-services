import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'MTAA SERVICES',
  slug: 'mtaa-services',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'mtaaservices',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,

  splash: {
    image: './assets/images/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#208AEF',
  },

  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.mtaaservices.app',
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'MTAA SERVICES needs your location to show nearby services.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'MTAA SERVICES needs your location to show nearby services.',
      NSCameraUsageDescription:
        'MTAA SERVICES needs camera access to take photos.',
      NSPhotoLibraryUsageDescription:
        'MTAA SERVICES needs access to your photos.',
      NSPhotoLibraryAddUsageDescription:
        'MTAA SERVICES needs permission to save photos.',
    },
  },

  android: {
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    package: 'com.mtaaservices.app',
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'CAMERA',
      'READ_EXTERNAL_STORAGE',
      'WRITE_EXTERNAL_STORAGE',
      'RECEIVE_BOOT_COMPLETED',
      'VIBRATE',
    ],
    predictiveBackGestureEnabled: false,
  },

  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/images/favicon.png',
  },

  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-status-bar',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#208AEF',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'Allow MTAA SERVICES to use your location.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow MTAA SERVICES to access your photos.',
        cameraPermission: 'Allow MTAA SERVICES to access your camera.',
      },
    ],
    [
      'expo-notifications',
      {
        color: '#ffffff',
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },

 extra: {
  router: {
    origin: false,
  },
  eas: {
    projectId: "4057c7be-debd-4217-a993-656ded4c441b",
  },
},
});