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
  '#f87171',
  '#fb923c',
  '#fbbf24',
  '#4ade80',
  '#60a5fa',
  '#a78bfa',
  '#c084fc',
  '#f472b6',
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

      const color = COLORS[room.users.size % COLORS.length];

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
