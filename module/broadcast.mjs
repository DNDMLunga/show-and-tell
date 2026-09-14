import { MODULE } from './const.mjs';
import { hasRole } from './utils.mjs';

const SOCKET = `module.${MODULE}`;

/**
 * Image-broadcast feature: a GM can show a token's portrait, or any journal
 * image, to every connected client (or, via Whisper Show, to chosen players
 * only) as an auto-closing ImagePopout.
 * Ported and generalized from "Let's Take a Look" (DNDMLunga/lets-take-a-look).
 *
 * Whisper-show caveat, worth knowing: targeting is client-side only, same as
 * every other Foundry module socket message (arbitrary "module.x" socket
 * events have no server-side recipient filtering the way core Documents do).
 * The broadcast payload reaches every connected client's browser; non-target
 * clients just don't render it. Fine for normal table use (nobody's opening
 * dev tools mid-session to peek), not a cryptographic guarantee.
 */
export default {
	/**
	 * Wire the broadcast socket listener. Call once, on 'ready'.
	 */
	_registerSocket() {
		game.socket.on(SOCKET, (data) => {
			if (data.userIds && !data.userIds.includes(game.user.id)) return;
			this._openAndMaybeAutoClose(data);
		});
	},

	/**
	 * Add the "Show Players" button to the Token HUD. Plain click shows
	 * everyone; Shift+Click opens the recipient picker (Whisper Show).
	 */
	_registerTokenHUDButton() {
		Hooks.on('renderTokenHUD', (app, html) => {
			// GM always passes (TokenDocument#isOwner is true for GM regardless of
			// the actor's own permissions); a player passes only on a token they own.
			if (!app.document.isOwner) return;

			const rightCol = html.querySelector('.col.right');
			if (!rightCol) return;

			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'control-icon';
			btn.dataset.tooltip = '';
			btn.setAttribute('aria-label', 'Show Players (Shift+Click to whisper to chosen players)');
			btn.innerHTML = `<i class="fa-solid fa-users-viewfinder" inert></i>`;
			btn.addEventListener('click', (event) => {
				if (event.shiftKey) this.whisperActorPortrait(app.actor);
				else this.broadcastActorPortrait(app.actor);
			});

			rightCol.appendChild(btn);
		});
	},

	/**
	 * Broadcast an actor's portrait to every connected client.
	 * Uses the "Token Portrait Timeout" setting.
	 * @param {Actor} actor
	 */
	broadcastActorPortrait(actor) {
		if (!actor) {
			ui.notifications.warn('This token has no actor.');
			return;
		}
		const timeout = game.settings.get(MODULE, 'PortraitTimeout');
		this.broadcastImage({ image: actor.img, uuid: actor.uuid, title: actor.name, timeout });
	},

	/**
	 * Whisper-show an actor's portrait: prompt for recipients, then broadcast
	 * to only those users.
	 * @param {Actor} actor
	 */
	async whisperActorPortrait(actor) {
		if (!actor) {
			ui.notifications.warn('This token has no actor.');
			return;
		}
		const userIds = await this._promptTargetUsers();
		if (!userIds) return;
		const timeout = game.settings.get(MODULE, 'PortraitTimeout');
		this.broadcastImage({ image: actor.img, uuid: actor.uuid, title: actor.name, timeout, userIds });
	},

	/**
	 * Broadcast a journal image to every connected client.
	 * Uses the separate "Journal Image Timeout" setting.
	 * @param {{image: string, title?: string}} data
	 */
	broadcastJournalImage({ image, title }) {
		const timeout = game.settings.get(MODULE, 'JournalImageTimeout');
		this.broadcastImage({ image, title, timeout });
	},

	/**
	 * Whisper-show a journal image: prompt for recipients, then broadcast to
	 * only those users.
	 * @param {{image: string, title?: string}} data
	 */
	async whisperJournalImage({ image, title }) {
		const userIds = await this._promptTargetUsers();
		if (!userIds) return;
		const timeout = game.settings.get(MODULE, 'JournalImageTimeout');
		this.broadcastImage({ image, title, timeout, userIds });
	},

	/**
	 * Broadcast an arbitrary image, optionally to specific users only.
	 * @param {{image: string, uuid?: string, title?: string, timeout: number, userIds?: string[]|null}} data
	 */
	broadcastImage({ image, uuid, title, timeout, userIds = null }) {
		if (!hasRole('PERMShow')) return;
		if (!image) {
			ui.notifications.warn('Nothing to show.');
			return;
		}
		const payload = { image, uuid, title: title || '', timeout, userIds };
		game.socket.emit(SOCKET, payload);
		if (!userIds || userIds.includes(game.user.id)) this._openAndMaybeAutoClose(payload);
	},

	/**
	 * Prompt the GM to pick which connected, non-self users receive a whisper
	 * show. Returns the chosen user IDs, or null if cancelled / nothing picked.
	 * @returns {Promise<string[]|null>}
	 */
	async _promptTargetUsers() {
		const candidates = game.users.filter((u) => u.active && u.id !== game.user.id);
		if (!candidates.length) {
			ui.notifications.warn('No other connected users to whisper to.');
			return null;
		}

		const rows = candidates
			.map(
				(u) => `
			<label class="checkbox">
				<input type="checkbox" name="user" value="${u.id}">
				${foundry.utils.escapeHTML(u.name)}
			</label>`,
			)
			.join('');

		const result = await foundry.applications.api.DialogV2.wait({
			window: { title: 'Whisper Show — Choose Recipients' },
			content: `<div class="show-and-tell-whisper-targets">${rows}</div>`,
			buttons: [
				{
					action: 'show',
					label: 'Show',
					icon: 'fa-solid fa-users-viewfinder',
					default: true,
					callback: (_event, _button, dialog) =>
						Array.from(dialog.element.querySelectorAll('input[name="user"]:checked')).map((el) => el.value),
				},
				{ action: 'cancel', label: 'Cancel' },
			],
			rejectClose: false,
		});

		if (!result || !result.length) {
			if (result) ui.notifications.warn('Pick at least one recipient, or use the regular Show button for everyone.');
			return null;
		}
		return result;
	},

	/**
	 * Open an ImagePopout locally and, if a timeout is set, close it automatically.
	 * Runs on every targeted client, including the one that triggered the share.
	 * @param {{image: string, uuid?: string, title?: string, timeout: number}} data
	 */
	_openAndMaybeAutoClose({ image, uuid, title, timeout }) {
		const ip = new foundry.applications.apps.ImagePopout({ src: image, uuid, window: { title } });
		ip.render({ force: true });
		if (timeout > 0) setTimeout(() => ip.close(), timeout * 1000);
	},
};
