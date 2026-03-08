import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Excalidraw, useHandleLibrary } from '@excalidraw/excalidraw';
import type {
  ExcalidrawImperativeAPI,
  AppState,
  BinaryFiles,
  LibraryItems,
} from '@excalidraw/excalidraw/types';
import { v4 as uuidv4 } from 'uuid';
import '../styles/ExcalidrawEditor.scss';
import { ElementService } from '../services/elementService';
import { ShareService } from '../services/shareService';
import { useExcalidrawEditor } from '../hooks/useExcalidrawEditor';
import { useSocketCollaboration, Collaborator } from '../hooks/useSocketCollaboration';
import Loader from './Loader';
import { useTheme } from '../contexts/ThemeProvider';
import { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import logger from '../utils/logger';
import { LibraryService } from '../services/libraryService';

interface ExcalidrawEditorProps {
  boardId?: string;
  shareId?: string;
  readOnly?: boolean;
}

const ExcalidrawEditor = ({ boardId, shareId, readOnly }: ExcalidrawEditorProps) => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const { theme: currentAppTheme, setTheme: setAppTheme } = useTheme();
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);

  const userId = useMemo(() => {
    const stored = localStorage.getItem('excalidraw-user-id');
    if (stored) return stored;
    const newId = uuidv4();
    localStorage.setItem('excalidraw-user-id', newId);
    return newId;
  }, []);

  const userName = useMemo(() => {
    return localStorage.getItem('excalidraw-user-name') || `User ${userId.slice(0, 4)}`;
  }, [userId]);

  const {
    excalidrawAPI,
    elements,
    files,
    setElements,
    setFiles,
    setExcalidrawAPI,
    handleChange: onSceneChange,
    initializeVersionTracking,
  } = useExcalidrawEditor({ boardId, shareId, readOnly });

  const isCollaborationEnabled = (!!boardId || !!shareId) && !readOnly;

  const prevEmittedElementsRef = useRef<Map<string, number>>(new Map());

  const handleRemoteUpdate = useCallback(
    (newElements: ExcalidrawElement[], deletedIds: string[]) => {
      if (!excalidrawAPI) return;

      const currentElements = excalidrawAPI.getSceneElements();
      let updated = [...currentElements];

      for (const id of deletedIds) {
        updated = updated.filter(el => el.id !== id);
      }

      for (const el of newElements) {
        const idx = updated.findIndex(e => e.id === el.id);
        if (idx >= 0) {
          updated[idx] = el as any;
        } else {
          updated.push(el as any);
        }
      }

      excalidrawAPI.updateScene({ elements: updated as any });
      setElements(updated);
      initializeVersionTracking(updated);

      // Keep emit-tracking in sync so we don't re-broadcast remote changes
      const versions = new Map<string, number>();
      for (const el of updated) {
        versions.set(el.id, el.version);
      }
      prevEmittedElementsRef.current = versions;
    },
    [excalidrawAPI, setElements, initializeVersionTracking]
  );

  const handleRemoteSync = useCallback(
    (newElements: ExcalidrawElement[]) => {
      if (!excalidrawAPI) return;
      excalidrawAPI.updateScene({ elements: newElements as any });
      setElements(newElements);
      initializeVersionTracking(newElements);

      const versions = new Map<string, number>();
      for (const el of newElements) {
        versions.set(el.id, el.version);
      }
      prevEmittedElementsRef.current = versions;
    },
    [excalidrawAPI, setElements, initializeVersionTracking]
  );

  const {
    collaborators: socketCollaborators,
    isConnected,
    emitUpdate,
  } = useSocketCollaboration({
    boardId: shareId || boardId || '',
    userId,
    userName,
    onRemoteUpdate: handleRemoteUpdate,
    onRemoteSync: handleRemoteSync,
    enabled: isCollaborationEnabled,
  });

  useEffect(() => {
    setCollaborators(socketCollaborators);
  }, [socketCollaborators]);

  const handleExcalidrawAPI = useCallback(
    (api: ExcalidrawImperativeAPI) => setExcalidrawAPI(api),
    [setExcalidrawAPI]
  );

  const handleChange = useCallback(
    (
      updatedElements: readonly ExcalidrawElement[],
      appState: AppState,
      updatedFiles: BinaryFiles | null
    ) => {
      if (
        updatedElements.length === 0 &&
        (!updatedFiles || Object.keys(updatedFiles).length === 0)
      ) {
        return;
      }

      onSceneChange(updatedElements, updatedFiles);

      if (appState?.theme && appState.theme !== currentAppTheme) {
        setAppTheme(appState.theme);
      }

      if (isCollaborationEnabled && isConnected) {
        const prev = prevEmittedElementsRef.current;
        const currentIds = new Set<string>();
        const upserted: ExcalidrawElement[] = [];

        for (const el of updatedElements) {
          currentIds.add(el.id);
          const prevVersion = prev.get(el.id);
          if (prevVersion === undefined || prevVersion !== el.version) {
            upserted.push(el as ExcalidrawElement);
          }
        }

        const deletedIds: string[] = [];
        for (const id of prev.keys()) {
          if (!currentIds.has(id)) {
            deletedIds.push(id);
          }
        }

        if (upserted.length > 0 || deletedIds.length > 0) {
          // Update tracking BEFORE emitting so next onChange sees the new baseline
          const newVersions = new Map<string, number>();
          for (const el of updatedElements) {
            newVersions.set(el.id, el.version);
          }
          prevEmittedElementsRef.current = newVersions;

          emitUpdate(upserted, deletedIds);
        }
      }
    },
    [
      onSceneChange,
      currentAppTheme,
      setAppTheme,
      isCollaborationEnabled,
      isConnected,
      emitUpdate,
    ]
  );

  const libraryAdapter = useMemo(() => {
    const resourceId = shareId || boardId;
    if (!resourceId) return null;

    return {
      load: async (): Promise<{ libraryItems: LibraryItems } | null> => {
        try {
          const response = shareId
            ? await ShareService.getLibrary(shareId)
            : await LibraryService.getBoardLibrary(resourceId);
          return { libraryItems: (response.libraryItems ?? []) as LibraryItems };
        } catch (error) {
          logger.error(`Error loading library:`, error, true);
          return null;
        }
      },
      save: async ({ libraryItems }: { libraryItems: LibraryItems }) => {
        if (readOnly) return;
        try {
          if (shareId) {
            await ShareService.saveLibrary(shareId, libraryItems);
          } else {
            await LibraryService.saveBoardLibrary(resourceId, libraryItems);
          }
        } catch (error) {
          logger.error(`Error saving library:`, error, true);
        }
      },
    };
  }, [boardId, shareId, readOnly]);

  useHandleLibrary(libraryAdapter ? { excalidrawAPI, adapter: libraryAdapter } : { excalidrawAPI });

  useEffect(() => {
    if (excalidrawAPI) {
      const currentExcalidrawTheme = excalidrawAPI.getAppState().theme;
      if (currentExcalidrawTheme !== currentAppTheme) {
        excalidrawAPI.updateScene({ appState: { theme: currentAppTheme } });
      }
      const updatedExcalidrawTheme = excalidrawAPI.getAppState().theme;
      if (updatedExcalidrawTheme !== currentAppTheme) {
        setAppTheme(updatedExcalidrawTheme);
      }
    }
  }, [excalidrawAPI, currentAppTheme, setAppTheme]);

  const fetchBoardElements = useCallback(async () => {
    const resourceId = shareId || boardId;
    if (!resourceId) {
      setElements([]);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const fetchedScene = shareId
        ? await ShareService.getElements(shareId)
        : await ElementService.getBoardElements(resourceId);
      if (fetchedScene) {
        const loadedElements = fetchedScene.elements || [];
        setElements(loadedElements);
        setFiles(fetchedScene.files || {});
        initializeVersionTracking(loadedElements);
      } else {
        setElements([]);
        setFiles({});
        initializeVersionTracking([]);
      }
    } catch (error) {
      logger.error('Error fetching board scene:', error, true);
      setElements([]);
      setFiles({});
      initializeVersionTracking([]);
    } finally {
      setIsLoading(false);
    }
  }, [boardId, shareId, setElements, setFiles, initializeVersionTracking]);

  useEffect(() => {
    fetchBoardElements();
  }, [fetchBoardElements]);

  if (isLoading) {
    return (
      <div className="excalidraw-editor">
        <div className="excalidraw-container">
          <Loader message="Loading board elements..." />
        </div>
      </div>
    );
  }

  const resourceId = shareId || boardId;

  if (!resourceId) {
    return (
      <div className="excalidraw-editor">
        <div className="excalidraw-container">
          <p>Please select or create a board.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="excalidraw-editor">
      {isCollaborationEnabled && (
        <div className="collaboration-header">
          <div className="collaborators">
            {collaborators.map(collab => (
              <div
                key={collab.id}
                className="collaborator-avatar"
                style={{ backgroundColor: collab.color }}
                title={collab.name}
              >
                {collab.name.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
          <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? `${collaborators.length + 1} online` : 'Connecting...'}
          </div>
        </div>
      )}
      <div className="excalidraw-container relative">
        <Excalidraw
          key={resourceId}
          initialData={{
            elements,
            files,
            appState: {
              theme: currentAppTheme,
            },
          }}
          onChange={handleChange}
          viewModeEnabled={readOnly}
          name={`Board: ${resourceId}`}
          excalidrawAPI={handleExcalidrawAPI}
          UIOptions={{
            canvasActions: {
              saveToActiveFile: false,
              saveAsImage: true,
              export: false,
              loadScene: false,
            },
          }}
        />
      </div>
    </div>
  );
};

export default ExcalidrawEditor;
