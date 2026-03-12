import dynamic from 'next/dynamic';

const CanvasEditor = dynamic(
  () => import('@/components/canvas/canvas-editor').then(m => m.CanvasEditor),
  {
    ssr: false,
    loading: () => <div className="h-screen bg-zinc-950 animate-pulse" />,
  }
);

export default function CanvasPage({ params }: { params: { id: string } }) {
  return <CanvasEditor canvasId={params.id} />;
}
