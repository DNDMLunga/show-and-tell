/**
 * @typedef {object} NarrationState
 * @property {number} id
 * @property {boolean} display
 * @property {string} message
 * @property {boolean} paused
 */

import { MODULE } from './const.mjs';

/**
 * Localize a Foundry i18n key.
 * @param {string} key
 * @returns {string}
 */
export function localize(key) {
	return game.i18n.localize(key);
}

/**
 * Clamp a number between a minimum and maximum.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

/**
 * Is the current user's role at least the configured role threshold?
 * @param {string} setting
 * @returns {boolean}
 */
export function hasRole(setting) {
	return (game.user?.role ?? 0) >= Number(game.settings.get(MODULE, setting));
}

/**
 * Normalize the chat style setting to a valid v14 ChatMessage style.
 * @param {unknown} value
 * @returns {number}
 */
export function normalizeChatStyle(value) {
	const style = Number(value);
	const styles = Object.values(CONST.CHAT_MESSAGE_STYLES);
	return styles.includes(style) ? style : CONST.CHAT_MESSAGE_STYLES.OTHER;
}

/**
 * Create an HTMLElement from an HTML string.
 * @param {string} html
 * @returns {HTMLElement}
 */
export function htmlToElement(html) {
	const template = document.createElement('template');
	template.innerHTML = html.trim();
	return /** @type {HTMLElement} */ (template.content.firstElementChild);
}

/**
 * Get the current, non-collapsed text selection as HTML, or '' if nothing is selected.
 * @returns {string}
 */
export function getSelectionHTML() {
	let html = '';
	const selection = window.getSelection();
	if (selection?.rangeCount && !selection.isCollapsed) {
		const fragments = selection.getRangeAt(0).cloneContents();
		for (const child of fragments.childNodes) {
			html += child.nodeType === Node.TEXT_NODE ? child.textContent : child.outerHTML;
		}
	}
	return html;
}
