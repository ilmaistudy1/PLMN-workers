export type MobileArea = {
  id: string;
  parent_id: string | null;
  name: string;
  level: string;
  is_active: boolean;
};

export type MobileRole = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

export type MobileMember = {
  id: string;
  full_name: string;
  primary_phone: string | null;
  alternate_phone: string | null;
  address_details: string | null;
  area_id: string;
  area_name: string;
  area_level: string;
  member_role_id: string;
  member_role_name: string;
  status: "active" | "inactive" | "archived";
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PendingChange = {
  id: string;
  op: "create" | "update";
  member_id: string;
  payload: Partial<MobileMember>;
  base_updated_at: string | null;
  created_at: string;
  status: "pending" | "conflict" | "error";
  error_message: string | null;
};

export type MobileState = {
  user_id: string | null;
  email: string | null;
  members: MobileMember[];
  areas: MobileArea[];
  roles: MobileRole[];
  pending: PendingChange[];
  last_sync_at: string | null;
};

type EncryptedState = {
  iv: string;
  cipher_text: string;
};

const DB_NAME = "plmn-workers-mobile";
const DB_VERSION = 1;
const KEY_STORE = "keys";
const STATE_STORE = "state";

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE);
      if (!db.objectStoreNames.contains(STATE_STORE)) db.createObjectStore(STATE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open local database."));
  });
}

async function getVaultKey(): Promise<CryptoKey> {
  const db = await openDatabase();
  const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, "readonly");
    const request = tx.objectStore(KEY_STORE).get("vault-key");
    request.onsuccess = () => resolve(request.result as CryptoKey | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();

  if (existing) return existing;

  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );

  const writeDb = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = writeDb.transaction(KEY_STORE, "readwrite");
    tx.objectStore(KEY_STORE).put(key, "vault-key");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  writeDb.close();
  return key;
}

export async function emptyMobileState(): Promise<MobileState> {
  return {
    user_id: null,
    email: null,
    members: [],
    areas: [],
    roles: [],
    pending: [],
    last_sync_at: null,
  };
}

export async function readMobileState(): Promise<MobileState> {
  const db = await openDatabase();
  const stored = await new Promise<EncryptedState | undefined>((resolve, reject) => {
    const tx = db.transaction(STATE_STORE, "readonly");
    const request = tx.objectStore(STATE_STORE).get("current");
    request.onsuccess = () => resolve(request.result as EncryptedState | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();

  if (!stored) return emptyMobileState();

  const key = await getVaultKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(stored.iv) },
    key,
    base64ToBytes(stored.cipher_text),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as MobileState;
}

export async function writeMobileState(state: MobileState) {
  const key = await getVaultKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(state));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);

  const stored: EncryptedState = {
    iv: bytesToBase64(iv),
    cipher_text: bytesToBase64(new Uint8Array(cipher)),
  };

  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STATE_STORE, "readwrite");
    tx.objectStore(STATE_STORE).put(stored, "current");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function clearMobileState() {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STATE_STORE, KEY_STORE], "readwrite");
    tx.objectStore(STATE_STORE).clear();
    tx.objectStore(KEY_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export function normalizePhone(value: string | null | undefined) {
  return (value ?? "").replace(/[^0-9]+/g, "");
}
