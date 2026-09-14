import { MODULE } from './const.mjs';
import { hasRole } from './utils.mjs';

const SOCKET = `module.${MODULE}`;

/**
 * Image-broadcast feature: a GM can show a token's portrait, or any journal
 * image, to every connected client as an auto-closing ImagePopout.
 * Ported and generalized from "Let's Take a Look" (DNDMLunga/lets-take-a-look).
 */
export default {
	/**
	 * Wire the broadcast socket listener. Call once, on 'ready'.
	 */
	_registerSocket() {
		game.socket.on(SOCKET, (data) => this._openAndMaybeAutoClose(data));
	},

	/**
	 * Add the "Show Players" button to the Token HUD.
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
			btn.setAttribute('aria-label', 'Show Players');
			btn.innerHTML = `<i class="fa-solid fa-users-viewfinder" inert></i>`;
			btn.addEventListener('click', () => this.broadcastActorPortrait(app.actor));

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
	 * Broadcast a journal image to every connected client.
	 * Uses the separate "Journal Image Timeout" setting.
	 * @param {{image: string, title?: string}} data
	 */
	broadcastJournalImage({ image, title }) {
		const timeout = game.settings.get(MODULE, 'JournalImageTimeout');
		this.broadcastImage({ image, title, timeout });
	},

	/**
	 * Broadcast an arbitrary image to every connected client.
	 * @param {{image: string, uuid?: string, title?: string, timeout: number}} data
	 */
	broadcastImage({ image, uuid, title, timeout }) {
		if (!hasRole('PERMShow')) return;
		if (!image) {
			ui.notifications.warn('Nothing to show.');
			return;
		}
		const payload = { image, uuid, title: title || '', timeout };
		game.socket.emit(SOCKET, payload);
		this._openAndMaybeAutoClose(payload);
	},

	/**
	 * Open an ImagePopout locally and, if a timeout is set, close it automatically.
	 * Runs on every client, including the one that triggered the share.
	 * @param {{image: string, uuid?: string, title?: string, timeout: number}} data
	 */
	_openAndMaybeAutoClose({ image, uuid, title, timeout }) {
		const ip = new foundry.applications.apps.ImagePopout({ src: image, uuid, window: { title } });
		ip.render({ force: true });
		if (timeout > 0) setTimeout(() => ip.close(), timeout * 1000);
	},
};
