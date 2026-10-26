import { useEffect, useState } from 'react';
import type { ProjectRecord } from '../workspace/project.js';
import { Icon } from './Icons.js';
import { Modal, ModalHeader } from './Modal.js';

interface ProjectModalProps {
  open: boolean;
  projects: readonly ProjectRecord[];
  activeProjectId: string;
  onClose: () => void;
  onSwitch: (projectId: string) => void;
  onCreate: (name: string) => void;
  onRename: (projectId: string, name: string) => void;
  onDelete: (projectId: string) => void;
}

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return '刚刚修改';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前修改`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前修改`;
  return new Date(timestamp).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

export default function ProjectModal({
  open,
  projects,
  activeProjectId,
  onClose,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
}: ProjectModalProps) {
  const [newName, setNewName] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const active = projects.find((project) => project.id === activeProjectId);

  useEffect(() => {
    if (!open) return;
    setNewName('');
    setRenameValue(active?.name ?? '');
    setRenaming(false);
  }, [open, active?.name]);

  if (!open) return null;

  const submitRename = (): void => {
    if (!active) return;
    const next = renameValue.trim();
    if (next && next !== active.name) onRename(active.id, next);
    setRenaming(false);
  };

  return (
    <Modal open={open} onClose={onClose} className="project-modal" labelledBy="project-title">
      <ModalHeader
        id="project-title"
        eyebrow="PROJECTS / 实验项目"
        title="每个项目，都是一套独立的数学现场"
        description="项目拥有自己的矩阵库、表达式与速度设置。切换项目不会丢失前一个现场。"
        onClose={onClose}
      />

      <div className="project-body">
        <section className="project-current">
          <span className="micro-label">CURRENT PROJECT / 当前项目</span>
          {active && (
            <div className="project-active-card">
              <div className="project-active-mark">01</div>
              <div className="project-active-copy">
                {renaming ? (
                  <div className="project-rename-row">
                    <input
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') submitRename();
                        if (event.key === 'Escape') setRenaming(false);
                      }}
                      autoFocus
                    />
                    <button type="button" onClick={submitRename}>保存</button>
                  </div>
                ) : (
                  <h3>{active.name}</h3>
                )}
                <p>{active.objects.length} 个矩阵对象 · {active.expression}</p>
                <span>{relativeTime(active.updatedAt)}</span>
              </div>
              <div className="project-active-actions">
                {!renaming && (
                  <button type="button" className="project-icon-button" onClick={() => setRenaming(true)} title="重命名当前项目">
                    <Icon name="edit" size={14} />
                  </button>
                )}
                <button
                  type="button"
                  className="project-icon-button danger"
                  onClick={() => onDelete(active.id)}
                  disabled={projects.length <= 1}
                  title="删除当前项目"
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </div>
          )}

          <div className="project-create">
            <span className="micro-label">NEW / 新建项目</span>
            <div className="project-create-row">
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="例如：特征分解练习"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    onCreate(newName.trim() || '新的数学现场');
                    setNewName('');
                  }
                }}
              />
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  onCreate(newName.trim() || '新的数学现场');
                  setNewName('');
                }}
              >
                <Icon name="plus" size={13} /> 创建并打开
              </button>
            </div>
          </div>
        </section>

        <section className="project-list-section">
          <div className="project-list-head">
            <span className="micro-label">ALL PROJECTS / 全部项目</span>
            <span>{projects.length} 个</span>
          </div>
          <div className="project-list">
            {[...projects]
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .map((project, index) => {
                const isActive = project.id === activeProjectId;
                return (
                  <article key={project.id} className={`project-row ${isActive ? 'active' : ''}`}>
                    <span className="project-row-index">{String(index + 1).padStart(2, '0')}</span>
                    <div className="project-row-copy">
                      <strong>{project.name}</strong>
                      <span>{project.objects.length} 个对象 · {project.expression || '空表达式'}</span>
                    </div>
                    <span className="project-row-time">{relativeTime(project.updatedAt)}</span>
                    {isActive ? (
                      <span className="project-open current">当前</span>
                    ) : (
                      <button type="button" className="project-open" onClick={() => onSwitch(project.id)}>
                        打开 <Icon name="arrow" size={11} />
                      </button>
                    )}
                  </article>
                );
              })}
          </div>
        </section>

        <div className="project-footer-note">
          <span>本地持久化</span>
          <span>项目切换不执行网络请求</span>
          <span>公式与算法仓库将在同一项目上下文里展开</span>
        </div>
      </div>
    </Modal>
  );
}
