import React, { useEffect, useMemo, useState } from 'react';
import { Q, formatNumber } from '../engine/rational.js';
import { Modal, ModalHeader } from './Modal.jsx';
import { Icon } from './Icons.jsx';
import { randomMatrix } from '../engine/matrix.js';

function emptyGrid(rows, cols) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => '0'));
}

function resizeGrid(grid, rows, cols) {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => grid[r]?.[c] ?? '0'),
  );
}

function validateName(name, existing, editingName) {
  const trimmed = name.trim();
  if (!trimmed) return '矩阵需要一个名字';
  if (!/^[A-Za-z][A-Za-z0-9_]{0,2}$/.test(trimmed)) return '名字需以字母开头，最多 3 个字符（字母、数字、下划线）';
  if (trimmed !== editingName && existing.includes(trimmed)) return `矩阵 ${trimmed} 已经存在`;
  return null;
}

export default function MatrixEditorModal({
  open,
  initial,
  suggestedName,
  existingNames,
  onClose,
  onSave,
  onDelete,
}) {
  const [name, setName] = useState('');
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [grid, setGrid] = useState(emptyGrid(3, 3));
  const [errors, setErrors] = useState({});
  const [nameError, setNameError] = useState(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState(null);
  const [note, setNote] = useState('');

  const isEditing = Boolean(initial);

  useEffect(() => {
    if (!open) return;
    const nextName = initial?.name || suggestedName || 'A';
    setName(nextName);
    setRows(initial?.rows || 2);
    setCols(initial?.cols || 2);
    setGrid(
      initial
        ? initial.data.map((row) => row.map((v) => formatNumber(v)))
        : emptyGrid(2, 2),
    );
    setNote(initial?.note || '');
    setErrors({});
    setNameError(null);
    setPasteOpen(false);
    setPasteText('');
    setPasteError(null);
  }, [open, initial, suggestedName]);

  const sizeLabel = useMemo(() => `${rows} × ${cols}`, [rows, cols]);

  if (!open) return null;

  const updateCell = (r, c, value) => {
    setGrid((current) =>
      current.map((line, ri) => (ri === r ? line.map((cell, ci) => (ci === c ? value : cell)) : line)),
    );
    if (errors[`${r},${c}`]) setErrors((current) => ({ ...current, [`${r},${c}`]: undefined }));
  };

  const changeRows = (value) => {
    const n = Math.max(1, Math.min(10, Number(value) || 1));
    setRows(n);
    setGrid((current) => resizeGrid(current, n, cols));
  };

  const changeCols = (value) => {
    const n = Math.max(1, Math.min(10, Number(value) || 1));
    setCols(n);
    setGrid((current) => resizeGrid(current, rows, n));
  };

  const fill = (kind) => {
    if (kind === 'zero') {
      setGrid(emptyGrid(rows, cols));
      return;
    }
    if (kind === 'identity') {
      setGrid(Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (r === c ? '1' : '0'))));
      return;
    }
    if (kind === 'random') {
      const random = randomMatrix(rows, cols, { min: -4, max: 5, zeroChance: 0.16 });
      setGrid(random.data.map((row) => row.map((v) => formatNumber(v))));
      return;
    }
    if (kind === 'ones') {
      setGrid(Array.from({ length: rows }, () => Array.from({ length: cols }, () => '1')));
    }
  };

  const applyPaste = () => {
    setPasteError(null);
    const lines = pasteText
      .trim()
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) {
      setPasteError('先粘贴一些数字，例如：\n1 2 3\n4 5 6');
      return;
    }
    const parsed = lines.map((line) => line.split(/[\s,;，]+/).filter(Boolean));
    const width = parsed[0].length;
    if (!width) {
      setPasteError('没有读到数字。');
      return;
    }
    if (parsed.some((line) => line.length !== width)) {
      setPasteError('每一行需要同样多的数字。');
      return;
    }
    if (parsed.length > 10 || width > 10) {
      setPasteError('演示矩阵最大为 10×10。');
      return;
    }
    const cellErrors = {};
    parsed.forEach((line, r) =>
      line.forEach((value, c) => {
        try {
          Q.parse(value);
        } catch {
          cellErrors[`${r},${c}`] = '数值格式有误';
        }
      }),
    );
    if (Object.keys(cellErrors).length) {
      setPasteError('有无法解析的数值，请使用整数、小数或 a/b 分数。');
      return;
    }
    setRows(parsed.length);
    setCols(width);
    setGrid(parsed);
    setErrors({});
    setPasteOpen(false);
    setPasteText('');
  };

  const submit = (event) => {
    event.preventDefault();
    const nextNameError = validateName(name, existingNames, initial?.name);
    setNameError(nextNameError);
    const cellErrors = {};
    const parsed = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        const value = grid[r]?.[c] ?? '';
        try {
          const rational = Q.parse(value);
          row.push(rational);
          if (String(value).trim() === '') cellErrors[`${r},${c}`] = '不能为空';
        } catch (error) {
          cellErrors[`${r},${c}`] = error.message;
        }
      }
      parsed.push(row);
    }
    setErrors(cellErrors);
    if (nextNameError || Object.keys(cellErrors).length) return;

    onSave({
      id: initial?.id || undefined,
      name: name.trim(),
      rows,
      cols,
      data: parsed,
      note: note.trim() || (isEditing ? initial.note : '自定义矩阵对象'),
    });
  };

  return (
    <Modal open={open} onClose={onClose} className="matrix-editor-modal" labelledBy="matrix-editor-title">
      <ModalHeader
        id="matrix-editor-title"
        eyebrow={isEditing ? 'EDIT MATRIX / 改写对象' : 'NEW MATRIX / 新建对象'}
        title={isEditing ? `改写矩阵 ${initial.name}` : '造一个矩阵'}
        description="任意形状、任意有理数。分数可以直接写成 a/b，小数会精确化为分数。"
        onClose={onClose}
      />

      <form onSubmit={submit} className="matrix-editor-form">
        <div className="editor-controls">
          <label className="field-group compact">
            <span>矩阵名</span>
            <input
              className={`editor-name-input ${nameError ? 'invalid' : ''}`}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              maxLength={3}
              spellCheck="false"
              autoFocus
            />
          </label>

          <div className="dimension-block">
            <span className="field-label">尺寸</span>
            <div className="dimension-control">
              <div className="dimension-field">
                <span>行</span>
                <button type="button" onClick={() => changeRows(rows - 1)} aria-label="减少行数">−</button>
                <input type="number" min="1" max="10" value={rows} onChange={(e) => changeRows(e.target.value)} />
                <button type="button" onClick={() => changeRows(rows + 1)} aria-label="增加行数">+</button>
              </div>
              <span className="dimension-times">×</span>
              <div className="dimension-field">
                <span>列</span>
                <button type="button" onClick={() => changeCols(cols - 1)} aria-label="减少列数">−</button>
                <input type="number" min="1" max="10" value={cols} onChange={(e) => changeCols(e.target.value)} />
                <button type="button" onClick={() => changeCols(cols + 1)} aria-label="增加列数">+</button>
              </div>
            </div>
          </div>

          <div className="editor-shape-badge">
            <span>SHAPE</span>
            <strong>{sizeLabel}</strong>
            <em>{rows * cols} 个精确数</em>
          </div>
        </div>

        <div className="editor-toolbar">
          <div className="fill-actions">
            <span className="field-label">快速填充</span>
            <button type="button" onClick={() => fill('zero')}>清零</button>
            <button type="button" onClick={() => fill('identity')}>单位阵</button>
            <button type="button" onClick={() => fill('ones')}>全 1</button>
            <button type="button" onClick={() => fill('random')}>随机</button>
          </div>
          <button type="button" className="paste-toggle" onClick={() => setPasteOpen((v) => !v)}>
            <Icon name="copy" size={13} /> 批量粘贴
          </button>
        </div>

        {pasteOpen && (
          <div className="paste-panel">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={'按行粘贴，列用空格、逗号或制表符分隔：\n2  1  -1\n0  3   4\n1  0   2'}
              rows={4}
            />
            <div className="paste-actions">
              <span>{pasteError || '支持整数、小数、分数，例如 -3/4。'}</span>
              <button type="button" className="small-dark-button" onClick={applyPaste}>读取数字</button>
            </div>
          </div>
        )}

        <div className="editor-grid-wrap">
          <div className="editor-grid-caption">
            <span>{name || 'M'} =</span>
            <em>每个格子直接输入整数、小数或 a/b</em>
          </div>
          <div
            className="editor-grid"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(62px, 88px))` }}
          >
            {grid.map((row, r) =>
              row.map((value, c) => (
                <label key={`${r}-${c}`} className={`cell-input ${errors[`${r},${c}`] ? 'invalid' : ''}`}>
                  <span className="cell-coord">{r + 1},{c + 1}</span>
                  <input
                    value={value}
                    onChange={(e) => updateCell(r, c, e.target.value)}
                    spellCheck="false"
                    aria-label={`第 ${r + 1} 行第 ${c + 1} 列`}
                  />
                </label>
              )),
            )}
          </div>
          {Object.keys(errors).length > 0 && (
            <p className="editor-error">有数值无法解析。请检查红色单元格，使用整数、小数或 a/b。</p>
          )}
        </div>

        <label className="field-group note-field">
          <span>一句话含义（可选）</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例如：把平面压向一条直线的投影"
            maxLength={64}
          />
        </label>

        {nameError && <div className="inline-form-error">{nameError}</div>}

        <div className="modal-actions">
          <div className="modal-actions-left">
            {isEditing && onDelete && (
              <button type="button" className="danger-button" onClick={() => onDelete(initial)}>
                <Icon name="trash" size={14} /> 删除
              </button>
            )}
          </div>
          <div className="modal-actions-right">
            <button type="button" className="ghost-button" onClick={onClose}>取消</button>
            <button type="submit" className="primary-button">
              <Icon name="check" size={15} /> {isEditing ? '保存修改' : '放入矩阵库'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
