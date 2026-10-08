// Platformová vrstva: na Androide natívne pluginy Capacitor, v prehliadači webové API.
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { KeepAwake } from "@capacitor-community/keep-awake";

const isNative = Capacitor.isNativePlatform();

export const storage = {
  async get(key) {
    if (isNative) {
      const { value } = await Preferences.get({ key });
      return value;
    }
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  },
  async set(key, value) {
    if (isNative) return Preferences.set({ key, value });
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
  },
};

let webLock = null;

export async function keepScreenOn() {
  try {
    if (isNative) return await KeepAwake.keepAwake();
    if ("wakeLock" in navigator) webLock = await navigator.wakeLock.request("screen");
  } catch (e) {}
}

export async function allowScreenOff() {
  try {
    if (isNative) return await KeepAwake.allowSleep();
    await webLock?.release();
    webLock = null;
  } catch (e) {}
}
