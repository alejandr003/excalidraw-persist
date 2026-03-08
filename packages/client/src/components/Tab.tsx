import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Board } from '../types/types';
import { useBoardContext } from '../contexts/BoardProvider';
import '../styles/Tab.scss';
import Icon from './Icon';

interface TabProps {
  board: Board;
  activeBoardId: string | undefined;
}

const Tab = ({ board, activeBoardId }: TabProps) => {
  const { handleRenameBoard, handleArchiveBoard } = useBoardContext();
  const [showConfirm, setShowConfirm] = useState(false);

  const isActive = board.id === activeBoardId;

  const handleCloseClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowConfirm(true);
  };

  const handleConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowConfirm(false);
    handleArchiveBoard(board.id);
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowConfirm(false);
  };

  return (
    <>
      <Link
        key={board.id}
        to={`/board/${board.id}`}
        className={`tab ${isActive ? 'active' : ''}`}
        aria-current={isActive ? 'page' : undefined}
      >
        <label htmlFor={`board-name-input-${board.id}`} className="visually-hidden">
          Board Name
        </label>
        <input
          type="text"
          id={`board-name-input-${board.id}`}
          className="tab-name"
          value={board.name}
          onChange={e => handleRenameBoard(board.id, e.target.value)}
          aria-label={`Edit name for board ${board.name}`}
          readOnly={!isActive}
        />
        {isActive && (
          <button
            className="close-tab-button"
            onClick={handleCloseClick}
            aria-label={`Archive board ${board.name}`}
          >
            <Icon name="close" />
          </button>
        )}
      </Link>

      {showConfirm && (
        <div className="tab-confirm-overlay" onClick={handleCancel}>
          <div className="tab-confirm-dialog" onClick={e => e.stopPropagation()}>
            <p>Move <strong>{board.name}</strong> to trash?</p>
            <div className="tab-confirm-actions">
              <button className="tab-confirm-cancel" onClick={handleCancel}>
                Cancel
              </button>
              <button className="tab-confirm-ok" onClick={handleConfirm}>
                Move to trash
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Tab;

