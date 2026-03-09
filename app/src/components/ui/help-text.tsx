import { HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface HelpTextProps {
  text: string;
  className?: string;
}

export function HelpText({ text, className = '' }: HelpTextProps) {
  return (
    <TooltipProvider delay={300}>
      <Tooltip>
        <TooltipTrigger className={`inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-400 transition-colors cursor-help ${className}`}>
          <HelpCircle className="w-3.5 h-3.5" />
          <span className="text-xs">{text.length > 60 ? text.substring(0, 60) + '...' : text}</span>
        </TooltipTrigger>
        {text.length > 60 && (
          <TooltipContent className="max-w-xs bg-zinc-900 border-zinc-800 text-zinc-300 text-xs p-3">
            <p>{text}</p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}
