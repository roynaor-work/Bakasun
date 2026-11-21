import { kidUxStyle } from '../kid-ux.mjs?v=island-v2-20261107-21';

kidUxStyle('001', `
  .modal.modal[data-game-library] .adventure-game-card .adventure-enter {
    min-width: 44px;
    min-height: 48px;
  }
`);

kidUxStyle('002', `
  .modal.modal:is([data-game-library], [data-game-home]) > .modal-close {
    width: 48px;
    height: 48px;
    min-width: 48px;
    min-height: 48px;
  }
  .modal.modal:is([data-game-library], [data-game-home]) > .sound-toggle {
    min-width: 48px;
    min-height: 48px;
    inset-inline-end: 72px;
    font-size: 14px;
  }
  .modal.modal:is([data-game-library], [data-game-home]) > h2 {
    margin-inline-end: 150px;
  }
`);

kidUxStyle('003', `
  .modal.modal[data-game-library] .adventure-game-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }
  .modal.modal[data-game-library] .adventure-game-card h3 {
    min-height: 2.4em;
    font-size: 16px;
    line-height: 1.25;
  }
  .modal.modal[data-game-library] :is(.adventure-enter, .adventure-new, .adventure-game-category, .modal-subtitle) {
    font-size: 14px;
  }
  .modal[data-game-library] .adventure-emblem[data-preview=unavailable]::after {
    font-size: 14px;
  }
  @media (max-width: 640px) {
    .modal.modal[data-game-library] .adventure-game-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
`);

kidUxStyle('004', `
  .modal[data-game-library] .offline-panel {
    background: #f4f0e4;
    color: #17333c;
    font-size: 14px;
  }
  .modal[data-game-library] .offline-panel :is(.offline-status, .offline-version, .offline-games, .load-report) {
    color: #17333c;
    font-size: 14px;
    opacity: 1;
  }
  .modal[data-game-library] .offline-panel :is(button, pre) {
    font-size: 14px;
  }
  .modal[data-game-library] .offline-panel .primary-button {
    background: #12695d;
    color: #fffdf2;
  }
  .modal[data-game-library] .offline-panel .secondary-button {
    background: #e5edeb;
    color: #17333c;
  }
`);
