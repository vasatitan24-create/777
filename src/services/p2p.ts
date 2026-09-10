import Peer, { DataConnection } from 'peerjs';
import { EncryptedPayload, ConnectionState } from '../types';

export interface P2PEventCallbacks {
  onStateChange: (state: ConnectionState, peerId?: string) => void;
  onPayload: (payload: EncryptedPayload) => void;
  onAck: (messageId: string) => void;
  onPingUpdate: (pingMs: number) => void;
  onError: (error: string) => void;
}

export class P2PManager {
  private peer: Peer | null = null;
  private connection: DataConnection | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private myPeerId = '';
  private remotePeerId = '';
  private roomId = '';
  private state: ConnectionState = 'disconnected';
  private callbacks: P2PEventCallbacks;
  private pingInterval: number | null = null;
  private lastPingSent = 0;

  constructor(callbacks: P2PEventCallbacks) {
    this.callbacks = callbacks;
  }

  public getState(): ConnectionState {
    return this.state;
  }

  public getMyId(): string {
    return this.myPeerId;
  }

  public getRemoteId(): string {
    return this.remotePeerId;
  }

  public getRoomId(): string {
    return this.roomId;
  }

  /**
   * Initializes P2P node with a room ID
   * Supports both WebRTC P2P and local BroadcastChannel for zero-server same-device multi-tab testing
   */
  public async initialize(roomId: string, isHost = false): Promise<string> {
    this.cleanup();
    this.roomId = roomId;
    this.setState('connecting');

    // Setup local BroadcastChannel for zero-network same-device tabs
    try {
      this.broadcastChannel = new BroadcastChannel(`cipherchat_channel_${roomId}`);
      this.broadcastChannel.onmessage = (event) => {
        const data = event.data;
        if (!data || data.senderPeerId === this.myPeerId) return;

        if (data.type === 'P2P_PAYLOAD') {
          this.callbacks.onPayload(data.payload);
        } else if (data.type === 'P2P_ACK') {
          this.callbacks.onAck(data.messageId);
        } else if (data.type === 'P2P_PING') {
          this.broadcastChannel?.postMessage({
            type: 'P2P_PONG',
            senderPeerId: this.myPeerId,
            timestamp: data.timestamp
          });
        } else if (data.type === 'P2P_PONG') {
          const rtt = Date.now() - data.timestamp;
          this.callbacks.onPingUpdate(rtt);
        } else if (data.type === 'P2P_HELLO') {
          this.remotePeerId = data.senderPeerId;
          this.setState('connected', data.senderPeerId);
          // reply back
          this.broadcastChannel?.postMessage({
            type: 'P2P_WELCOME',
            senderPeerId: this.myPeerId
          });
        } else if (data.type === 'P2P_WELCOME') {
          this.remotePeerId = data.senderPeerId;
          this.setState('connected', data.senderPeerId);
        }
      };
    } catch {
      // BroadcastChannel not available or restricted
    }

    return new Promise((resolve) => {
      // Generate deterministic or random Peer IDs for the room
      // If host, peer ID is roomId + '-host'
      // If joiner, peer ID is roomId + '-client-' + random
      const peerIdToUse = isHost 
        ? `${roomId}-host` 
        : `${roomId}-client-${Math.random().toString(36).substring(2, 7)}`;

      this.myPeerId = peerIdToUse;

      // Broadcast hello to any local tabs
      this.broadcastChannel?.postMessage({
        type: 'P2P_HELLO',
        senderPeerId: this.myPeerId
      });

      try {
        this.peer = new Peer(peerIdToUse, {
          debug: 0,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun.cloudflare.com:3478' }
            ]
          }
        });

        this.peer.on('open', (id) => {
          this.myPeerId = id;

          // If we are a client connecting to host
          if (!isHost) {
            const hostTargetId = `${roomId}-host`;
            this.connectToPeer(hostTargetId);
          }
          resolve(id);
        });

        this.peer.on('connection', (conn) => {
          this.setupDataConnection(conn);
        });

        this.peer.on('error', (err) => {
          console.warn('P2P signaling event:', err.type, err.message);
          // If ID is already taken (e.g. host already exists), try connecting as client
          if (err.type === 'unavailable-id' && isHost) {
            this.peer?.destroy();
            this.initialize(roomId, false).then(resolve);
            return;
          }
          // Do not fail completely if broadcast channel is active
          if (this.state !== 'connected') {
            this.callbacks.onError(`Связь через P2P: ${err.type}`);
          }
        });

        this.peer.on('disconnected', () => {
          this.peer?.reconnect();
        });
      } catch (e) {
        console.warn('PeerJS init fallback:', e);
        resolve(this.myPeerId);
      }
    });
  }

  public connectToPeer(remoteId: string) {
    if (!this.peer || this.peer.destroyed) return;
    try {
      const conn = this.peer.connect(remoteId, {
        reliable: true
      });
      this.setupDataConnection(conn);
    } catch (e) {
      console.warn('Failed to connect to peer:', e);
    }
  }

  private setupDataConnection(conn: DataConnection) {
    this.connection = conn;

    conn.on('open', () => {
      this.remotePeerId = conn.peer;
      this.setState('connected', conn.peer);
      this.startPingLoop();
    });

    conn.on('data', (data: unknown) => {
      const packet = data as { type: string; payload?: EncryptedPayload; messageId?: string; timestamp?: number };
      if (!packet) return;

      if (packet.type === 'PAYLOAD' && packet.payload) {
        this.callbacks.onPayload(packet.payload);
        // Send ACK
        this.sendRaw({ type: 'ACK', messageId: packet.payload.id });
      } else if (packet.type === 'ACK' && packet.messageId) {
        this.callbacks.onAck(packet.messageId);
      } else if (packet.type === 'PING') {
        this.sendRaw({ type: 'PONG', timestamp: packet.timestamp });
      } else if (packet.type === 'PONG' && packet.timestamp) {
        const rtt = Date.now() - packet.timestamp;
        this.callbacks.onPingUpdate(rtt);
      }
    });

    conn.on('close', () => {
      this.setState('disconnected');
    });

    conn.on('error', (err) => {
      console.warn('Data connection error:', err);
    });
  }

  private startPingLoop() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = window.setInterval(() => {
      if (this.state === 'connected') {
        this.lastPingSent = Date.now();
        this.sendRaw({ type: 'PING', timestamp: this.lastPingSent });
        this.broadcastChannel?.postMessage({
          type: 'P2P_PING',
          senderPeerId: this.myPeerId,
          timestamp: this.lastPingSent
        });
      }
    }, 4000);
  }

  private sendRaw(data: unknown) {
    if (this.connection && this.connection.open) {
      this.connection.send(data);
    }
  }

  public sendPayload(payload: EncryptedPayload) {
    // Send via WebRTC
    if (this.connection && this.connection.open) {
      this.connection.send({ type: 'PAYLOAD', payload });
    }
    // Also broadcast to local tab channel
    this.broadcastChannel?.postMessage({
      type: 'P2P_PAYLOAD',
      senderPeerId: this.myPeerId,
      payload
    });
  }

  public sendAck(messageId: string) {
    if (this.connection && this.connection.open) {
      this.connection.send({ type: 'ACK', messageId });
    }
    this.broadcastChannel?.postMessage({
      type: 'P2P_ACK',
      senderPeerId: this.myPeerId,
      messageId
    });
  }

  private setState(state: ConnectionState, peerId?: string) {
    this.state = state;
    this.callbacks.onStateChange(state, peerId);
  }

  public cleanup() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
    this.state = 'disconnected';
  }
}
