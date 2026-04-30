import type { ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export default function CenterModal({ open, title, onClose, children }: Props) {
  if (!open) return null;

  return (
    <>
      <button type="button" className="modal-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="modal-wrap" role="presentation">
        <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-header">
            <h2 id="modal-title" className="modal-title">
              {title}
            </h2>
            <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть">
              ×
            </button>
          </div>
          <div className="modal-scroll">{children}</div>
        </div>
      </div>
    </>
  );
}
