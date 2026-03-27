import { useEffect, useState } from "react";
import { Tree, type NodeRendererProps } from "react-arborist";
import type { FileTreeNodeData } from "./file-tree-data.js";

interface FileTreeProps {
  nodes: FileTreeNodeData[];
  activeFilePath: string;
  onSelectFile: (filePath: string) => void;
}

export function FileTree({ nodes, activeFilePath, onSelectFile }: FileTreeProps) {
  const [height, setHeight] = useState(() => getTreeHeight());

  useEffect(() => {
    const onResize = () => setHeight(getTreeHeight());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <aside className="file-tree-panel">
      <div className="file-tree-panel__header">
        <div className="review-panel__title">Files</div>
        <div className="review-panel__meta">{nodes.length} top-level items</div>
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
          onSelect={(selectedNodes) => {
            const node = selectedNodes[0];
            if (node?.data.kind === "file") {
              onSelectFile(node.data.path);
            }
          }}
        >
          {FileTreeNode}
        </Tree>
      </div>
    </aside>
  );
}

function FileTreeNode({ node, style }: NodeRendererProps<FileTreeNodeData>) {
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
        }}
      >
        <span className="file-tree-node__label">
          {isDirectory ? (node.isOpen ? "▾" : "▸") : "•"} {node.data.name}
        </span>
        <span className="file-tree-node__stats">
          <span className="file-tree-node__annotations">{node.data.annotationCount}</span>
          <span className="file-tree-node__delta file-tree-node__delta--add">+{node.data.additions}</span>
          <span className="file-tree-node__delta file-tree-node__delta--del">-{node.data.deletions}</span>
        </span>
      </button>
    </div>
  );
}

function getTreeHeight(): number {
  return Math.max(window.innerHeight - 220, 280);
}
