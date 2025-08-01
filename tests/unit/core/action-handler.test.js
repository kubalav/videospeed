/**
 * Unit tests for ActionHandler class
 * Using global variables to match browser extension architecture
 */

import { installChromeMock, cleanupChromeMock, resetMockStorage } from '../../helpers/chrome-mock.js';
import { SimpleTestRunner, assert, createMockVideo, createMockDOM } from '../../helpers/test-utils.js';
import { loadCoreModules } from '../../helpers/module-loader.js';

// Load all required modules
await loadCoreModules();

const runner = new SimpleTestRunner();
let mockDOM;

runner.beforeEach(() => {
  installChromeMock();
  resetMockStorage();
  mockDOM = createMockDOM();

  // Initialize site handler manager for tests
  if (window.VSC && window.VSC.siteHandlerManager) {
    window.VSC.siteHandlerManager.initialize(document);
  }
});

runner.afterEach(() => {
  cleanupChromeMock();
  if (mockDOM) {
    mockDOM.cleanup();
  }
});

runner.test('ActionHandler should set video speed', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createMockVideo();
  mockVideo.vsc = { speedIndicator: { textContent: '1.00' } };
  config.addMediaElement(mockVideo);

  actionHandler.setSpeed(mockVideo, 2.0);

  assert.equal(mockVideo.playbackRate, 2.0);
  assert.equal(mockVideo.vsc.speedIndicator.textContent, '2.00');
  assert.equal(config.settings.lastSpeed, 2.0);
});

runner.test('ActionHandler should handle faster action', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createMockVideo({ playbackRate: 1.0 });
  mockVideo.vsc = {
    div: mockDOM.container,
    speedIndicator: { textContent: '1.00' }
  };
  config.addMediaElement(mockVideo);

  actionHandler.runAction('faster', 0.1);

  assert.equal(mockVideo.playbackRate, 1.1);
});

runner.test('ActionHandler should handle slower action', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createMockVideo({ playbackRate: 1.0 });
  mockVideo.vsc = {
    div: mockDOM.container,
    speedIndicator: { textContent: '1.00' }
  };
  config.addMediaElement(mockVideo);

  actionHandler.runAction('slower', 0.1);

  assert.equal(mockVideo.playbackRate, 0.9);
});

runner.test('ActionHandler should respect speed limits', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createMockVideo({ playbackRate: 16.0 });
  mockVideo.vsc = {
    div: mockDOM.container,
    speedIndicator: { textContent: '16.00' }
  };
  config.addMediaElement(mockVideo);

  // Should not exceed maximum speed
  actionHandler.runAction('faster', 1.0);
  assert.equal(mockVideo.playbackRate, 16.0);

  // Test minimum speed
  mockVideo.playbackRate = 0.07;
  actionHandler.runAction('slower', 0.1);
  assert.equal(mockVideo.playbackRate, 0.07);
});

runner.test('ActionHandler should handle pause action', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createMockVideo({ paused: false });
  mockVideo.vsc = { 
    div: mockDOM.container,
    speedIndicator: { textContent: '1.00' }
  };
  config.addMediaElement(mockVideo);

  actionHandler.runAction('pause');

  assert.true(mockVideo.paused);
});

runner.test('ActionHandler should handle mute action', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createMockVideo({ muted: false });
  mockVideo.vsc = { 
    div: mockDOM.container,
    speedIndicator: { textContent: '1.00' }
  };
  config.addMediaElement(mockVideo);

  actionHandler.runAction('muted');

  assert.true(mockVideo.muted);
});

runner.test('ActionHandler should handle volume actions', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createMockVideo({ volume: 0.5 });
  mockVideo.vsc = { 
    div: mockDOM.container,
    speedIndicator: { textContent: '1.00' }
  };
  config.addMediaElement(mockVideo);

  actionHandler.runAction('louder', 0.1);
  assert.equal(mockVideo.volume, 0.6);

  actionHandler.runAction('softer', 0.2);
  assert.equal(mockVideo.volume, 0.4);
});

runner.test('ActionHandler should handle seek actions', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createMockVideo({ currentTime: 50 });
  mockVideo.vsc = { 
    div: mockDOM.container,
    speedIndicator: { textContent: '1.00' }
  };
  config.addMediaElement(mockVideo);

  actionHandler.runAction('advance', 10);
  assert.equal(mockVideo.currentTime, 60);

  actionHandler.runAction('rewind', 5);
  assert.equal(mockVideo.currentTime, 55);
});

runner.test('ActionHandler should handle mark and jump actions', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createMockVideo({ currentTime: 30 });
  mockVideo.vsc = { 
    div: mockDOM.container,
    speedIndicator: { textContent: '1.00' }
  };
  config.addMediaElement(mockVideo);

  // Set mark
  actionHandler.runAction('mark');
  assert.equal(mockVideo.vsc.mark, 30);

  // Change time
  mockVideo.currentTime = 50;

  // Jump to mark
  actionHandler.runAction('jump');
  assert.equal(mockVideo.currentTime, 30);
});

runner.test('ActionHandler should work with mark/jump key bindings', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const actionHandler = new window.VSC.ActionHandler(config, null);
  const eventManager = new window.VSC.EventManager(config, actionHandler);
  actionHandler.eventManager = eventManager;

  const mockVideo = createMockVideo({ currentTime: 25 });
  mockVideo.vsc = {
    div: mockDOM.container,
    speedIndicator: { textContent: '1.00' },
    mark: undefined
  };
  config.addMediaElement(mockVideo);

  // Verify mark key binding exists (M = 77)
  const markBinding = config.settings.keyBindings.find(kb => kb.action === 'mark');
  assert.exists(markBinding, 'Mark key binding should exist');
  assert.equal(markBinding.key, 77, 'Mark should be bound to M key (77)');

  // Verify jump key binding exists (J = 74)
  const jumpBinding = config.settings.keyBindings.find(kb => kb.action === 'jump');
  assert.exists(jumpBinding, 'Jump key binding should exist');
  assert.equal(jumpBinding.key, 74, 'Jump should be bound to J key (74)');

  // Simulate pressing M key to set mark
  eventManager.handleKeydown({
    keyCode: 77,
    target: document.body,
    getModifierState: () => false,
    preventDefault: () => { },
    stopPropagation: () => { }
  });
  assert.equal(mockVideo.vsc.mark, 25, 'Mark should be set at current time');

  // Change video time
  mockVideo.currentTime = 60;

  // Simulate pressing J key to jump to mark
  eventManager.handleKeydown({
    keyCode: 74,
    target: document.body,
    getModifierState: () => false,
    preventDefault: () => { },
    stopPropagation: () => { }
  });
  assert.equal(mockVideo.currentTime, 25, 'Should jump back to marked time');
});

runner.test('ActionHandler should toggle display visibility', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const video = document.createElement('video');
  const controller = document.createElement('div');
  controller.className = 'vsc-controller';

  // Mock the video controller structure
  video.vsc = {
    div: controller,
    speedIndicator: document.createElement('span')
  };

  config.addMediaElement(video);

  // Initially controller should not be hidden
  assert.false(controller.classList.contains('vsc-hidden'));
  assert.false(controller.classList.contains('vsc-manual'));

  // First toggle - should hide
  actionHandler.runAction('display', null, null);
  assert.true(controller.classList.contains('vsc-hidden'));
  assert.true(controller.classList.contains('vsc-manual'));

  // Second toggle - should show
  actionHandler.runAction('display', null, null);
  assert.false(controller.classList.contains('vsc-hidden'));
  assert.true(controller.classList.contains('vsc-manual'));

  // Third toggle - should hide again
  actionHandler.runAction('display', null, null);
  assert.true(controller.classList.contains('vsc-hidden'));
  assert.true(controller.classList.contains('vsc-manual'));
});

runner.test('ActionHandler should work with videos in nested shadow DOM', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  // Create nested shadow DOM structure
  const host = document.createElement('div');
  const level1Shadow = host.attachShadow({ mode: 'open' });

  const nestedHost = document.createElement('div');
  level1Shadow.appendChild(nestedHost);
  const level2Shadow = nestedHost.attachShadow({ mode: 'open' });

  const mockVideo = createMockVideo({ playbackRate: 1.0 });
  level2Shadow.appendChild(mockVideo);

  document.body.appendChild(host);
  config.addMediaElement(mockVideo);

  // Create a proper mock speedIndicator that behaves like a real DOM element
  const mockSpeedIndicator = {
    textContent: '1.00',
    // Add other properties that might be needed
    nodeType: 1,
    tagName: 'SPAN'
  };

  // Mock video controller structure for shadow DOM video
  mockVideo.vsc = {
    div: mockDOM.container,
    speedIndicator: mockSpeedIndicator,
    // Add remove method to prevent errors during cleanup
    remove: () => { }
  };

  // Test speed change on shadow DOM video
  actionHandler.runAction('faster', 0.2);
  assert.equal(mockVideo.playbackRate, 1.2);

  // Test slower action
  actionHandler.runAction('slower', 0.1);
  assert.equal(mockVideo.playbackRate, 1.1);

  // Test direct speed setting
  actionHandler.setSpeed(mockVideo, 2.5);
  assert.equal(mockVideo.playbackRate, 2.5);
  assert.equal(mockVideo.vsc.speedIndicator.textContent, '2.50');
});

export { runner as actionHandlerTestRunner };