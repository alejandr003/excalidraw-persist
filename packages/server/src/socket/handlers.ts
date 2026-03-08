import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';

interface RoomUser {
  id: string;
  socketId: string;
  name: string;
  color: string;
  cursor?: { x: number; y: number };
}

interface Room {
  users: Map<string, RoomUser>;
  currentVersion: number;
}

interface JoinRoomPayload {
  boardId: string;
  userId: string;
  userName: string;
}

interface SceneUpdatePayload {
  boardId: string;
  elements: any[];
  deletedIds: string[];
  version: number;
}

interface CursorPayload {
  boardId: string;
  position: { x: number; y: number };
  userId: string;
}

const MAX_USERS_PER_ROOM = 6;

const rooms = new Map<string, Room>();

function getOrCreateRoom(boardId: string): Room {
  if (!rooms.has(boardId)) {
    rooms.set(boardId, { users: new Map(), currentVersion: 0 });
  }
  return rooms.get(boardId)!;
}

function getRoom(boardId: string): Room | undefined {
  return rooms.get(boardId);
}

const COLORS = [
  '#f87171', // red
  '#fb923c', // orange
  '#fbbf24', // amber
  '#4ade80', // green
  '#34d399', // emerald
  '#22d3ee', // cyan
  '#60a5fa', // blue
  '#818cf8', // indigo
  '#a78bfa', // violet
  '#c084fc', // purple
  '#f472b6', // pink
  '#e879f9', // fuchsia
  '#2dd4bf', // teal
  '#a3e635', // lime
  '#fb7185', // rose
  '#38bdf8', // sky
];

export function initializeSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    logger.info(`Client connected: ${socket.id}`);

    socket.on('join-room', (payload: JoinRoomPayload) => {
      const { boardId, userId, userName } = payload;

      if (!boardId || !userId) {
        socket.emit('error', { message: 'boardId and userId are required' });
        return;
      }

      const room = getOrCreateRoom(boardId);

      if (room.users.size >= MAX_USERS_PER_ROOM) {
        socket.emit('room-full');
        return;
      }

      const usedColors = new Set(Array.from(room.users.values()).map(u => u.color));
      const available = COLORS.filter(c => !usedColors.has(c));
      const pool = available.length > 0 ? available : COLORS;
      const color = pool[Math.floor(Math.random() * pool.length)];

      room.users.set(socket.id, {
        id: userId,
        socketId: socket.id,
        name: userName || `User ${room.users.size + 1}`,
        color,
      });

      socket.join(boardId);
      socket.data.boardId = boardId;
      socket.data.userId = userId;

      socket.emit('room-state', {
        users: Array.from(room.users.values()),
        version: room.currentVersion,
      });

      socket.to(boardId).emit('user-joined', {
        id: userId,
        name: userName || `User ${room.users.size}`,
        color,
      });

      logger.info(
        `User ${userName} (${userId}) joined room ${boardId}. Total users: ${room.users.size}`
      );
    });

    socket.on('scene-update', (payload: SceneUpdatePayload) => {
      const { boardId, elements, deletedIds, version } = payload;

      if (!boardId) return;

      const room = getRoom(boardId);
      if (!room) return;

      room.currentVersion = version;

      socket.to(boardId).emit('remote-scene-update', {
        elements,
        deletedIds,
        version,
        userId: socket.data.userId,
      });
    });

    socket.on('scene-sync', (payload: SceneUpdatePayload) => {
      const { boardId, elements, version } = payload;

      if (!boardId) return;

      const room = getOrCreateRoom(boardId);
      room.currentVersion = version;

      socket.to(boardId).emit('remote-scene-sync', {
        elements,
        version,
        userId: socket.data.userId,
      });
    });

    socket.on('name-update', (payload: { boardId: string; userName: string }) => {
      const { boardId, userName } = payload;
      if (!boardId || !userName) return;

      const room = getRoom(boardId);
      if (!room) return;

      const user = room.users.get(socket.id);
      if (!user) return;

      user.name = userName;

      socket.to(boardId).emit('user-name-updated', {
        userId: socket.data.userId,
        name: userName,
      });
    });


    socket.on('cursor-move', (payload: CursorPayload) => {
      const { boardId, position, userId } = payload;

      if (!boardId) return;

      const room = getRoom(boardId);
      if (!room) return;

      const user = room.users.get(socket.id);
      if (user) {
        user.cursor = position;
      }

      socket.to(boardId).emit('remote-cursor', {
        userId,
        position,
        color: user?.color,
        name: user?.name,
      });
    });

    socket.on('request-sync', (payload: { boardId: string }) => {
      const { boardId } = payload;
      if (!boardId) return;

      const room = getRoom(boardId);
      if (!room) return;

      socket.emit('sync-requested', {
        version: room.currentVersion,
        requesterId: socket.data.userId,
      });
    });

    socket.on('disconnect', () => {
      const boardId = socket.data.boardId;
      const userId = socket.data.userId;

      if (boardId) {
        const room = getRoom(boardId);
        if (room) {
          const user = room.users.get(socket.id);
          if (user) {
            room.users.delete(socket.id);
            socket.to(boardId).emit('user-left', { userId: user.id, name: user.name });

            logger.info(
              `User ${user.name} (${user.id}) left room ${boardId}. Remaining: ${room.users.size}`
            );

            if (room.users.size === 0) {
              rooms.delete(boardId);
              logger.info(`Room ${boardId} deleted (empty)`);
            }
          }
        }
      }

      logger.info(`Client disconnected: ${socket.id}`);
    });
  });
}
