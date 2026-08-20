import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';
import { ReadingCreatedEvent } from './types';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

/**
 * Subscribes to live sensor readings for a single device over the backend's
 * /realtime Socket.io namespace. Handles auth (same access token as REST),
 * device room subscription, and cleanly tears down on unmount or deviceId
 * change - so switching the selected device never leaves a stale
 * subscription running in the background.
 */
export function useRealtimeReadings(deviceId: string | null) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [lastEvent, setLastEvent] = useState<ReadingCreatedEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!deviceId || !accessToken) {
      setConnected(false);
      return;
    }

    const socket = io(`${API_BASE_URL}/realtime`, {
      auth: { token: accessToken },
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('subscribe', { deviceId });
    });

    socket.on('disconnect', () => setConnected(false));

    // Backend emits 'reading' events into the device's room after every
    // successful ingestion write - see sensors.gateway.ts.
    socket.on('reading', (event: ReadingCreatedEvent) => {
      if (event.deviceId === deviceId) {
        setLastEvent(event);
      }
    });

    return () => {
      socket.emit('unsubscribe', { deviceId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [deviceId, accessToken]);

  return { lastEvent, connected };
}