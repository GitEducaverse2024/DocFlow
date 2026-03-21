import { permanentRedirect } from 'next/navigation';

export default function CanvasRedirect() {
  permanentRedirect('/tasks?from=canvas');
}
