export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestNotifPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const res = await Notification.requestPermission();
  return res === "granted";
}

export function showNotification(title: string, body: string) {
  if (!notificationsSupported() || Notification.permission !== "granted")
    return;
  try {
    new Notification(title, { body, icon: "/icons/icon-192.png" });
  } catch {
    // Some platforms (Android Chrome) require SW-based notifications
    navigator.serviceWorker?.ready
      .then((reg) =>
        reg.showNotification(title, { body, icon: "/icons/icon-192.png" }),
      )
      .catch(() => {});
  }
}

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // haptics unsupported — ignore
  }
}
