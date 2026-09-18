import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { notificationsApi } from '../api/notifications';

// How a notification is presented while the app is in the FOREGROUND - by
// default expo-notifications shows nothing while the app is open unless you
// set this. An amber/red alert is worth surfacing even while the app is
// already in front of the user.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Best-effort: registers this app installation for push and tells the
// backend the resulting Expo push token. NEVER throws - permission denial,
// no physical device (simulator/emulator has no push capability), or a
// missing Expo project configuration are all normal, silent no-ops here,
// not errors that should interrupt anything else in the app (same
// fail-soft philosophy as the rest of this codebase's ingestion/alert
// pipeline - see CLAUDE.md).
//
// One real, unavoidable platform constraint this can't work around: Expo
// Go on Android no longer supports remote push notifications at all as of
// recent SDKs (a Google Play policy change forced this, not an Expo or
// Firebase-credentials issue) - only a real development or production
// build (EAS) does. This will silently no-op on Android Expo Go, same as a
// denied permission. iOS via Expo Go should still work.
export async function registerForPushNotificationsAsync(): Promise<void> {
  try {
    if (!Device.isDevice) {
      console.log('[push] skipped - not a physical device (simulator/emulator)');
      return;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let finalStatus = existing.status;
    if (finalStatus !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      finalStatus = requested.status;
    }
    if (finalStatus !== 'granted') {
      console.log('[push] skipped - permission not granted');
      return;
    }

    // getExpoPushTokenAsync needs this explicitly - relying on it to infer
    // the projectId from the manifest is unreliable in Expo Go and throws
    // "No projectId found" if the app was never linked to an EAS project at
    // all (`npx eas-cli init` from frontend/, logged into an Expo account -
    // that login step is the user's to do, not something this code can do
    // for them). Passing it explicitly here at least makes the failure mode
    // the SAME clear error either way, rather than two different silent
    // failure paths depending on how the inference goes.
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.log(
        '[push] skipped - no EAS projectId configured. Run `npx eas-cli init` from frontend/ ' +
          '(requires an Expo account login) to link this app to a project, then restart the dev server.',
      );
      return;
    }

    const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
    await notificationsApi.registerPushToken(expoPushToken);
    console.log('[push] registered token with backend');
  } catch (err) {
    console.log('[push] registration skipped:', err instanceof Error ? err.message : err);
  }
}
