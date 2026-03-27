import { ChevronDownIcon, ChevronRightIcon, FileDirectoryFillIcon, FileIcon, SidebarCollapseIcon, SidebarExpandIcon } from "@primer/octicons-react";
import { useEffect, useState } from "react";
import { Tree, type NodeRendererProps } from "react-arborist";
import type { FileTreeNodeData } from "./file-tree-data.js";

interface FileTreeProps {
  nodes: FileTreeNodeData[];
  activeFilePath: string;
  onSelectFile: (filePath: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function FileTree({ nodes, activeFilePath, onSelectFile, collapsed, onToggleCollapse }: FileTreeProps) {
  const [height, setHeight] = useState(() => getTreeHeight());

  useEffect(() => {
    const onResize = () => setHeight(getTreeHeight());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (collapsed) {
    return (
      <aside className="file-tree-panel file-tree-panel--collapsed">
        <button
          type="button"
          className="file-tree-panel__collapse-btn"
          onClick={onToggleCollapse}
          aria-label="Expand file tree"
        >
          <SidebarCollapseIcon size={16} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="file-tree-panel">
      <div className="file-tree-panel__header">
        <div>
          <div className="review-panel__title">Files</div>
          <div className="review-panel__meta">{nodes.length} top-level items</div>
        </div>
        {onToggleCollapse && (
          <button
            type="button"
            className="file-tree-panel__collapse-btn"
            onClick={onToggleCollapse}
            aria-label="Collapse file tree"
          >
            <SidebarExpandIcon size={16} />
          </button>
        )}
      </div>
      <div className="file-tree-panel__body">
        <Tree<FileTreeNodeData>
          data={nodes}
          width="100%"
          height={height}
          rowHeight={34}
          indent={18}
          padding={8}
          openByDefault
          disableDrag
          disableEdit
          selection={activeFilePath}
        >
          {(props) => <FileTreeNode {...props} onSelectFile={onSelectFile} />}
        </Tree>
      </div>
    </aside>
  );
}

interface FileTreeNodeProps extends NodeRendererProps<FileTreeNodeData> {
  onSelectFile: (filePath: string) => void;
}

function FileTreeNode({ node, style, onSelectFile }: FileTreeNodeProps) {
  const isDirectory = node.data.kind === "directory";

  return (
    <div style={style}>
      <button
        type="button"
        className={`file-tree-node ${node.isSelected ? "file-tree-node--selected" : ""}`}
        onClick={() => {
          if (isDirectory) {
            node.toggle();
            return;
          }

          node.select();
          node.activate();
          onSelectFile(node.data.path);
        }}
      >
        <span className="file-tree-node__label">
          {isDirectory ? (
            <span className="file-tree-node__chevron" aria-hidden="true">
              {node.isOpen ? <ChevronDownIcon size={16} /> : <ChevronRightIcon size={16} />}
            </span>
          ) : (
            <span className="file-tree-node__chevron" aria-hidden="true" />
          )}
          <span className={`file-tree-node__icon ${isDirectory ? "file-tree-node__icon--folder" : "file-tree-node__icon--file"}`}>
            {isDirectory ? <FileDirectoryFillIcon size={16} /> : <FileIcon size={16} />}
          </span>
          <span className="file-tree-node__name">{node.data.name}</span>
        </span>
        {!isDirectory ? (
          <span className="file-tree-node__stats">
            <span className="file-tree-node__annotations">{node.data.annotationCount}</span>
            <span className="file-tree-node__delta file-tree-node__delta--add">+{node.data.additions}</span>
            <span className="file-tree-node__delta file-tree-node__delta--del">-{node.data.deletions}</span>
          </span>
        ) : null}
      </button>
    </div>
  );
}

function getTreeHeight(): number {
  return Math.max(window.innerHeight - 196, 280);
}
