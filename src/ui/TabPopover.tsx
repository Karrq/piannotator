import { PlusIcon, GearIcon, TrashIcon } from "@primer/octicons-react";

interface TabPopoverProps {
  onNewVersion: () => void;
  onEditCommand: () => void;
  onDeleteTab: () => void;
  onClose: () => void;
  canDelete: boolean;
}

export function TabPopover({
  onNewVersion,
  onEditCommand,
  onDeleteTab,
  onClose,
  canDelete
}: TabPopoverProps) {
  return (
    <>
      <div className="tab-popover-overlay" role="presentation" onClick={onClose} />
      <div className="tab-popover" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="tab-popover__btn tab-popover__btn--new"
          onClick={() => { onNewVersion(); onClose(); }}
          title="Review a new version"
        >
          <PlusIcon size={16} />
        </button>
        <button
          type="button"
          className="tab-popover__btn tab-popover__btn--edit"
          onClick={() => { onEditCommand(); onClose(); }}
          title="Edit command"
        >
          <GearIcon size={16} />
        </button>
        <button
          type="button"
          className="tab-popover__btn tab-popover__btn--delete"
          onClick={() => { onDeleteTab(); }}
          disabled={!canDelete}
          title="Delete version"
        >
          <TrashIcon size={16} />
        </button>
      </div>
    </>
  );
}
