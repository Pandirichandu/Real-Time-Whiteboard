import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth';
import { prisma } from '../config/db';
import OpenAI from 'openai';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export const diagramSchema = z.object({
  body: z.object({
    boardId: z.string().uuid(),
    prompt: z.string().min(1),
    x: z.number().optional(),
    y: z.number().optional(),
  }),
});

/**
 * Generates structured shapes array representing diagrams based on prompt text
 */
export const generateDiagram = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  const { prompt, x = 100, y = 100 } = req.body;

  try {
    if (openai) {
      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are an expert system architect and diagram designer. 
Generate a structural diagram representing the requested prompt.
Your output must be a JSON object containing a key "elements" which is an array of objects to draw on a whiteboard canvas.
Each element object must match one of the following formats:
1. Process Box: { "type": "process", "text": "Label", "left": number, "top": number, "fill": "hexColor", "stroke": "hexColor" }
2. Decision Diamond: { "type": "decision", "text": "Label", "left": number, "top": number, "fill": "hexColor", "stroke": "hexColor" }
3. Capsule Terminator: { "type": "terminator", "text": "Label", "left": number, "top": number, "fill": "hexColor", "stroke": "hexColor" }
4. UML Class Box: { "type": "uml-class", "text": "ClassName\\n+ attributes\\n+ methods", "left": number, "top": number }
5. ER Entity: { "type": "er-entity", "text": "tableName\\n🔑 id (PK)\\nfields", "left": number, "top": number }

Arrange the coordinates hierarchically so that the diagram is laid out logically (top-to-bottom or left-to-right flow) and does not overlap. Keep spacing around 180 to 220 pixels.`,
          },
          {
            role: 'user',
            content: `Generate a diagram layout for the following prompt: "${prompt}" starting around position left=${x}, top=${y}`,
          },
        ],
      });

      const resultText = response.choices[0]?.message?.content || '{}';
      const parsedData = JSON.parse(resultText);

      return res.json({
        status: 'success',
        data: parsedData.elements || [],
      });
    } else {
      // Mock Fallback diagrams for quick developer preview without API keys
      console.log('OpenAI key missing. Returning mock architectural diagrams.');
      
      const lowerPrompt = prompt.toLowerCase();
      let elements = [];

      if (lowerPrompt.includes('netflix') || lowerPrompt.includes('architecture')) {
        elements = [
          { type: 'terminator', text: 'Client UI', left: x, top: y, fill: '#fee2e2', stroke: '#ef4444' },
          { type: 'process', text: 'API Gateway', left: x + 200, top: y, fill: '#eff6ff', stroke: '#3b82f6' },
          { type: 'decision', text: 'Auth Router', left: x + 400, top: y - 25, fill: '#faf5ff', stroke: '#a855f7' },
          { type: 'process', text: 'User Service', left: x + 600, top: y - 100, fill: '#f0fdf4', stroke: '#22c55e' },
          { type: 'process', text: 'Stream Service', left: x + 600, top: y + 100, fill: '#fffbeb', stroke: '#eab308' },
        ];
      } else {
        // Generic Flowchart diagram
        elements = [
          { type: 'terminator', text: 'Start Flow', left: x, top: y, fill: '#f0fdf4', stroke: '#22c55e' },
          { type: 'process', text: 'Process Request', left: x + 200, top: y - 5, fill: '#eff6ff', stroke: '#3b82f6' },
          { type: 'decision', text: 'Request Valid?', left: x + 400, top: y - 30, fill: '#fffbeb', stroke: '#eab308' },
          { type: 'terminator', text: 'Success End', left: x + 600, top: y, fill: '#eff6ff', stroke: '#3b82f6' },
        ];
      }

      return res.json({
        status: 'success',
        data: elements,
      });
    }
  } catch (error) {
    console.error('AI Diagram generation error:', error);
    res.status(500).json({ status: 'error', message: 'Diagram generation failed' });
  }
};

/**
 * Summarizes the entire contents of a board
 */
export const generateSummary = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  const { boardId } = req.params;

  try {
    const board = await prisma.board.findUnique({
      where: { id: boardId },
    });

    if (!board) {
      return res.status(404).json({ status: 'error', message: 'Board not found' });
    }

    if (openai) {
      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: [
          {
            role: 'system',
            content: 'Summarize the board project goals and activities. Be concise and write in a bulleted professional layout.',
          },
          {
            role: 'user',
            content: `Summarize the board title "${board.title}" described as: "${board.description || 'No description'}"`,
          },
        ],
      });

      return res.json({
        status: 'success',
        data: response.choices[0]?.message?.content || 'No summary available.',
      });
    } else {
      return res.json({
        status: 'success',
        data: `### Executive Board Summary: ${board.title}\n\n- **Project Focus**: ${board.description || 'General collaboration and planning workspace'}.\n- **Status**: Active development.\n- **Scope**: Multi-user brainstorming, diagram designing, and real-time conceptual alignment.`,
      });
    }
  } catch (error) {
    console.error('Summary error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to generate summary' });
  }
};

/**
 * Arranges board elements logically to avoid overlaps
 */
export const autoLayout = async (req: AuthenticatedRequest, res: Response) => {
  const { elements } = req.body;
  if (!Array.isArray(elements)) {
    return res.status(400).json({ status: 'error', message: 'Elements array required' });
  }

  try {
    // Basic Grid arrangement algorithm to separate overlapping components
    const colCount = Math.ceil(Math.sqrt(elements.length));
    const arranged = elements.map((elem: any, idx: number) => {
      const row = Math.floor(idx / colCount);
      const col = idx % colCount;
      return {
        ...elem,
        left: 100 + col * 220,
        top: 100 + row * 180,
      };
    });

    res.json({
      status: 'success',
      data: arranged,
    });
  } catch (error) {
    console.error('Auto layout error:', error);
    res.status(500).json({ status: 'error', message: 'Auto layout failed' });
  }
};

/**
 * Context-aware AI Board Assistant Copilot
 */
export const copilot = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  const { prompt, action, elements = [] } = req.body;

  try {
    // Format board elements context
    const elementsSummary = elements.map((el: any) => {
      return `- Type: ${el.customType || el.type}, Position: (${Math.round(el.left || 0)}, ${Math.round(el.top || 0)}), Content/Text: "${el.text || ''}"`;
    }).join('\n');

    const promptContext = `
You are an advanced Enterprise AI Workspace Copilot.
Here is the structural context of the user's current whiteboard canvas elements:
${elementsSummary || '(No elements currently on board)'}

User Request: "${prompt || 'Help me analyze this canvas'}"
Target Action Requested: "${action || 'explain'}" (Actions include: explain, improve, document, plan)

Based on this context and action, generate a comprehensive, highly professional, detailed markdown report. Provide concrete architectural advice, clear descriptions, or structured task timelines where applicable.
`;

    if (openai) {
      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are an elite Enterprise System Architect and Agile Project Manager assisting team members on a collaborative whiteboard.',
          },
          {
            role: 'user',
            content: promptContext,
          },
        ],
      });

      return res.json({
        status: 'success',
        data: response.choices[0]?.message?.content || 'No feedback received from Copilot.',
      });
    } else {
      // Return a premium mock response based on action
      let responseText = '';
      
      if (action === 'explain') {
        responseText = `### AI Diagram Analysis & Walkthrough\n\nBased on your **${elements.length} elements** on the whiteboard, here is the architectural breakdown:\n\n1. **Core Elements**: Identified ${elements.filter((e: any) => e.customType?.includes('flow') || e.type === 'process').length} process/flowchart blocks and ${elements.filter((e: any) => e.customType === 'uml-class' || e.customType === 'er-entity').length} database/class schemas.\n2. **Flow Layout**: Elements flow across coordinates. It suggests an integrated frontend-to-backend transactional flow with relational table representations.\n3. **Business Process**: Shows a modular microservices pattern handling client entries routing via active API controllers.`;
      } else if (action === 'improve') {
        responseText = `### AI Architectural Recommendations\n\nTo harden this current system architecture design, consider the following structural changes:\n\n- **Security**: Implement an API Gateway pattern to throttle traffic and execute early OAuth2 token checks.\n- **Scalability**: Decouple the microservices with an asynchronous message queue (e.g. RabbitMQ / Kafka) to handle heavy write operations.\n- **Caching**: Introduce a Redis caching layer for read-heavy database schemas to reduce main DB bottlenecks.`;
      } else if (action === 'document') {
        responseText = `### Architecture & Component Specifications\n\nThis technical document details the board configuration:\n\n#### 1. Components Catalog\n${elements.map((el: any, i: number) => `* **Component ${i + 1}** (${el.customType || el.type}): "${el.text || 'Untitled'}" at coordinates (${Math.round(el.left || 0)}, ${Math.round(el.top || 0)})`).join('\n')}\n\n#### 2. Operations Flow\nRequests initiate at the user-facing gateways and dispatch parameters to backend entities.`;
      } else {
        responseText = `### Suggested Project Implementation Plan\n\nHere is a phased Gantt schedule to bring this whiteboard concept to production:\n\n| Phase | Goal | Target Duration | Estimated Resources |\n| :--- | :--- | :--- | :--- |\n| **Phase 1** | Implement and unit-test core database models | 1 week | 1 Backend Engineer |\n| **Phase 2** | Build and document API controller routes | 2 weeks | 2 Fullstack Engineers |\n| **Phase 3** | Setup Redis cache, CI pipelines & deploy | 1 week | 1 DevOps Engineer |`;
      }

      return res.json({
        status: 'success',
        data: responseText,
      });
    }
  } catch (error) {
    console.error('AI Copilot error:', error);
    res.status(500).json({ status: 'error', message: 'AI Copilot request failed' });
  }
};
