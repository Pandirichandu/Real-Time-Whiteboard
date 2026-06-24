import { fabric } from 'fabric';

export interface FabricObjectWithId extends fabric.Object {
  id?: string;
}

/**
 * Creates a premium glassmorphic or shadowed Sticky Note element
 */
export const createStickyNote = (options: {
  left: number;
  top: number;
  text?: string;
  fill?: string;
}): fabric.Group => {
  const { left, top, text = 'Idea', fill = '#fef08a' } = options;

  // Yellow sticky background Rect
  const rect = new fabric.Rect({
    width: 150,
    height: 150,
    fill: fill,
    stroke: '#eab308',
    strokeWidth: 1,
    shadow: new fabric.Shadow({
      color: 'rgba(0, 0, 0, 0.15)',
      blur: 8,
      offsetX: 4,
      offsetY: 4,
    }),
  });

  // Editable inner text
  const textElement = new fabric.IText(text, {
    fontSize: 16,
    fontFamily: 'Inter',
    fill: '#1e293b',
    originX: 'center',
    originY: 'center',
    left: 75,
    top: 75,
    textAlign: 'center',
    width: 130,
  });

  const group = new fabric.Group([rect, textElement], {
    left,
    top,
    subTargetCheck: true,
  });

  // Attach a custom type for identification in serialize/deserialize loops
  (group as any).customType = 'sticky';

  return group;
};

/**
 * Creates flowchart process nodes or decision diamonds
 */
export const createFlowchartNode = (options: {
  left: number;
  top: number;
  type: 'process' | 'decision' | 'terminator' | 'input';
  fill?: string;
  stroke?: string;
}): fabric.Group => {
  const { left, top, type, fill = '#eff6ff', stroke = '#2563eb' } = options;
  let shape: fabric.Object;

  const strokeWidth = 2;

  switch (type) {
    case 'decision':
      // Diamond shape path
      shape = new fabric.Path('M 75 0 L 150 75 L 75 150 L 0 75 Z', {
        fill,
        stroke,
        strokeWidth,
        width: 150,
        height: 150,
      });
      break;

    case 'terminator':
      // Rounded process capsule
      shape = new fabric.Rect({
        width: 150,
        height: 80,
        rx: 40,
        ry: 40,
        fill,
        stroke,
        strokeWidth,
      });
      break;

    case 'input':
      // Parallelogram path
      shape = new fabric.Path('M 25 0 L 150 0 L 125 80 L 0 80 Z', {
        fill,
        stroke,
        strokeWidth,
        width: 150,
        height: 80,
      });
      break;

    case 'process':
    default:
      shape = new fabric.Rect({
        width: 150,
        height: 90,
        rx: 6,
        ry: 6,
        fill,
        stroke,
        strokeWidth,
      });
      break;
  }

  const label = new fabric.IText(type.toUpperCase(), {
    fontSize: 12,
    fontFamily: 'Inter',
    fill: '#1e293b',
    originX: 'center',
    originY: 'center',
    left: shape.width ? shape.width / 2 : 75,
    top: shape.height ? shape.height / 2 : 45,
    textAlign: 'center',
    fontWeight: 'bold',
  });

  const group = new fabric.Group([shape, label], {
    left,
    top,
    subTargetCheck: true,
  });

  (group as any).customType = `flow-${type}`;

  return group;
};

/**
 * Creates standard UML Class representations
 */
export const createUMLClassNode = (options: {
  left: number;
  top: number;
  className?: string;
}): fabric.Group => {
  const { left, top, className = 'UserClass' } = options;

  const width = 180;
  const headerHeight = 35;
  const bodyHeight = 85;

  const rect = new fabric.Rect({
    width,
    height: headerHeight + bodyHeight,
    fill: '#f8fafc',
    stroke: '#475569',
    strokeWidth: 2,
    rx: 4,
    ry: 4,
  });

  // Divider line separating Class header and properties
  const line = new fabric.Line([0, headerHeight, width, headerHeight], {
    stroke: '#475569',
    strokeWidth: 2,
  });

  const headerText = new fabric.IText(className, {
    fontSize: 13,
    fontFamily: 'Inter',
    fontWeight: 'bold',
    fill: '#0f172a',
    left: 12,
    top: 8,
  });

  const bodyText = new fabric.IText('+ id: String\n+ name: String\n+ email: String\n\n+ save(): Void', {
    fontSize: 11,
    fontFamily: 'Inter',
    fill: '#334155',
    left: 12,
    top: 45,
    lineHeight: 1.3,
  });

  const group = new fabric.Group([rect, line, headerText, bodyText], {
    left,
    top,
    subTargetCheck: true,
  });

  (group as any).customType = 'uml-class';

  return group;
};

/**
 * Creates Entity Relationship (ER) diagrams database table elements
 */
export const createEREntityNode = (options: {
  left: number;
  top: number;
  entityName?: string;
}): fabric.Group => {
  const { left, top, entityName = 'users_table' } = options;

  const width = 180;
  const headerHeight = 30;
  const bodyHeight = 80;

  const rect = new fabric.Rect({
    width,
    height: headerHeight + bodyHeight,
    fill: '#fff7ed',
    stroke: '#ea580c',
    strokeWidth: 2,
    rx: 2,
    ry: 2,
  });

  const line = new fabric.Line([0, headerHeight, width, headerHeight], {
    stroke: '#ea580c',
    strokeWidth: 2,
  });

  const headerText = new fabric.IText(entityName, {
    fontSize: 12,
    fontFamily: 'Inter',
    fontWeight: 'bold',
    fill: '#7c2d12',
    left: 10,
    top: 6,
  });

  const bodyText = new fabric.IText('🔑 id: INT (PK)\n👤 username: VARCHAR\n✉️ email: VARCHAR\n🕒 created_at: DATETIME', {
    fontSize: 10,
    fontFamily: 'Inter',
    fill: '#431407',
    left: 10,
    top: 38,
    lineHeight: 1.4,
  });

  const group = new fabric.Group([rect, line, headerText, bodyText], {
    left,
    top,
    subTargetCheck: true,
  });

  (group as any).customType = 'er-entity';

  return group;
};
