import { create } from 'zustand';

export type ToolType = 'select' | 'pen' | 'rect' | 'circle' | 'triangle' | 'sticky' | 'eraser' | 'text' | 'laser';

interface BoardState {
  boardId: string | null;
  activeTool: ToolType;
  brushColor: string;
  brushSize: number;
  zoom: number;
  panOffset: { x: number; y: number };
  
  setBoardId: (id: string | null) => void;
  setActiveTool: (tool: ToolType) => void;
  setBrushColor: (color: string) => void;
  setBrushSize: (size: number) => void;
  setZoom: (zoom: number) => void;
  setPanOffset: (offset: { x: number; y: number }) => void;
}

export const useBoardStore = create<BoardState>((set) => ({
  boardId: null,
  activeTool: 'select',
  brushColor: '#000000',
  brushSize: 5,
  zoom: 1,
  panOffset: { x: 0, y: 0 },
  
  setBoardId: (boardId) => set({ boardId }),
  setActiveTool: (activeTool) => set({ activeTool }),
  setBrushColor: (brushColor) => set({ brushColor }),
  setBrushSize: (brushSize) => set({ brushSize }),
  setZoom: (zoom) => set({ zoom }),
  setPanOffset: (panOffset) => set({ panOffset }),
}));
