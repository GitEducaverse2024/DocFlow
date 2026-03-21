export default function WelcomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Override the root layout's flex structure — render children full-screen
  // The welcome page handles its own centering
  return (
    <div className="fixed inset-0 z-50 bg-zinc-950">
      {children}
    </div>
  );
}
