export type MessageType = 'text' | 'image' | 'voice' | 'file';

export interface AttachmentData {
  name?: string;
  size?: number;
  mimeType?: string;
  dataUrl?: string; // base64 or blob URL
  duration?: number; // for audio voice messages (in seconds)
  waveform?: number[]; // amplitude bars
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  isMe: boolean;
  type: MessageType;
  text?: string;
  attachment?: AttachmentData;
  timestamp: number;
  delivered: boolean;
  read: boolean;
  burnDuration?: number; // in seconds (0 = off)
  burnExpiresAt?: number; // timestamp when it should vanish
}

export interface EncryptedPayload {
  id: string;
  senderId: string;
  senderName: string;
  type: MessageType;
  iv: string; // base64
  ciphertext: string; // base64
  burnDuration?: number;
  timestamp: number;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface PeerProfile {
  id: string;
  name: string;
  avatarSeed: string;
}

export interface SafetyFingerprint {
  emojis: string[];
  numberBlocks: string[];
  rawHashHex: string;
}
