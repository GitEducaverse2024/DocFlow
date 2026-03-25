'use client';

interface GoogleDriveWizardProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function GoogleDriveWizard({ open, onClose, onCreated }: GoogleDriveWizardProps) {
  if (!open) return null;
  return (
    <div>
      {/* Full implementation in Phase 85 */}
      <p>Google Drive Wizard placeholder</p>
    </div>
  );
}
