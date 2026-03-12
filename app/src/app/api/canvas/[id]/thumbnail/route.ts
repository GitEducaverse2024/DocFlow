import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

interface CanvasNode {
  id: string;
  type?: string;
  position?: { x: number; y: number };
}

interface FlowData {
  nodes: CanvasNode[];
}

const NODE_COLORS: Record<string, string> = {
  start: '#10b981',
  agent: '#8b5cf6',
  project: '#3b82f6',
  connector: '#f97316',
  checkpoint: '#f59e0b',
  merge: '#06b6d4',
  condition: '#eab308',
  output: '#10b981',
  default: '#71717a',
};

function getNodeColor(type?: string): string {
  return NODE_COLORS[type || 'default'] || NODE_COLORS.default;
}

function generateSVG(nodes: CanvasNode[]): string {
  const WIDTH = 200;
  const HEIGHT = 120;
  const PADDING = 20;
  const NODE_W = 16;
  const NODE_H = 10;

  if (nodes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><rect width="${WIDTH}" height="${HEIGHT}" fill="#18181b" rx="4"/></svg>`;
  }

  if (nodes.length === 1) {
    const node = nodes[0];
    const color = getNodeColor(node.type);
    const cx = WIDTH / 2 - NODE_W / 2;
    const cy = HEIGHT / 2 - NODE_H / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><rect width="${WIDTH}" height="${HEIGHT}" fill="#18181b" rx="4"/><rect x="${cx}" y="${cy}" width="${NODE_W}" height="${NODE_H}" rx="2" fill="${color}"/></svg>`;
  }

  // Normalize positions
  const xs = nodes.map(n => n.position?.x ?? 0);
  const ys = nodes.map(n => n.position?.y ?? 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const availW = WIDTH - PADDING * 2 - NODE_W;
  const availH = HEIGHT - PADDING * 2 - NODE_H;

  const nodeRects = nodes.map(n => {
    const nx = n.position?.x ?? 0;
    const ny = n.position?.y ?? 0;
    const x = PADDING + ((nx - minX) / rangeX) * availW;
    const y = PADDING + ((ny - minY) / rangeY) * availH;
    const color = getNodeColor(n.type);
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${NODE_W}" height="${NODE_H}" rx="2" fill="${color}"/>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><rect width="${WIDTH}" height="${HEIGHT}" fill="#18181b" rx="4"/>${nodeRects.join('')}</svg>`;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const canvas = db.prepare('SELECT flow_data FROM canvases WHERE id = ?').get(params.id) as { flow_data: string | null } | undefined;

    if (!canvas) {
      return NextResponse.json({ error: 'Canvas not found' }, { status: 404 });
    }

    const flowData: FlowData = canvas.flow_data
      ? JSON.parse(canvas.flow_data)
      : { nodes: [] };

    const nodes: CanvasNode[] = flowData.nodes || [];
    const svgString = generateSVG(nodes);

    db.prepare('UPDATE canvases SET thumbnail = ?, updated_at = datetime(\'now\') WHERE id = ?').run(svgString, params.id);

    return NextResponse.json({ thumbnail: svgString });
  } catch (error) {
    console.error('Error generating thumbnail:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
