/**
 * Content Bridge — ISOLATED world thin bridge for chrome.* API access.
 *
 * Runs at document_start. Communicates with inject.js (MAIN world) via
 * CustomEvents on document.documentElement.
 *
 * Settings handshake:
 *   1. Bridge starts the settings read and registers VSC_REQUEST_SETTINGS
 *   2. MAIN world fires VSC_REQUEST_SETTINGS at document_idle
 *   3. Bridge responds with VSC_SETTINGS_READY once its storage snapshot is ready
 */

import { isBlacklisted } from '../utils/blacklist.js';
import { matchSiteRule } from '../utils/site-pattern.js';

// Speed limits for page→bridge write validation.
// Duplicated from constants.js (ISOLATED world can't import page modules).
const SPEED_MIN = 0.07;
const SPEED_MAX = 16;
const POSITION_LIMIT = 100000;
const MAX_SAVED_POSITIONS = 100;

const isCoordinate = (value) =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= POSITION_LIMIT;

async function saveControllerPosition(position) {
  const host = location.hostname.replace(/^www\./, '');
  const stored = await chrome.storage.sync.get({ controllerPositions: {} });
  const positions = { ...stored.controllerPositions };

  if (position === null) {
    delete positions[host];
  } else {
    delete positions[host];
    positions[host] = { top: Math.round(position.top), left: Math.round(position.left) };
    // Stay well below the per-item sync quota by evicting the oldest entries.
    for (const key of Object.keys(positions)) {
      if (Object.keys(positions).length <= MAX_SAVED_POSITIONS) {
        break;
      }
      delete positions[key];
    }
  }
  await chrome.storage.sync.set({ controllerPositions: positions });
}

const docEl = document.documentElement;
let bridgeInitialized = false;

function dispatchAbort() {
  docEl.dispatchEvent(new CustomEvent('VSC_SETTINGS_READY', { detail: { abort: true } }));
}

function init() {
  try {
    // Double-injection guard (module-level flag resets on page navigation)
    if (bridgeInitialized) {
      return;
    }
    bridgeInitialized = true;

    // Inherited about: documents have no trustworthy site URL available
    // without crossing into page context. Fail closed instead: supporting media
    // in these rare frames is less important than honoring disabled-site rules.
    if (location.protocol === 'about:') {
      docEl.addEventListener('VSC_REQUEST_SETTINGS', dispatchAbort, { once: true });
      return;
    }

    let disabledForDocument = false;
    let bridgeActive = false;

    // Start the read without awaiting it. The request listener is installed in
    // this same task, so MAIN cannot fire into the old listener-free window.
    const settingsReady = chrome.storage.sync.get(null).catch((error) => {
      console.error('[VSC] Initial settings load failed:', error);
      return null;
    });

    docEl.addEventListener(
      'VSC_REQUEST_SETTINGS',
      async () => {
        const settings = await settingsReady;
        if (!settings) {
          dispatchAbort();
          return;
        }

        // Legacy blacklist is consulted only before migration creates siteRules.
        const blacklisted = !settings.siteRules && isBlacklisted(settings.blacklist, location.href);
        const siteRuleMatch = matchSiteRule(settings.siteRules, location.href);
        const siteDisabled = siteRuleMatch && siteRuleMatch.enabled === false;
        if (disabledForDocument || settings.enabled === false || blacklisted || siteDisabled) {
          dispatchAbort();
          return;
        }

        const publicSettings = { ...settings };
        delete publicSettings.blacklist;
        delete publicSettings.enabled;
        bridgeActive = true;
        docEl.dispatchEvent(
          new CustomEvent('VSC_SETTINGS_READY', {
            detail: {
              settings: publicSettings,
              hostname: location.hostname.replace(/^www\./, ''),
            },
          })
        );
      },
      { once: true }
    );

    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace !== 'sync') {
        return;
      }

      const enabledChange = changes.enabled;
      if (enabledChange?.oldValue === false || enabledChange?.newValue === false) {
        // Any disabled state makes this document reload-only from here on.
        disabledForDocument = true;
      }
      if (enabledChange?.newValue === false) {
        bridgeActive = false;
        docEl.dispatchEvent(new CustomEvent('VSC_MESSAGE', { detail: { type: 'VSC_TEARDOWN' } }));
        return;
      }
      if (!bridgeActive) {
        return;
      }

      const relayChanges = { ...changes };
      delete relayChanges.enabled;
      delete relayChanges.blacklist;
      if (Object.keys(relayChanges).length > 0) {
        docEl.dispatchEvent(new CustomEvent('VSC_STORAGE_CHANGED', { detail: relayChanges }));
      }
    });

    chrome.runtime.onMessage.addListener((request) => {
      if (bridgeActive) {
        docEl.dispatchEvent(new CustomEvent('VSC_MESSAGE', { detail: request }));
      }
    });

    const handleWriteStorage = (e) => {
      try {
        if (!bridgeActive) {
          return;
        }

        const data = e.detail;
        if (!data || typeof data !== 'object') {
          return;
        }

        if ('controllerPosition' in data) {
          const position = data.controllerPosition;
          if (position === null || (isCoordinate(position?.top) && isCoordinate(position?.left))) {
            saveControllerPosition(position).catch((error) => {
              console.error('[VSC] Saving controller position failed:', error);
            });
          }
        }

        // Only lastSpeed and controllerPosition can cross from MAIN into extension storage.
        if ('lastSpeed' in data) {
          const speed = data.lastSpeed;
          if (typeof speed === 'number' && Number.isFinite(speed)) {
            chrome.storage.sync.set({
              lastSpeed: Math.min(Math.max(speed, SPEED_MIN), SPEED_MAX),
            });
          }
        }
      } catch (err) {
        if (err.message?.includes('Extension context invalidated')) {
          docEl.removeEventListener('VSC_WRITE_STORAGE', handleWriteStorage);
        }
      }
    };
    docEl.addEventListener('VSC_WRITE_STORAGE', handleWriteStorage);
  } catch (error) {
    console.error('[VSC] Bridge init failed:', error);
  }
}

init();
