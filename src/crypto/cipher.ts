import { SafetyFingerprint } from '../types';

const EMOJI_SET = [
  '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼',
  '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔',
  '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺',
  '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞',
  '🐢', '🐍', '🐙', '🦑', '🦐', '🦀', '🐡', '🐠',
  '🐬', '🐳', '🦈', '🐊', '🐆', '🐅', '🐘', '🦏',
  '🦛', '🐪', '🐫', '🦒', '🦘', '🌲', '🍀', '🍎',
  '🚀', '⭐', '💎', '🔔', '🛡️', '⚡', '🔥', '🔑'
];

// Generate high entropy random base64url string
export function generateRandomSecret(length = 32): string {
  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Convert ArrayBuffer to Base64
export function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Convert Base64 to ArrayBuffer
export function base64ToBuffer(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Fixed salt for consistent derivation from shared room secret
const FIXED_SALT = new TextEncoder().encode('CipherChat-P2P-ZeroServer-Salt-v1');

/**
 * Derives an AES-GCM 256-bit CryptoKey from a shared secret phrase using PBKDF2
 */
export async function deriveKeyFromSecret(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: FIXED_SALT,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true, // exportable for fingerprint hashing
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a string using AES-256-GCM with a cryptographically secure 96-bit random IV
 */
export async function encryptData(
  plaintext: string,
  key: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
  const enc = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV recommended for GCM

  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv
    },
    key,
    enc.encode(plaintext)
  );

  return {
    ciphertext: bufferToBase64(ciphertextBuffer),
    iv: bufferToBase64(iv)
  };
}

/**
 * Decrypts AES-256-GCM ciphertext
 */
export async function decryptData(
  ciphertext: string,
  iv: string,
  key: CryptoKey
): Promise<string> {
  const dec = new TextDecoder();
  const cipherBuffer = base64ToBuffer(ciphertext);
  const ivBuffer = base64ToBuffer(iv);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBuffer
    },
    key,
    cipherBuffer
  );

  return dec.decode(decryptedBuffer);
}

/**
 * Generates visual Safety Fingerprint (4 verification emojis + 60 digits) like Telegram Secret Chats
 */
export async function generateSafetyFingerprint(key: CryptoKey): Promise<SafetyFingerprint> {
  const rawKey = await window.crypto.subtle.exportKey('raw', key);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', rawKey);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const rawHashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  // 4 verification emojis using first 4 bytes
  const emojis = [
    EMOJI_SET[hashArray[0] % EMOJI_SET.length],
    EMOJI_SET[hashArray[1] % EMOJI_SET.length],
    EMOJI_SET[hashArray[2] % EMOJI_SET.length],
    EMOJI_SET[hashArray[3] % EMOJI_SET.length]
  ];

  // 12 blocks of 5-digit numbers (60 digits total)
  const numberBlocks: string[] = [];
  for (let i = 0; i < 12; i++) {
    const slice = hashArray.slice(i * 2, i * 2 + 2);
    const num = ((slice[0] << 8) | (slice[1] || 0)) % 100000;
    numberBlocks.push(num.toString().padStart(5, '0'));
  }

  return {
    emojis,
    numberBlocks,
    rawHashHex
  };
}

/**
 * Convert File to Data URL
 */
export function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
