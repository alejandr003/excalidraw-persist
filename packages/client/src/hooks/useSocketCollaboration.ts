import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import Utils from '../utils';

export interface Collaborator {
  id: string;
  name: string;
  color: string;
  cursor?: { x: number; y: number };
}

interface UseSocketCollaborationOptions {
  boardId: string;
  userId: string;
  userName: string;
  onRemoteUpdate: (elements: ExcalidrawElement[], deletedIds: string[]) => void;
  onRemoteSync: (elements: ExcalidrawElement[]) => void;
  enabled?: boolean;
}

export const useSocketCollaboration = ({
  boardId,
  userId,
  userName,
  onRemoteUpdate,
  onRemoteSync,
  enabled = true,
}: UseSocketCollaborationOptions) => {
  const socketRef = useRef<Socket | null>(null);
  const versionRef = useRef(0);
  const isRemoteUpdateRef = useRef(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isRoomFull, setIsRoomFull] = useState(false);

  // Keep userName in a ref so we can emit changes without reconnecting
  const userNameRef = useRef(userName);
  useEffect(() => {
    userNameRef.current = userName;
  }, [userName]);

  // Socket setup — only re-runs when boardId, userId, or enabled changes
  useEffect(() => {
    if (!enabled || !boardId) return;

    // Always connect to the same origin as the frontend (nginx proxies /socket.io/ to the backend).
    // Using window.location.origin ensures correct behaviour behind any proxy or tunnel.
    const socket = io(window.location.origin, {
      // Start with polling — works reliably through Cloudflare Tunnel and any HTTP proxy.
      // Socket.IO will automatically upgrade to WebSocket once polling is established.
      transports: ['polling', 'websocket'],
      upgrade: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      path: '/socket.io/',
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('join-room', { boardId, userId, userName: userNameRef.current });
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('room-full', () => {
      setIsRoomFull(true);
    });

    socket.on('room-state', ({ users, version }: { users: Collaborator[]; version: number }) => {
      versionRef.current = version;
      setCollaborators(users.filter(u => u.id !== userId));
    });

    socket.on('user-joined', (user: Collaborator) => {
      setCollaborators(prev => [...prev.filter(u => u.id !== user.id), user]);
    });

    socket.on('user-left', ({ userId: leftId }: { userId: string }) => {
      setCollaborators(prev => prev.filter(u => u.id !== leftId));
    });

    socket.on('user-name-updated', ({ userId: senderId, name }: { userId: string; name: string }) => {
      setCollaborators(prev =>
        prev.map(c => (c.id === senderId ? { ...c, name } : c))
      );
    });

    socket.on('remote-scene-update', ({ elements, deletedIds, version, userId: senderId }: any) => {
      if (senderId === userId) return;
      isRemoteUpdateRef.current = true;
      versionRef.current = version;
      onRemoteUpdate(elements, deletedIds);
      setTimeout(() => {
        isRemoteUpdateRef.current = false;
      }, 200);
    });

    socket.on('remote-scene-sync', ({ elements, version, userId: senderId }: any) => {
      if (senderId === userId) return;
      versionRef.current = version;
      onRemoteSync(elements);
    });

    socket.on('remote-cursor', ({ userId: senderId, position, color, name }: any) => {
      if (senderId === userId) return;
      setCollaborators(prev =>
        prev.map(c => (c.id === senderId ? { ...c, cursor: position, color, name } : c))
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [boardId, userId, enabled, onRemoteUpdate, onRemoteSync]);

  // Emit name change when userName changes (without reconnecting)
  useEffect(() => {
    if (!socketRef.current || !isConnected || !boardId) return;
    socketRef.current.emit('name-update', { boardId, userName });
  }, [userName, boardId, isConnected]);

  const emitUpdate = useCallback(
    Utils.debounce((elements: ExcalidrawElement[], deletedIds: string[]) => {
      if (!socketRef.current || !isConnected || isRemoteUpdateRef.current) return;

      versionRef.current++;
      socketRef.current.emit('scene-update', {
        boardId,
        elements,
        deletedIds,
        version: versionRef.current,
      });
    }, 50),
    [boardId, isConnected]
  );

  const emitSync = useCallback(
    (elements: ExcalidrawElement[]) => {
      if (!socketRef.current || !isConnected) return;

      versionRef.current++;
      socketRef.current.emit('scene-sync', {
        boardId,
        elements,
        version: versionRef.current,
      });
    },
    [boardId, isConnected]
  );

  const emitCursor = useCallback(
    (position: { x: number; y: number }) => {
      if (!socketRef.current || !isConnected) return;
      socketRef.current.emit('cursor-move', { boardId, position, userId });
    },
    [boardId, isConnected, userId]
  );

  const requestSync = useCallback(() => {
    if (!socketRef.current || !isConnected) return;
    socketRef.current.emit('request-sync', { boardId });
  }, [boardId, isConnected]);

  return {
    collaborators,
    isConnected,
    isRoomFull,
    emitUpdate,
    emitSync,
    emitCursor,
    requestSync,
    version: versionRef.current,
  };
};
