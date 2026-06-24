import { useEffect, useRef, useState } from 'react';
import { fabric } from 'fabric';
import * as Y from 'yjs';
import { useBoardStore } from '../../stores/boardStore';
import { useCollaborationStore } from '../../stores/collaborationStore';
import { connectSocket, disconnectSocket, emitCursorMove, getSocket } from '../../services/socket';
import { api } from '../../services/api';
import {
  createStickyNote,
  createFlowchartNode,
  createUMLClassNode,
  createEREntityNode
} from '../../utils/fabricHelpers';
import {
  MousePointer,
  Square,
  Circle,
  Type,
  Eraser,
  Trash2,
  Download,
  Share2,
  ChevronLeft,
  PenTool,
  ZoomIn,
  ZoomOut,
  Users,
  Sparkles,
  Clock,
  MessageSquare,
  Upload,
  ArrowUp,
  ArrowDown,
  Copy,
  Plus,
  Send,
  Loader2,
  Check,
  Cpu,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Tv
} from 'lucide-react';

interface WhiteboardViewProps {
  boardId: string;
  onClose: () => void;
}

export default function WhiteboardView({ boardId, onClose }: WhiteboardViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Yjs document references
  const ydocRef = useRef<Y.Doc>(new Y.Doc());
  const yelementsRef = useRef<Y.Map<any>>(ydocRef.current.getMap('elements'));
  
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
  const [boardDetails, setBoardDetails] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [selectedObject, setSelectedObject] = useState<fabric.Object | null>(null);

  // UI state overlays
  const [sidebarPanel, setSidebarPanel] = useState<'comments' | 'versions' | 'ai-copilot' | null>(null);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiPrompt, setAIPrompt] = useState('');
  const [aiLoading, setAILoading] = useState(false);

  // AI Copilot state variables
  const [copilotPrompt, setCopilotPrompt] = useState('');
  const [copilotHistory, setCopilotHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    { role: 'assistant', content: 'Hi there! I am your AI board copilot. Ask me to explain the diagrams, suggest optimizations, generate docs, or build project schedules!' }
  ]);
  const [copilotLoading, setCopilotLoading] = useState(false);

  // WebRTC Audio Call & Screen Share state variables
  const [voiceCallJoined, setVoiceCallJoined] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);

  // Presentation Spotlight mode state variables
  const [presenting, setPresenting] = useState(false);
  const [followingPresenter, setFollowingPresenter] = useState(false);
  // Version history state
  const [versionsList, setVersionsList] = useState<any[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  // Comments state
  const [commentsList, setCommentsList] = useState<any[]>([]);
  const [activeCommentThread, setActiveCommentThread] = useState<any>(null);
  const [newCommentText, setNewCommentText] = useState('');
  const [commentReplyText, setCommentReplyText] = useState('');
  const [placingComment, setPlacingComment] = useState(false);
  const [commentCoords, setCommentCoords] = useState<{ x: number; y: number } | null>(null);

  // Zustand state stores
  const { activeTool, setActiveTool, brushColor, setBrushColor, brushSize, zoom, setZoom } = useBoardStore();
  const collaborators = useCollaborationStore((state) => state.collaborators);

  const zoomIn = () => {
    if (!canvas) return;
    const newZoom = Math.min(zoom + 0.1, 4);
    canvas.setZoom(newZoom);
    setZoom(newZoom);
    canvas.renderAll();
  };

  const zoomOut = () => {
    if (!canvas) return;
    const newZoom = Math.max(zoom - 0.1, 0.5);
    canvas.setZoom(newZoom);
    setZoom(newZoom);
    canvas.renderAll();
  };

  // 1. Initialize Socket and fetch board details
  useEffect(() => {
    connectSocket(boardId);
    
    api.get(`/boards/${boardId}`).then((res) => {
      if (res.data?.status === 'success') {
        setBoardDetails(res.data.data);
      }
    });

    fetchComments();
    fetchVersions();

    return () => {
      disconnectSocket();
    };
  }, [boardId]);

  // 2. Setup Yjs document socket synchronization
  useEffect(() => {
    const socket = getSocket();

    const handleYjsSync = (stateUpdate: ArrayBuffer) => {
      Y.applyUpdate(ydocRef.current, new Uint8Array(stateUpdate), 'socket');
    };

    const handleYjsUpdate = (update: ArrayBuffer) => {
      Y.applyUpdate(ydocRef.current, new Uint8Array(update), 'socket');
    };

    socket.on('yjs-sync', handleYjsSync);
    socket.on('yjs-update', handleYjsUpdate);

    // Broadcast local Yjs updates to server
    const handleLocalDocUpdate = (update: Uint8Array, origin: any) => {
      if (origin === 'socket') return; // Skip updates received from websocket
      socket.emit('yjs-update', Buffer.from(update));
    };

    ydocRef.current.on('update', handleLocalDocUpdate);

    return () => {
      socket.off('yjs-sync', handleYjsSync);
      socket.off('yjs-update', handleYjsUpdate);
      ydocRef.current.off('update', handleLocalDocUpdate);
    };
  }, []);

  // Synchronize viewport if following the presenter
  useEffect(() => {
    if (!canvas || !followingPresenter) return;
    const socket = getSocket();

    const handlePresentationAction = (action: any) => {
      if (action.type === 'sync-view') {
        canvas.setZoom(action.zoom);
        setZoom(action.zoom);
        if (canvas.viewportTransform) {
          canvas.viewportTransform[4] = action.x;
          canvas.viewportTransform[5] = action.y;
        }
        canvas.renderAll();
      }
    };

    socket.on('presentation-action', handlePresentationAction);
    return () => {
      socket.off('presentation-action', handlePresentationAction);
    };
  }, [canvas, followingPresenter]);

  // Presenter broadcasts viewport adjustments (pan / zoom)
  useEffect(() => {
    if (!canvas || !presenting) return;
    const socket = getSocket();

    const handleViewportChange = () => {
      socket.emit('presentation-action', {
        type: 'sync-view',
        zoom: canvas.getZoom(),
        x: canvas.viewportTransform ? canvas.viewportTransform[4] : 0,
        y: canvas.viewportTransform ? canvas.viewportTransform[5] : 0,
      });
    };

    canvas.on('after:render', handleViewportChange);
    return () => {
      canvas.off('after:render', handleViewportChange);
    };
  }, [canvas, presenting]);

  const handleCopilotSubmit = async (e?: React.FormEvent, customAction?: 'explain' | 'improve' | 'document' | 'plan') => {
    if (e) e.preventDefault();
    
    const action = customAction || 'explain';
    const textPrompt = customAction ? `Triggered AI Action: ${action.toUpperCase()}` : copilotPrompt;
    if (!textPrompt.trim() && !customAction) return;

    setCopilotLoading(true);
    
    const userMsg = { role: 'user' as const, content: textPrompt };
    setCopilotHistory(prev => [...prev, userMsg]);
    setCopilotPrompt('');

    try {
      const objects = canvas ? canvas.getObjects().map((o: any) => ({
        type: o.type,
        customType: o.customType,
        left: o.left,
        top: o.top,
        text: o.text || (o.getObjects ? o.getObjects().map((child: any) => child.text).filter(Boolean).join(' ') : '')
      })) : [];

      const res = await api.post('/ai/copilot', {
        boardId,
        prompt: textPrompt,
        action,
        elements: objects
      });

      if (res.data?.status === 'success') {
        setCopilotHistory(prev => [...prev, {
          role: 'assistant',
          content: res.data.data
        }]);
      }
    } catch (err: any) {
      setCopilotHistory(prev => [...prev, {
        role: 'assistant',
        content: `Error contacting Copilot: ${err.response?.data?.message || 'Server request failed'}`
      }]);
    } finally {
      setCopilotLoading(false);
    }
  };

  const handleToggleScreenShare = async () => {
    if (screenSharing) {
      if (screenStream) {
        screenStream.getTracks().forEach((track) => track.stop());
      }
      setScreenStream(null);
      setScreenSharing(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        setScreenStream(stream);
        setScreenSharing(true);
        stream.getVideoTracks()[0].onended = () => {
          setScreenSharing(false);
          setScreenStream(null);
        };
      } catch (err) {
        console.error('Screen share request aborted:', err);
      }
    }
  };

  const handleToggleVoiceCall = () => {
    setVoiceCallJoined(!voiceCallJoined);
  };

  // 3. Initialize Fabric Canvas
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const fabricCanvas = new fabric.Canvas(canvasRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      backgroundColor: '#ffffff',
      isDrawingMode: false,
    });

    fabric.Object.prototype.transparentCorners = false;
    fabric.Object.prototype.cornerColor = '#3b82f6';
    fabric.Object.prototype.cornerStyle = 'circle';
    fabric.Object.prototype.borderColor = '#3b82f6';

    setCanvas(fabricCanvas);

    const handleResize = () => {
      if (!containerRef.current) return;
      fabricCanvas.setWidth(containerRef.current.clientWidth);
      fabricCanvas.setHeight(containerRef.current.clientHeight);
      fabricCanvas.renderAll();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      fabricCanvas.dispose();
    };
  }, []);

  // 4. Sync Fabric Canvas from Yjs document Map changes
  useEffect(() => {
    if (!canvas) return;

    let renderPending = false;
    const requestRender = () => {
      if (!renderPending) {
        renderPending = true;
        requestAnimationFrame(() => {
          canvas.renderAll();
          renderPending = false;
        });
      }
    };

    const handleYjsMapChange = (event: Y.YMapEvent<any>) => {
      event.changes.keys.forEach((change, key) => {
        if (change.action === 'add' || change.action === 'update') {
          const val = yelementsRef.current.get(key);
          if (!val) return;

          const existingObj = canvas.getObjects().find((o: any) => o.id === key);

          if (existingObj) {
            existingObj.set(val);
            existingObj.setCoords();
            requestRender();
          } else {
            // Reconstruct elements dynamically
            fabric.util.enlivenObjects([val], (objects: fabric.Object[]) => {
              objects.forEach((obj: any) => {
                obj.id = key;
                if (val.customType) {
                  obj.customType = val.customType;
                }
                
                // Reconstruct groups for Sticky Notes / Diagrams
                if (val.type === 'group' && val.objects) {
                  fabric.util.enlivenObjects(val.objects, (childObjects: fabric.Object[]) => {
                    const group = new fabric.Group(childObjects, {
                      left: val.left,
                      top: val.top,
                      angle: val.angle,
                      scaleX: val.scaleX,
                      scaleY: val.scaleY,
                    });
                    (group as any).id = key;
                    (group as any).customType = val.customType;
                    canvas.add(group);
                    requestRender();
                  }, 'fabric');
                } else {
                  canvas.add(obj);
                }
              });
              requestRender();
            }, 'fabric');
          }
        } else if (change.action === 'delete') {
          const objToDelete = canvas.getObjects().find((o: any) => o.id === key);
          if (objToDelete) {
            canvas.remove(objToDelete);
            requestRender();
          }
        }
      });
    };

    yelementsRef.current.observe(handleYjsMapChange);
    return () => {
      yelementsRef.current.unobserve(handleYjsMapChange);
    };
  }, [canvas]);

  // 5. Monitor selection status & tool configurations
  useEffect(() => {
    if (!canvas) return;

    if (activeTool === 'pen') {
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush.color = brushColor;
      canvas.freeDrawingBrush.width = brushSize;
    } else {
      canvas.isDrawingMode = false;
    }

    canvas.selection = activeTool === 'select';
    canvas.forEachObject((obj) => {
      obj.selectable = activeTool === 'select';
      obj.evented = activeTool === 'select' || activeTool === 'eraser';
    });

    canvas.renderAll();
  }, [canvas, activeTool, brushColor, brushSize]);

  // 6. Bind canvas events (object addition, modification, cursor movement, selection listeners)
  useEffect(() => {
    if (!canvas) return;

    const handleObjectAdded = (e: any) => {
      const target = e.target;
      if (!target || target.id) return; // Prevent loop for sync updates

      target.id = Math.random().toString(36).substring(2, 9);
      
      // Serialize and commit to Yjs
      const data = target.toObject(['id', 'customType', 'objects']);
      ydocRef.current.transact(() => {
        yelementsRef.current.set(target.id, data);
      });
    };

    const handleObjectModified = (e: any) => {
      const target = e.target;
      if (!target || !target.id) return;

      const data = target.toObject(['id', 'customType', 'objects']);
      ydocRef.current.transact(() => {
        yelementsRef.current.set(target.id, data);
      });
    };

    const handleSelectionCreated = (e: any) => {
      setSelectedObject(e.selected ? e.selected[0] : null);
    };

    const handleSelectionCleared = () => {
      setSelectedObject(null);
    };

    const handleMouseMove = (e: any) => {
      const pointer = canvas.getPointer(e.e);
      emitCursorMove({ x: pointer.x, y: pointer.y });
    };

    const handleMouseDown = (e: any) => {
      const pointer = canvas.getPointer(e.e);

      // Eraser Delete
      if (activeTool === 'eraser' && e.target) {
        const targetId = (e.target as any).id;
        canvas.remove(e.target);
        if (targetId) {
          ydocRef.current.transact(() => {
            yelementsRef.current.delete(targetId);
          });
        }
      }

      // Comments Placement Trigger
      if (placingComment) {
        setCommentCoords({ x: pointer.x, y: pointer.y });
        setPlacingComment(false);
      }
    };

    canvas.on('object:added', handleObjectAdded);
    canvas.on('object:modified', handleObjectModified);
    canvas.on('selection:created', handleSelectionCreated);
    canvas.on('selection:updated', handleSelectionCreated);
    canvas.on('selection:cleared', handleSelectionCleared);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:down', handleMouseDown);

    return () => {
      canvas.off('object:added', handleObjectAdded);
      canvas.off('object:modified', handleObjectModified);
      canvas.off('selection:created', handleSelectionCreated);
      canvas.off('selection:updated', handleSelectionCreated);
      canvas.off('selection:cleared', handleSelectionCleared);
      canvas.off('mouse:move', handleMouseMove);
      canvas.off('mouse:down', handleMouseDown);
    };
  }, [canvas, activeTool, placingComment]);

  // 7. API Handlers: Comments, Snapshots, and AI Diagram triggers
  const fetchComments = async () => {
    try {
      const res = await api.get(`/boards/${boardId}/comments`);
      if (res.data?.status === 'success') {
        setCommentsList(res.data.data);
      }
    } catch (err) {
      console.error('Fetch comments failed:', err);
    }
  };

  const fetchVersions = async () => {
    setVersionsLoading(true);
    try {
      const res = await api.get(`/boards/${boardId}/versions`);
      if (res.data?.status === 'success') {
        setVersionsList(res.data.data);
      }
    } catch (err) {
      console.error('Fetch versions failed:', err);
    } finally {
      setVersionsLoading(false);
    }
  };

  const handleCreateComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim() || !commentCoords) return;

    try {
      const res = await api.post(`/boards/${boardId}/comments`, {
        text: newCommentText,
        x: commentCoords.x,
        y: commentCoords.y,
      });

      if (res.data?.status === 'success') {
        setNewCommentText('');
        setCommentCoords(null);
        fetchComments();
      }
    } catch (err) {
      console.error('Failed to create comment:', err);
    }
  };

  const handleCreateReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentReplyText.trim() || !activeCommentThread) return;

    try {
      const res = await api.post(`/boards/${boardId}/comments`, {
        text: commentReplyText,
        x: activeCommentThread.x,
        y: activeCommentThread.y,
        parentId: activeCommentThread.id,
      });

      if (res.data?.status === 'success') {
        setCommentReplyText('');
        fetchComments();
        // Update active view
        setActiveCommentThread((prev: any) => ({
          ...prev,
          replies: [...(prev.replies || []), res.data.data],
        }));
      }
    } catch (err) {
      console.error('Failed to create reply:', err);
    }
  };

  const handleResolveComment = async (commentId: string) => {
    try {
      const res = await api.patch(`/boards/${boardId}/comments/${commentId}/resolve`);
      if (res.data?.status === 'success') {
        fetchComments();
        if (activeCommentThread?.id === commentId) {
          setActiveCommentThread(null);
        }
      }
    } catch (err) {
      console.error('Failed to resolve comment:', err);
    }
  };

  const handleCreateVersion = async () => {
    if (!confirm('Take a snapshot version of the current canvas?')) return;
    try {
      const res = await api.post(`/boards/${boardId}/versions`);
      if (res.data?.status === 'success') {
        alert(`Snapshot version #${res.data.data.version} created!`);
        fetchVersions();
      }
    } catch (err) {
      console.error('Failed to create snapshot:', err);
    }
  };

  const handleRestoreVersion = async (versionId: string, versionNum: number) => {
    if (!confirm(`Restore the board to snapshot version #${versionNum}? Current unsaved edits will be replaced.`)) return;

    try {
      const res = await api.post(`/boards/${boardId}/versions/${versionId}/restore`);
      if (res.data?.status === 'success') {
        alert('Board restored. Reloading canvas state...');
        window.location.reload();
      }
    } catch (err) {
      console.error('Failed to restore version:', err);
    }
  };

  const handleAIDiagram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim() || !canvas) return;

    setAILoading(true);
    try {
      const res = await api.post('/ai/diagram', {
        boardId,
        prompt: aiPrompt,
        x: 150,
        y: 150,
      });

      if (res.data?.status === 'success') {
        const shapes = res.data.data;
        
        ydocRef.current.transact(() => {
          shapes.forEach((shape: any) => {
            const id = Math.random().toString(36).substring(2, 9);
            let groupObj: fabric.Group;

            switch (shape.type) {
              case 'process':
              case 'decision':
              case 'terminator':
              case 'input':
                groupObj = createFlowchartNode({
                  left: shape.left,
                  top: shape.top,
                  type: shape.type,
                  fill: shape.fill,
                  stroke: shape.stroke,
                });
                break;
              case 'uml-class':
                groupObj = createUMLClassNode({ left: shape.left, top: shape.top });
                break;
              case 'er-entity':
                groupObj = createEREntityNode({ left: shape.left, top: shape.top });
                break;
              default:
                groupObj = createStickyNote({ left: shape.left, top: shape.top, text: shape.text });
                break;
            }

            // Sync structural elements to Yjs Elements Map
            const rawData = groupObj.toObject(['id', 'customType', 'objects']);
            yelementsRef.current.set(id, {
              ...rawData,
              id,
            });
          });
        });

        setShowAIModal(false);
        setAIPrompt('');
      }
    } catch (err) {
      console.error('AI Diagram failed:', err);
      alert('Failed to construct AI diagram.');
    } finally {
      setAILoading(false);
    }
  };

  const handleAutoLayout = async () => {
    if (!canvas) return;
    const objects = canvas.getObjects().map((o: any) => o.toObject(['id', 'customType', 'objects']));
    if (objects.length === 0) return;

    try {
      const res = await api.post('/ai/layout', { boardId, elements: objects });
      if (res.data?.status === 'success') {
        const arranged = res.data.data;
        ydocRef.current.transact(() => {
          arranged.forEach((obj: any) => {
            if (obj.id) {
              yelementsRef.current.set(obj.id, obj);
            }
          });
        });
      }
    } catch (err) {
      console.error('Auto layout failed:', err);
    }
  };

  // 8. File Upload Trigger (direct upload fallback handler)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !canvas) return;

    try {
      // 1. Get presigned URL
      const presignedRes = await api.post('/files/presigned', {
        boardId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      });

      if (presignedRes.data?.status === 'success') {
        const { uploadUrl, fileUrl, isMock } = presignedRes.data.data;

        // 2. Put file to URL
        if (isMock) {
          // Local server fallback PUT
          await api.put(uploadUrl, file, {
            headers: { 'Content-Type': file.type },
          });
        } else {
          // AWS S3 standard PUT
          await api.put(uploadUrl, file, {
            headers: { 'Content-Type': file.type },
          });
        }

        // 3. Draw image onto Canvas
        fabric.Image.fromURL(fileUrl, (img) => {
          img.set({
            left: 200,
            top: 200,
            scaleX: 0.4,
            scaleY: 0.4,
          });
          const id = Math.random().toString(36).substring(2, 9);
          (img as any).id = id;

          canvas.add(img);
          canvas.renderAll();

          // Sync to Yjs Map
          const data = img.toObject(['id']);
          ydocRef.current.transact(() => {
            yelementsRef.current.set(id, data);
          });
        });
      }
    } catch (err) {
      console.error('File upload failed:', err);
      alert('Failed to upload file.');
    }
  };

  // 9. Floating Context Panel controls
  const handleDuplicate = () => {
    if (!canvas || !selectedObject) return;
    selectedObject.clone((cloned: any) => {
      canvas.discardActiveObject();
      cloned.set({
        left: cloned.left + 30,
        top: cloned.top + 30,
        evented: true,
      });
      const id = Math.random().toString(36).substring(2, 9);
      cloned.id = id;

      canvas.add(cloned);
      canvas.setActiveObject(cloned);
      canvas.renderAll();

      const data = cloned.toObject(['id', 'customType', 'objects']);
      ydocRef.current.transact(() => {
        yelementsRef.current.set(id, data);
      });
    });
  };

  const handleBringToFront = () => {
    if (!canvas || !selectedObject) return;
    selectedObject.bringToFront();
    canvas.renderAll();
    const id = (selectedObject as any).id;
    if (id) {
      const data = selectedObject.toObject(['id', 'customType', 'objects']);
      ydocRef.current.transact(() => {
        yelementsRef.current.set(id, data);
      });
    }
  };

  const handleSendToBack = () => {
    if (!canvas || !selectedObject) return;
    selectedObject.sendToBack();
    canvas.renderAll();
    const id = (selectedObject as any).id;
    if (id) {
      const data = selectedObject.toObject(['id', 'customType', 'objects']);
      ydocRef.current.transact(() => {
        yelementsRef.current.set(id, data);
      });
    }
  };

  const handleDeleteSelected = () => {
    if (!canvas || !selectedObject) return;
    const id = (selectedObject as any).id;
    canvas.remove(selectedObject);
    canvas.discardActiveObject();
    canvas.renderAll();
    if (id) {
      ydocRef.current.transact(() => {
        yelementsRef.current.delete(id);
      });
    }
  };

  // 10. Toolbar placement actions
  const addRectangle = () => {
    if (!canvas) return;
    const rect = new fabric.Rect({
      left: 150,
      top: 150,
      width: 120,
      height: 80,
      fill: 'transparent',
      stroke: brushColor,
      strokeWidth: brushSize,
    });
    canvas.add(rect);
    canvas.setActiveObject(rect);
    setActiveTool('select');
  };

  const addCircle = () => {
    if (!canvas) return;
    const circle = new fabric.Circle({
      left: 150,
      top: 150,
      radius: 50,
      fill: 'transparent',
      stroke: brushColor,
      strokeWidth: brushSize,
    });
    canvas.add(circle);
    canvas.setActiveObject(circle);
    setActiveTool('select');
  };

  const addStickyNoteTool = () => {
    if (!canvas) return;
    const sticky = createStickyNote({ left: 150, top: 150, fill: '#fef08a' });
    canvas.add(sticky);
    canvas.setActiveObject(sticky);
    setActiveTool('select');
  };

  const addText = () => {
    if (!canvas) return;
    const text = new fabric.IText('Double click to edit', {
      left: 150,
      top: 150,
      fontFamily: 'Inter',
      fill: brushColor,
      fontSize: 20,
    });
    canvas.add(text);
    canvas.setActiveObject(text);
    setActiveTool('select');
  };

  const handleClear = () => {
    if (!canvas || !confirm('Clear entire board?')) return;
    ydocRef.current.transact(() => {
      yelementsRef.current.clear();
    });
  };

  const handleSave = () => {
    if (!canvas) return;
    const dataURL = canvas.toDataURL({ format: 'png' });
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = `whiteboard-${boardDetails?.title || 'board'}.png`;
    link.click();
  };

  const copyInviteLink = () => {
    if (!boardDetails) return;
    navigator.clipboard.writeText(boardDetails.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-slate-100 dark:bg-slate-900 select-none relative">
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Top Navbar */}
        <div className="absolute top-4 left-4 right-4 h-14 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-xl px-4 flex items-center justify-between shadow-sm z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-600 dark:text-slate-300"
            >
              <ChevronLeft size={18} />
            </button>
            <div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-none text-outfit">
                {boardDetails?.title || 'Loading Board...'}
              </h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Collaborative Workspace
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* AI Assistant */}
            <button
              onClick={() => setShowAIModal(true)}
              className="flex items-center gap-1 bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              <Sparkles size={13} />
              AI Diagram
            </button>

            {/* Auto Layout */}
            <button
              onClick={handleAutoLayout}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-600 dark:text-slate-300"
              title="Auto Grid Layout"
            >
              <Plus size={16} className="rotate-45" />
            </button>

            {/* Version timeline */}
            <button
              onClick={() => {
                setSidebarPanel(sidebarPanel === 'versions' ? null : 'versions');
                fetchVersions();
              }}
              className={`p-1.5 rounded-lg transition-colors ${sidebarPanel === 'versions' ? 'bg-primary/10 text-primary' : 'hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
              title="Version Snapshots"
            >
              <Clock size={16} />
            </button>

            {/* Presentation Mode Presenter Toggle */}
            <button
              onClick={() => {
                setPresenting(!presenting);
                if (!presenting) setFollowingPresenter(false); // Can't follow if you are presenting
              }}
              className={`p-1.5 rounded-lg transition-colors ${presenting ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30' : 'hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
              title={presenting ? 'Stop Presenting' : 'Start Presenting (Spotlight)'}
            >
              <Tv size={16} className={presenting ? 'animate-pulse' : ''} />
            </button>

            {/* Presentation Follow Mode listener */}
            {!presenting && (
              <button
                onClick={() => setFollowingPresenter(!followingPresenter)}
                className={`p-1.5 rounded-lg transition-colors ${followingPresenter ? 'bg-blue-500/25 text-blue-500' : 'hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
                title={followingPresenter ? 'Stop Following Presenter View' : 'Follow Presenter View'}
              >
                <Users size={16} className={followingPresenter ? 'animate-bounce' : ''} />
              </button>
            )}

            {/* WebRTC voice call toggler */}
            <button
              onClick={handleToggleVoiceCall}
              className={`p-1.5 rounded-lg transition-colors ${voiceCallJoined ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30' : 'hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
              title={voiceCallJoined ? 'Leave Voice call' : 'Join Voice room'}
            >
              {voiceCallJoined ? <Mic size={16} /> : <MicOff size={16} />}
            </button>

            {/* Screen sharing toggler */}
            <button
              onClick={handleToggleScreenShare}
              className={`p-1.5 rounded-lg transition-colors ${screenSharing ? 'bg-indigo-500/20 text-indigo-500 border border-indigo-500/30' : 'hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
              title={screenSharing ? 'Stop Screen Sharing' : 'Share Screen'}
            >
              {screenSharing ? <Monitor size={16} className="animate-pulse" /> : <MonitorOff size={16} />}
            </button>

            {/* Comments side-panel toggle */}
            <button
              onClick={() => setSidebarPanel(sidebarPanel === 'comments' ? null : 'comments')}
              className={`p-1.5 rounded-lg transition-colors ${sidebarPanel === 'comments' ? 'bg-primary/10 text-primary' : 'hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
              title="Comment Threads"
            >
              <MessageSquare size={16} />
            </button>

            {/* AI Copilot Sidepanel Toggle */}
            <button
              onClick={() => setSidebarPanel(sidebarPanel === 'ai-copilot' ? null : 'ai-copilot')}
              className={`p-1.5 rounded-lg transition-colors ${sidebarPanel === 'ai-copilot' ? 'bg-violet-600/10 text-violet-600 border border-violet-600/20' : 'hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
              title="AI Copilot Board Assistant"
            >
              <Cpu size={16} />
            </button>

            {/* File Upload Trigger */}
            <label className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-colors text-slate-600 dark:text-slate-300">
              <Upload size={16} />
              <input type="file" onChange={handleFileUpload} accept="image/*,application/pdf" className="hidden" />
            </label>

            <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 px-2.5 py-1 rounded-lg text-xs text-muted-foreground border border-border">
              <Users size={14} />
              <span className="hidden sm:inline">{collaborators.size + 1} online</span>
            </div>

            {/* Share Link */}
            <button
              onClick={copyInviteLink}
              className="flex items-center gap-1 bg-primary hover:bg-primary/95 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              {copied ? <Check size={13} /> : <Share2 size={13} />}
              {copied ? 'Copied' : 'Share'}
            </button>
          </div>
        </div>

        {/* Floating Context Panel for Selected Object */}
        {selectedObject && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-1.5 flex items-center gap-1.5 shadow-lg z-30">
            <button
              onClick={handleDuplicate}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300 rounded text-xs font-semibold"
            >
              Duplicate
            </button>
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-800" />
            <button
              onClick={handleBringToFront}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300 rounded"
              title="Bring to Front"
            >
              <ArrowUp size={14} />
            </button>
            <button
              onClick={handleSendToBack}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300 rounded"
              title="Send to Back"
            >
              <ArrowDown size={14} />
            </button>
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-800" />
            <button
              onClick={handleDeleteSelected}
              className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 rounded"
              title="Delete Element"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}

        {/* Active Placement Comments prompt */}
        {commentCoords && (
          <div
            style={{ left: commentCoords.x, top: commentCoords.y + 40 }}
            className="absolute bg-white dark:bg-slate-950 border border-border shadow-xl rounded-xl p-3.5 z-40 w-64 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                New Comment Thread
              </span>
              <button
                onClick={() => setCommentCoords(null)}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                Close
              </button>
            </div>
            <form onSubmit={handleCreateComment} className="flex gap-2">
              <input
                type="text"
                required
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                placeholder="Type comment..."
                className="flex-1 px-2.5 py-1.5 border border-border rounded-lg text-xs bg-slate-50 dark:bg-slate-900 focus:outline-none"
              />
              <button
                type="submit"
                className="bg-primary hover:bg-primary/95 text-white p-1.5 rounded-lg"
              >
                <Send size={12} />
              </button>
            </form>
          </div>
        )}

        {/* Cursors Sync Layer */}
        <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
          {Array.from(collaborators.values()).map((collab) => {
            if (!collab.cursor) return null;
            return (
              <div
                key={collab.socketId}
                style={{
                  left: collab.cursor.x,
                  top: collab.cursor.y,
                  transition: 'all 0.08s ease-out'
                }}
                className="absolute pointer-events-none flex flex-col items-start gap-1"
              >
                <MousePointer
                  size={15}
                  style={{
                    color: collab.color,
                    fill: collab.color
                  }}
                />
                <span
                  style={{ backgroundColor: collab.color }}
                  className="px-1.5 py-0.5 text-[9px] font-semibold text-white rounded shadow-sm opacity-90 whitespace-nowrap"
                >
                  {collab.name}
                </span>
              </div>
            );
          })}
        </div>

        {/* Drawing Canvas wrapper */}
        <div ref={containerRef} className="flex-1 w-full h-full relative bg-slate-50 dark:bg-slate-950">
          <canvas ref={canvasRef} id="canvas" />
        </div>

        {/* Toolbar Footer */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/95 dark:bg-slate-950/95 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 flex items-center gap-2 shadow-lg z-30">
          <button
            onClick={() => setActiveTool('select')}
            className={`p-2 rounded-lg transition-colors ${activeTool === 'select' ? 'bg-primary text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-500'}`}
            title="Selection tool"
          >
            <MousePointer size={18} />
          </button>

          <button
            onClick={() => setActiveTool('pen')}
            className={`p-2 rounded-lg transition-colors ${activeTool === 'pen' ? 'bg-primary text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-500'}`}
            title="Pen brush"
          >
            <PenTool size={18} />
          </button>

          <button
            onClick={addRectangle}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-500 transition-colors"
            title="Draw Rectangle"
          >
            <Square size={18} />
          </button>

          <button
            onClick={addCircle}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-500 transition-colors"
            title="Draw Circle"
          >
            <Circle size={18} />
          </button>

          <button
            onClick={addStickyNoteTool}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-500 transition-colors"
            title="Sticky Note"
          >
            <Copy size={18} />
          </button>

          <button
            onClick={addText}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-500 transition-colors"
            title="Add Text"
          >
            <Type size={18} />
          </button>

          <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

          {/* Comment placing helper */}
          <button
            onClick={() => setPlacingComment(true)}
            className={`p-2 rounded-lg transition-colors ${placingComment ? 'bg-orange-500 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-500'}`}
            title="Place Comment Pin"
          >
            <MessageSquare size={18} />
          </button>

          <button
            onClick={() => setActiveTool('eraser')}
            className={`p-2 rounded-lg transition-colors ${activeTool === 'eraser' ? 'bg-primary text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-500'}`}
            title="Eraser tool"
          >
            <Eraser size={18} />
          </button>

          <button
            onClick={handleClear}
            className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 transition-colors"
            title="Clear canvas"
          >
            <Trash2 size={18} />
          </button>

          <input
            type="color"
            value={brushColor}
            onChange={(e) => setBrushColor(e.target.value)}
            className="w-6 h-6 rounded cursor-pointer border border-border p-0 bg-transparent overflow-hidden"
            title="Brush color picker"
          />
        </div>

        {/* Zoom footer widgets */}
        <div className="absolute bottom-6 left-6 bg-white/95 dark:bg-slate-950/95 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 flex items-center gap-2 shadow-lg z-30 text-slate-500">
          <button onClick={zoomOut} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-850 rounded" title="Zoom Out">
            <ZoomOut size={16} />
          </button>
          <span className="text-xs font-semibold min-w-[32px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={zoomIn} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-850 rounded" title="Zoom In">
            <ZoomIn size={16} />
          </button>
        </div>

        {/* Export image buttons */}
        <div className="absolute bottom-6 right-6 bg-white/95 dark:bg-slate-950/95 border border-slate-200 dark:border-slate-800 rounded-xl p-1.5 flex items-center gap-1.5 shadow-lg z-30">
          <button
            onClick={handleSave}
            className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            <Download size={14} />
            Export PNG
          </button>
        </div>
      </div>

      {/* RIGHT SIDE PANEL (Comments Threads / Version Logs) */}
      {sidebarPanel && (
        <div className="w-80 h-full bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-850 flex flex-col z-30">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 text-outfit">
              {sidebarPanel === 'comments' ? 'Comment Threads' : sidebarPanel === 'versions' ? 'Version History' : 'AI Board Copilot'}
            </h3>
            <button
              onClick={() => {
                setSidebarPanel(null);
                setActiveCommentThread(null);
              }}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Close
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
            {sidebarPanel === 'comments' ? (
              activeCommentThread ? (
                // View specific Comment thread and replies
                <div className="space-y-4">
                  <button
                    onClick={() => setActiveCommentThread(null)}
                    className="text-xs text-primary font-semibold flex items-center gap-1"
                  >
                    ← Back to threads
                  </button>
                  
                  <div className="border border-border rounded-xl p-3 bg-slate-50 dark:bg-slate-900 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">{activeCommentThread.user?.name}</span>
                      <span className="text-[9px] text-muted-foreground">
                        {new Date(activeCommentThread.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-350">{activeCommentThread.text}</p>
                    <button
                      onClick={() => handleResolveComment(activeCommentThread.id)}
                      className="text-[10px] text-primary hover:underline font-semibold"
                    >
                      Resolve Thread
                    </button>
                  </div>

                  {/* Replies mapping */}
                  <div className="pl-4 border-l-2 border-slate-200 dark:border-slate-800 space-y-3">
                    {activeCommentThread.replies?.map((reply: any) => (
                      <div key={reply.id} className="border border-border/60 rounded-xl p-2.5 bg-white dark:bg-slate-950 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[11px]">{reply.user?.name}</span>
                          <span className="text-[9px] text-muted-foreground">
                            {new Date(reply.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400">{reply.text}</p>
                      </div>
                    ))}
                  </div>

                  {/* Reply Form */}
                  <form onSubmit={handleCreateReply} className="flex gap-2 pt-2">
                    <input
                      type="text"
                      required
                      value={commentReplyText}
                      onChange={(e) => setCommentReplyText(e.target.value)}
                      placeholder="Reply to thread..."
                      className="flex-1 px-3 py-1.5 border border-border rounded-lg text-xs bg-slate-50 dark:bg-slate-900 focus:outline-none"
                    />
                    <button type="submit" className="bg-primary hover:bg-primary/95 text-white px-3 rounded-lg text-xs font-semibold">
                      Reply
                    </button>
                  </form>
                </div>
              ) : (
                // Thread listings
                <div className="space-y-3">
                  {commentsList.map((comm) => (
                    <div
                      key={comm.id}
                      onClick={() => setActiveCommentThread(comm)}
                      className="border border-border rounded-xl p-3.5 hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer space-y-2 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs">{comm.user?.name}</span>
                        <span className="text-[9px] text-muted-foreground">
                          {new Date(comm.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2">{comm.text}</p>
                      <div className="flex items-center justify-between pt-1 text-[10px] text-muted-foreground">
                        <span>{comm.replies?.length || 0} replies</span>
                        {comm.resolved && (
                          <span className="text-emerald-500 font-bold">Resolved</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : sidebarPanel === 'versions' ? (
              // Versions timeline
              <div className="space-y-4">
                <button
                  onClick={handleCreateVersion}
                  className="w-full flex items-center justify-center gap-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-805 text-slate-700 dark:text-slate-200 py-2 rounded-lg text-xs font-semibold transition-colors border border-border"
                >
                  <Plus size={14} />
                  Save New Version
                </button>

                {versionsLoading ? (
                  <div className="flex h-32 items-center justify-center">
                    <Loader2 size={24} className="animate-spin text-primary" />
                  </div>
                ) : versionsList.length === 0 ? (
                  <div className="text-center py-8 text-xs text-muted-foreground">
                    No version snapshots found.
                  </div>
                ) : (
                  <div className="relative border-l border-slate-200 dark:border-slate-805 pl-4 ml-2 space-y-6">
                    {versionsList.map((v) => (
                      <div key={v.id} className="relative space-y-1">
                        {/* Timeline node */}
                        <div className="absolute -left-[21px] top-1 h-3.5 w-3.5 rounded-full border-2 border-primary bg-white dark:bg-slate-950" />
                        <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100">
                          Version #{v.version}
                        </h4>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(v.createdAt).toLocaleString()}
                        </p>
                        <button
                          onClick={() => handleRestoreVersion(v.id, v.version)}
                          className="text-[10px] text-primary hover:underline font-semibold block pt-1"
                        >
                          Restore this state
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              // AI Copilot Panel
              <div className="flex flex-col h-[calc(100vh-120px)] space-y-4">
                {/* Copilot Chat timeline */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs no-scrollbar">
                  {copilotHistory.map((msg, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-xl border leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-850 dark:text-slate-200'
                          : 'bg-violet-50/50 dark:bg-violet-950/20 border-violet-100/50 dark:border-violet-950/50 text-slate-800 dark:text-slate-350'
                      }`}
                    >
                      <span className="block font-bold mb-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                        {msg.role === 'user' ? 'You' : 'AI Assistant'}
                      </span>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ))}
                  {copilotLoading && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground p-3">
                      <Loader2 size={13} className="animate-spin" />
                      Thinking...
                    </div>
                  )}
                </div>

                {/* Quick actions grid */}
                <div className="grid grid-cols-2 gap-2 border-t border-slate-200 dark:border-slate-800 pt-3">
                  <button
                    onClick={() => handleCopilotSubmit(undefined, 'explain')}
                    disabled={copilotLoading}
                    className="p-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 text-[10px] font-bold rounded-lg border border-slate-205 dark:border-slate-800 text-left hover:text-primary transition-colors text-slate-700 dark:text-slate-300"
                  >
                    💡 Explain Diagram
                  </button>
                  <button
                    onClick={() => handleCopilotSubmit(undefined, 'improve')}
                    disabled={copilotLoading}
                    className="p-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 text-[10px] font-bold rounded-lg border border-slate-205 dark:border-slate-800 text-left hover:text-primary transition-colors text-slate-700 dark:text-slate-300"
                  >
                    ⚡ Improve Arch
                  </button>
                  <button
                    onClick={() => handleCopilotSubmit(undefined, 'document')}
                    disabled={copilotLoading}
                    className="p-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 text-[10px] font-bold rounded-lg border border-slate-205 dark:border-slate-800 text-left hover:text-primary transition-colors text-slate-700 dark:text-slate-300"
                  >
                    📝 Generate Docs
                  </button>
                  <button
                    onClick={() => handleCopilotSubmit(undefined, 'plan')}
                    disabled={copilotLoading}
                    className="p-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 text-[10px] font-bold rounded-lg border border-slate-205 dark:border-slate-800 text-left hover:text-primary transition-colors text-slate-700 dark:text-slate-300"
                  >
                    📅 Project Plan
                  </button>
                </div>

                {/* Query submission form */}
                <form onSubmit={(e) => handleCopilotSubmit(e)} className="flex gap-2 border-t border-slate-200 dark:border-slate-800 pt-3">
                  <input
                    type="text"
                    required
                    value={copilotPrompt}
                    onChange={(e) => setCopilotPrompt(e.target.value)}
                    placeholder="Ask assistant something..."
                    className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={copilotLoading}
                    className="bg-violet-600 hover:bg-violet-650 text-white px-3 rounded-lg text-xs font-semibold disabled:opacity-50"
                  >
                    Send
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI DIAGRAM PROMPT MODAL */}
      {showAIModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-950 border border-slate-250 dark:border-slate-800 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="text-violet-600 animate-pulse" size={20} />
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 text-outfit">
                AI Diagram Assistant
              </h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Provide a prompt to automatically draw editable UMLs, ER Diagrams, or microservice architecture maps on the canvas.
            </p>

            <form onSubmit={handleAIDiagram} className="space-y-4">
              <div>
                <textarea
                  required
                  rows={3}
                  value={aiPrompt}
                  onChange={(e) => setAIPrompt(e.target.value)}
                  placeholder="e.g. Create Netflix Microservices Architecture layout..."
                  className="w-full px-3 py-2 border border-border bg-slate-50 dark:bg-slate-900 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary resize-none text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAIModal(false);
                    setAIPrompt('');
                  }}
                  className="px-4 py-2 border border-border hover:bg-slate-100 dark:hover:bg-slate-900 text-xs font-semibold rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={aiLoading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-750 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50"
                >
                  {aiLoading && <Loader2 size={13} className="animate-spin" />}
                  Generate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
