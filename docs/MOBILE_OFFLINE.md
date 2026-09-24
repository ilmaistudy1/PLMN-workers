# Mobile Offline App

## Install

Open:

`https://plmn-workers.vercel.app/mobile`

Sign in while online and allow the initial sync to finish. On Android Chrome, use the browser's Install app / Add to Home screen action. The same URL can be shared through WhatsApp.

## Offline behavior

After the first successful sync, the mobile route keeps an encrypted IndexedDB snapshot of the authorized member, area and member-role data. Search and the core member workflow continue without internet access.

Supported offline actions:

- search cached members;
- add member;
- edit member;
- archive member;
- inspect cached areas and roles.

Changes are queued and pushed when the device is online again.

## Conflicts

If the server record changed after the device last synced it, the update is not silently overwritten. The Sync screen offers:

- Use server version
- Keep my version and explicitly overwrite the server record

## Security

Only data visible to the current authenticated account through Supabase RLS is synchronized. The mobile cache is encrypted using Web Crypto AES-GCM. Signing out clears the local cache.

The offline cache is still sensitive application data. Device screen lock and OS-level device encryption should remain enabled.

## APK / Play Store

This implementation is a PWA, so Play Store publication is not required. It can be distributed by its HTTPS URL.

A native Android APK wrapper can be added later without replacing the offline data/sync layer.
