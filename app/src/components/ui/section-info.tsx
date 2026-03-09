interface SectionInfoProps {
  emoji: string;
  title: string;
  description: string;
  tips?: string[];
}

export function SectionInfo({ emoji, title, description, tips }: SectionInfoProps) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 mb-6">
      <div className="flex items-start gap-3">
        <span className="text-2xl">{emoji}</span>
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
          <p className="text-sm text-zinc-400 mt-1">{description}</p>
          {tips && tips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {tips.map((tip, i) => (
                <span key={i} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded-md">
                  💡 {tip}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
