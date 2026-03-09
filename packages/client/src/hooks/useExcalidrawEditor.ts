import { useState, useCallback, useRef, useMemo } from 'react';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { BinaryFiles, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { ElementService, type BoardSceneData, type DeltaPayload } from '../services/elementService';
import { ShareService } from '../services/shareService';
import Utils from '../utils';
import logger from '../utils/logger';
import { api as apiClient } from '../services/api';

interface EditorApi {
  getElements: (id: string) => Promise<BoardSceneData>;
  saveDelta: (id: string, delta: DeltaPayload) => Promise<void>;
  replaceAllElements: (id: string, scene: BoardSceneData) => Promise<void>;
  checkFiles: (id: string, fileIds: string[]) => Promise<{ missingIds: string[] }>;
  uploadFiles: (id: string, files: BinaryFiles) => Promise<void>;
}

const boardApi: EditorApi = {
  getElements: ElementService.getBoardElements,
  saveDelta: ElementService.saveDelta,
  replaceAllElements: ElementService.replaceAllElements,
  checkFiles: ElementService.checkFiles,
  uploadFiles: ElementService.uploadFiles,
};

const shareApi: EditorApi = {
  getElements: ShareService.getElements,
  saveDelta: ShareService.saveDelta,
  replaceAllElements: ShareService.replaceAllElements,
  checkFiles: ShareService.checkFiles,
  uploadFiles: ShareService.uploadFiles,
};

interface UseExcalidrawEditorOptions {
  boardId?: string;
  shareId?: string;
  readOnly?: boolean;
}

export const useExcalidrawEditor = (
  boardIdOrOptions: string | undefined | UseExcalidrawEditorOptions
) => {
  const options: UseExcalidrawEditorOptions =
    typeof boardIdOrOptions === 'object' && boardIdOrOptions !== null
      ? boardIdOrOptions
      : { boardId: boardIdOrOptions ?? undefined };

  const { boardId, shareId, readOnly } = options;
  const resourceId = shareId || boardId;
  const api = useMemo(() => (shareId ? shareApi : boardApi), [shareId]);
  const [elements, setElements] = useState<ExcalidrawElement[]>([]);
  const [files, setFiles] = useState<BinaryFiles>({});
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);

  const prevVersionsRef = useRef<Map<string, number>>(new Map());
  const needsFullSyncRef = useRef(false);
  const isSavingRef = useRef(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Accumulates ALL files ever seen (from DB load + newly pasted/added).
  // Excalidraw's onChange `files` param only contains NEWLY ADDED files in that render cycle,
  // not the full set. This ref is the source of truth for file uploads.
  const allFilesRef = useRef<BinaryFiles>({});

  const startHeartbeat = useCallback(() => {
    if (!resourceId || readOnly) return;
    apiClient.startHeartbeat();
    return () => apiClient.stopHeartbeat();
  }, [resourceId, readOnly]);

  const saveScene = useCallback(
    async (elementsArray: ExcalidrawElement[]) => {
      if (!resourceId || readOnly || isSavingRef.current) return;
      isSavingRef.current = true;
      setSyncStatus('saving');

      // Always use the accumulated files ref — not the partial filesMap from onChange
      const filesMap = allFilesRef.current;

      try {
        // Upload new files first
        const fileIds = Object.keys(filesMap);
        if (fileIds.length > 0) {
          const { missingIds } = await api.checkFiles(resourceId, fileIds);
          if (missingIds.length > 0) {
            const newFiles: BinaryFiles = {};
            for (const id of missingIds) {
              newFiles[id] = filesMap[id];
            }
            await api.uploadFiles(resourceId, newFiles);
          }
        }

        // Full sync fallback (triggered when a delta save previously failed)
        if (needsFullSyncRef.current) {
          await api.replaceAllElements(resourceId, {
            elements: elementsArray,
            files: filesMap,
          });
          const newVersions = new Map<string, number>();
          for (const el of elementsArray) {
            newVersions.set(el.id, el.version);
          }
          prevVersionsRef.current = newVersions;
          needsFullSyncRef.current = false;
          setSyncStatus('saved');
          return;
        }

        // Compute delta
        const prev = prevVersionsRef.current;
        const currentIds = new Set<string>();
        const upserted: ExcalidrawElement[] = [];

        for (const el of elementsArray) {
          currentIds.add(el.id);
          const prevVersion = prev.get(el.id);
          if (prevVersion === undefined || prevVersion !== el.version) {
            upserted.push(el);
          }
        }

        const deleted: string[] = [];
        for (const id of prev.keys()) {
          if (!currentIds.has(id)) {
            deleted.push(id);
          }
        }

        // Skip if nothing changed
        if (upserted.length === 0 && deleted.length === 0) {
          setSyncStatus('idle');
          return;
        }

        try {
          await api.saveDelta(resourceId, { upserted, deleted });
          setSyncStatus('saved');
        } catch {
          // Delta failed — fall back to full replace
          needsFullSyncRef.current = true;
          await api.replaceAllElements(resourceId, {
            elements: elementsArray,
            files: filesMap,
          });
          needsFullSyncRef.current = false;
          setSyncStatus('saved');
        }

        // Update tracking
        const newVersions = new Map<string, number>();
        for (const el of elementsArray) {
          newVersions.set(el.id, el.version);
        }
        prevVersionsRef.current = newVersions;
        setSyncStatus('saved');
      } catch (error) {
        setSyncStatus('error');
        needsFullSyncRef.current = true;
        logger.error('Error saving scene data:', apiClient.extractErrorMessage(error), true);
      } finally {
        isSavingRef.current = false;
      }
    },
    [resourceId, readOnly, api]
  );

  const saveSceneRef = useRef(saveScene);
  saveSceneRef.current = saveScene;

  const debouncedSaveRef = useRef<ReturnType<typeof Utils.debounce>>();
  if (!debouncedSaveRef.current) {
    debouncedSaveRef.current = Utils.debounce(
      (elems: ExcalidrawElement[]) => {
        saveSceneRef.current(elems);
      },
      500
    );
  }

  const handleChange = useCallback(
    (excalidrawElements: readonly ExcalidrawElement[], excalidrawFiles: BinaryFiles | null) => {
      const elementsArray = [...excalidrawElements];

      // Merge new files into accumulated store. Never overwrite with empty —
      // Excalidraw's onChange only passes newly added files, not the full set.
      if (excalidrawFiles && Object.keys(excalidrawFiles).length > 0) {
        allFilesRef.current = { ...allFilesRef.current, ...excalidrawFiles };
      }

      setElements(elementsArray);
      setFiles({ ...allFilesRef.current });

      if (resourceId && !readOnly) {
        debouncedSaveRef.current!(elementsArray);
      }
    },
    [resourceId, readOnly]
  );

  const initializeVersionTracking = useCallback((loadedElements: ExcalidrawElement[]) => {
    const versions = new Map<string, number>();
    for (const el of loadedElements) {
      versions.set(el.id, el.version);
    }
    prevVersionsRef.current = versions;
    needsFullSyncRef.current = false;
  }, []);

  // Called once when board elements are loaded from the server.
  // Seeds allFilesRef with the authoritative file set from the DB.
  const initializeFiles = useCallback((loadedFiles: BinaryFiles) => {
    allFilesRef.current = { ...loadedFiles };
  }, []);

  return {
    elements,
    setElements,
    files,
    setFiles,
    excalidrawAPI,
    setExcalidrawAPI,
    handleChange,
    initializeVersionTracking,
    initializeFiles,
    startHeartbeat,
    syncStatus,
  };
};
