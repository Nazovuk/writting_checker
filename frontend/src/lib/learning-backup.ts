export type LearningBackupPayload = {
  version: 1;
  exportedAt: string;
  savedWords: string[];
  quizWords: string[];
};

export type PlainLearningBackup = {
  version: 1;
  encrypted: false;
  checksum: string;
  payload: LearningBackupPayload;
};

export type EncryptedLearningBackup = {
  version: 1;
  exportedAt: string;
  encrypted: true;
  checksum: string;
  salt: string;
  iv: string;
  cipher: string;
};

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function canonicalPayload(payload: LearningBackupPayload): LearningBackupPayload {
  return {
    version: 1,
    exportedAt: payload.exportedAt,
    savedWords: [...payload.savedWords],
    quizWords: [...payload.quizWords],
  };
}

export async function payloadChecksum(payload: LearningBackupPayload): Promise<string> {
  const json = JSON.stringify(canonicalPayload(payload));
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(json));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function isEncryptedBackup(value: unknown): value is EncryptedLearningBackup {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.encrypted === true &&
    typeof v.salt === "string" &&
    typeof v.iv === "string" &&
    typeof v.cipher === "string" &&
    typeof v.checksum === "string"
  );
}

export function isPlainBackup(value: unknown): value is PlainLearningBackup {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.encrypted === false && typeof v.checksum === "string" && typeof v.payload === "object";
}

export async function createPlainBackup(payload: LearningBackupPayload): Promise<PlainLearningBackup> {
  const normalized = canonicalPayload(payload);
  return {
    version: 1,
    encrypted: false,
    checksum: await payloadChecksum(normalized),
    payload: normalized,
  };
}

export async function encryptLearningBackup(payload: LearningBackupPayload, pin: string): Promise<EncryptedLearningBackup> {
  const normalized = canonicalPayload(payload);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(pin, salt);
  const data = new TextEncoder().encode(JSON.stringify(normalized));
  const cipherBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);

  return {
    version: 1,
    exportedAt: normalized.exportedAt,
    encrypted: true,
    checksum: await payloadChecksum(normalized),
    salt: toBase64(salt),
    iv: toBase64(iv),
    cipher: toBase64(new Uint8Array(cipherBuffer)),
  };
}

export async function decryptLearningBackup(envelope: EncryptedLearningBackup, pin: string): Promise<LearningBackupPayload> {
  const salt = fromBase64(envelope.salt);
  const iv = fromBase64(envelope.iv);
  const cipher = fromBase64(envelope.cipher);
  const key = await deriveAesKey(pin, salt);
  const plainBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  const plain = new TextDecoder().decode(plainBuffer);
  const payload = JSON.parse(plain) as LearningBackupPayload;
  const actual = await payloadChecksum(payload);
  if (actual !== envelope.checksum) {
    throw new Error("Backup checksum validation failed.");
  }
  return payload;
}

export async function extractPlainBackupPayload(value: unknown): Promise<LearningBackupPayload> {
  if (isPlainBackup(value)) {
    const actual = await payloadChecksum(value.payload);
    if (actual !== value.checksum) throw new Error("Backup checksum validation failed.");
    return value.payload;
  }

  // Backward compatibility with legacy plain payload format.
  const legacy = value as Partial<LearningBackupPayload>;
  if (legacy && Array.isArray(legacy.savedWords) && Array.isArray(legacy.quizWords)) {
    return {
      version: 1,
      exportedAt: typeof legacy.exportedAt === "string" ? legacy.exportedAt : new Date().toISOString(),
      savedWords: legacy.savedWords.filter((v): v is string => typeof v === "string"),
      quizWords: legacy.quizWords.filter((v): v is string => typeof v === "string"),
    };
  }

  throw new Error("Invalid backup format.");
}
