import { MODULE } from './const.mjs';
import { ShowAndTellMenu } from './menu.mjs';
import Broadcast from './broadcast.mjs';
import { clamp, getSelectionHTML, hasRole, htmlToElement, localize, normalizeChatStyle } from './utils.mjs';

export default {
	...Broadcast,

	_element: htmlToElement(`
		<div id="show-and-tell-narrator" class="narrator">
			<div class="narrator-bg"></div>
			<div class="narrator-frame">
				<div class="narrator-frameBG"></div>
				<div class="narrator-box"><div class="narrator-content"></div></div>
				<div class="narrator-buttons" style="opacity:0;">
					<button class="ST-btn-pause" type="button"></button>
					<button class="ST-btn-close" type="button"></button>
					<button class="ST-btn-clipboard" type="button"></button>
				</div>
			</div>
		</div>
	`),
	character: '',
	_id: 0,
	_contentAnimation: null,
	isNarrator: false,
	messagesQueue: [],
	_timeouts: {
		narrationOpens: 0,
		narrationCloses: 0,
		narrationScrolls: 0,
	},
	elements: {},

	/**
	 * Register v14 chat command parser entries.
	 */
	_registerChatCommands() {
		const ChatLog = foundry.applications.sidebar?.tabs?.ChatLog ?? ui.chat?.constructor;
		if (!ChatLog?.CHAT_COMMANDS) {
			console.warn('Show and Tell: ChatLog.CHAT_COMMANDS was not available; slash commands were not registered.');
			return;
		}

		ChatLog.CHAT_COMMANDS['show-and-tell-as'] = {
			rgx: /^(\/as)(?:\s+([^]*))?$/i,
			fn: (_command, match) => {
				ShowAndTell.as(match[2] ?? '');
				return false;
			},
		};
		ChatLog.CHAT_COMMANDS['show-and-tell-description'] = {
			rgx: /^(\/desc(?:ribe|ription)?\s+)([^]*)/i,
			fn: (_command, match) => {
				ShowAndTell.createChatMessage('description', match[2]);
				return false;
			},
		};
		ChatLog.CHAT_COMMANDS['show-and-tell-notification'] = {
			rgx: /^(\/not(?:e|ify|ication)?\s+)([^]*)/i,
			fn: (_command, match) => {
				ShowAndTell.createChatMessage('notification', match[2]);
				return false;
			},
		};
		ChatLog.CHAT_COMMANDS['show-and-tell-narration'] = {
			rgx: /^(\/narrat(?:e|ion)\s+)([^]*)/i,
			fn: (_command, match) => {
				ShowAndTell.createChatMessage('narration', match[2]);
				return false;
			},
		};
	},

	/**
	 * Handle ordinary chat messages while a custom speaker alias is active.
	 * @param {any} _chatLog
	 * @param {string} content
	 * @returns {false|void}
	 */
	_chatMessage(_chatLog, content) {
		if (!hasRole('PERMAs') || !this.character || this._isCommandContent(content)) return;
		ChatMessage.create({
			style: CONST.CHAT_MESSAGE_STYLES.IC,
			content: content.replace(/\n/g, '<br>'),
			speaker: { alias: this.character },
		});
		return false;
	},

	/**
	 * Test whether chat input should be handled by Foundry's command parser.
	 * @param {string} content
	 * @returns {boolean}
	 */
	_isCommandContent(content) {
		const ChatLog = foundry.applications.sidebar?.tabs?.ChatLog ?? ui.chat?.constructor;
		try {
			const [command] = ChatLog?.parse?.(content) ?? ['none'];
			return command !== 'none';
		} catch (_error) {
			const template = document.createElement('template');
			template.innerHTML = content;
			return /^\/\S+/.test((template.content.textContent ?? content).trim());
		}
	},

	/**
	 * Set or clear the custom speaker alias used by /as.
	 * @param {string} alias
	 */
	as(alias) {
		if (!hasRole('PERMAs')) return;
		this.character = alias.trim();
		const input = document.getElementById('chat-message');
		if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
			input.placeholder = this.character ? `${localize('ST.SpeakingAs')} ${this.character}` : '';
		}
	},

	/**
	 * Control module behavior in response to shared narration-state changes.
	 * @param {{narration: NarrationState}} state
	 */
	_controller({ narration }) {
		if (!this.elements.content) return;

		if (!narration.display && this.elements.content.style.opacity === '1') {
			this.elements.BG.style.height = '0px';
			this.elements.buttons.style.opacity = '0';
			this.elements.buttons.style.visibility = 'hidden';
		}

		if (!narration.message) this.elements.content.style.opacity = '0';
		if (!narration.display) return;

		const scroll = () => {
			if (this.sharedState.narration.paused) return;

			let scrollDistance = this.elements.content.getBoundingClientRect().height - 290;
			let duration = this.messageDuration(this.sharedState.narration.message.length);
			if (scrollDistance > 20) {
				const currentTop = parseFloat(this.elements.content.style.top || '0') || 0;
				const remaining = 1 - currentTop / -scrollDistance;
				const durationMultiplier = Number(game.settings.get(MODULE, 'DurationMultiplier'));
				const scrollDuration = (duration - 500 - 4500 * durationMultiplier) * remaining;
				const startScroll = () => {
					this._animateContentTop(-scrollDistance, scrollDuration);
					this._timeouts.narrationScrolls = 0;
				};
				if (this.elements.content.style.top === '0px') {
					this._timeouts.narrationScrolls = window.setTimeout(startScroll, 3000 * durationMultiplier);
				} else {
					startScroll();
					duration = scrollDuration + 4500 * durationMultiplier;
				}
			}

			if (this.isNarrator) {
				if (this._timeouts.narrationCloses) clearTimeout(this._timeouts.narrationCloses);
				this._timeouts.narrationCloses = window.setTimeout(ShowAndTell._narrationClose, duration);
			}
		};

		if (narration.id !== this._id) {
			this._id = narration.id;
			clearTimeout(this._timeouts.narrationOpens);
			this.elements.content.style.opacity = '0';
			this._stopContentAnimation();
			this.elements.buttonCopy.style.display = game.settings.get(MODULE, 'Copy') ? '' : 'none';

			this._timeouts.narrationOpens = window.setTimeout(() => {
				this.elements.content.innerHTML = narration.message;
				this.elements.content.style.opacity = '1';
				this.elements.content.style.top = '0px';

				const height = Math.min(this.elements.content.getBoundingClientRect().height, 310);
				this.elements.BG.style.height = `${height * 3}px`;
				this.elements.buttons.style.opacity = '1';
				this.elements.buttons.style.visibility = 'visible';
				this.elements.buttons.style.top = `calc(50% + ${60 + height / 2}px)`;
				const paused = this.sharedState.narration.paused || game.settings.get(MODULE, 'NarrationStartPaused');
				this._updateStopButton(paused);
				this._timeouts.narrationOpens = 0;
				Hooks.call('narration', narration);
			}, 500);

			Hooks.once('narration', scroll);
		} else if (narration.paused) {
			if (this._timeouts.narrationScrolls) clearTimeout(this._timeouts.narrationScrolls);
			this._timeouts.narrationScrolls = 0;
			this._stopContentAnimation();
			if (this._timeouts.narrationCloses) clearTimeout(this._timeouts.narrationCloses);
			this._timeouts.narrationCloses = 0;
		} else {
			scroll();
		}
	},

	_setup() {
		this._registerChatCommands();
		this._registerGameSettings();
		this._registerTokenHUDButton();
	},

	_registerGameSettings() {
		game.settings.register(MODULE, 'sharedState', {
			name: 'Shared State',
			scope: 'world',
			config: false,
			default: {
				narration: {
					id: 0,
					display: false,
					new: false,
					message: '',
					paused: false,
				},
			},
			onChange: (newState) => this._controller(newState),
		});

		game.settings.registerMenu(MODULE, 'settingsMenu', {
			name: localize('Configure'),
			hint: '',
			label: localize('Configure'),
			icon: 'fas fa-adjust',
			type: ShowAndTellMenu,
			restricted: true,
		});

		game.settings.register(MODULE, 'FontSize', {
			name: 'Font Size',
			scope: 'world',
			config: false,
			default: '',
			type: String,
		});
		game.settings.register(MODULE, 'WebFont', {
			name: 'Web Font',
			scope: 'world',
			config: false,
			default: '',
			type: String,
			onChange: (value) => ShowAndTell._loadFont(value),
		});
		game.settings.register(MODULE, 'TextColor', {
			name: 'Text Color',
			scope: 'world',
			config: false,
			default: '',
			type: String,
		});
		game.settings.register(MODULE, 'TextShadow', {
			name: 'Text Shadow',
			scope: 'world',
			config: false,
			default: '',
			type: String,
		});
		game.settings.register(MODULE, 'TextCSS', {
			name: 'TextCSS',
			scope: 'world',
			config: false,
			default: '',
			type: String,
		});
		game.settings.register(MODULE, 'Copy', {
			name: 'Copy',
			scope: 'world',
			config: false,
			default: false,
			type: Boolean,
		});
		game.settings.register(MODULE, 'DurationMultiplier', {
			name: 'Duration Multiplier',
			scope: 'world',
			config: false,
			default: 1,
			type: Number,
		});
		game.settings.register(MODULE, 'BGColor', {
			name: 'Background Color',
			scope: 'world',
			config: false,
			default: '',
			type: String,
			onChange: (color) => ShowAndTell._updateBGColor(color),
		});
		game.settings.register(MODULE, 'BGImage', {
			name: 'Background Image',
			scope: 'world',
			config: false,
			default: '',
			type: String,
			onChange: (filePath) => ShowAndTell._updateBGImage(filePath),
		});
		game.settings.register(MODULE, 'NarrationStartPaused', {
			name: 'Start the Narration Paused',
			scope: 'world',
			config: false,
			default: false,
			type: Boolean,
		});
		game.settings.register(MODULE, 'MessageType', {
			name: "Narrator's message type",
			scope: 'world',
			config: false,
			default: CONST.CHAT_MESSAGE_STYLES.OTHER,
			type: Number,
		});
		game.settings.register(MODULE, 'PortraitTimeout', {
			name: 'Token Portrait Timeout',
			hint: 'Seconds before a broadcast token portrait closes on its own for everyone. 0 disables auto-close.',
			scope: 'world',
			config: false,
			default: 10,
			type: Number,
		});
		game.settings.register(MODULE, 'JournalImageTimeout', {
			name: 'Journal Image Timeout',
			hint: 'Seconds before a broadcast journal image closes on its own for everyone. 0 disables auto-close.',
			scope: 'world',
			config: false,
			default: 10,
			type: Number,
		});
		game.settings.register(MODULE, 'PERMShow', {
			name: 'Permission Required to Show images to players',
			scope: 'world',
			config: false,
			default: CONST.USER_ROLES.GAMEMASTER,
			type: Number,
		});
		game.settings.register(MODULE, 'PERMDescribe', {
			name: 'Permission Required to /describe and /note',
			scope: 'world',
			config: false,
			default: CONST.USER_ROLES.GAMEMASTER,
			type: Number,
		});
		game.settings.register(MODULE, 'PERMNarrate', {
			name: 'Permission Required to /narrate',
			scope: 'world',
			config: false,
			default: CONST.USER_ROLES.GAMEMASTER,
			type: Number,
		});
		game.settings.register(MODULE, 'PERMAs', {
			name: 'Permission Required to /as',
			scope: 'world',
			config: false,
			default: CONST.USER_ROLES.GAMEMASTER,
			type: Number,
		});
	},

	/**
	 * Apply narrator chat-message CSS classes after render.
	 * @param {ChatMessage} message
	 * @param {HTMLElement} html
	 */
	_renderChatMessage(message, html) {
		const type = message.getFlag(MODULE, 'type');
		if (!type) return;
		html.classList.add('narrator-chat');
		if (type === 'narration') html.classList.add('narrator-narrative');
		else if (type === 'description') html.classList.add('narrator-description');
		else if (type === 'notification') html.classList.add('narrator-notification');
	},

	_updateStopButton(pause) {
		this.elements.buttonPause.innerHTML = pause
			? `<i class="fas fa-play-circle"></i> ${localize('ST.PlayButton')}`
			: `<i class="fas fa-pause-circle"></i> ${localize('ST.PauseButton')}`;
	},

	_updateBGColor(color) {
		if (!this.elements.frameBG) return;
		color = (color ?? game.settings.get(MODULE, 'BGColor')) || '#000000';
		this.elements.frameBG.style.boxShadow = `inset 0 0 2000px 100px ${color}`;
		this.elements.BG.style.background = `linear-gradient(transparent 0%, ${color}a8 40%, ${color}a8 60%, transparent 100%)`;
	},

	_updateBGImage(filePath) {
		if (!this.elements.frameBG) return;
		filePath = filePath ?? game.settings.get(MODULE, 'BGImage') ?? '';
		if (!filePath) return;
		this.elements.frameBG.style.background = `url(${filePath})`;
		this.elements.frameBG.style.backgroundSize = '100% 100%';
	},

	_updateContentStyle() {
		if (!this.elements.content) return;
		const style = game.settings.get(MODULE, 'TextCSS');
		if (style) {
			const opacity = this.elements.content.style.opacity;
			this.elements.content.setAttribute('style', style);
			this.elements.content.style.opacity = opacity;
			return;
		}
		this.elements.content.style.fontFamily = game.settings.get(MODULE, 'WebFont') ? 'STCustomFont' : '';
		this.elements.content.style.fontSize = String(game.settings.get(MODULE, 'FontSize'));
		this.elements.content.style.color = String(game.settings.get(MODULE, 'TextColor'));
		this.elements.content.style.textShadow = String(game.settings.get(MODULE, 'TextShadow'));
	},

	/**
	 * Gets selected HTML/text from the document.
	 * @returns {string}
	 */
	_getSelectionText() {
		return getSelectionHTML();
	},

	/**
	 * Load a custom font face.
	 * @param {string} font
	 */
	_loadFont(font) {
		document.getElementById('showAndTellWebFont')?.remove();
		if (!font) return;
		const style = document.createElement('style');
		style.id = 'showAndTellWebFont';
		style.textContent = `@font-face {font-family: STCustomFont; src: url('${font}');}`;
		document.head.append(style);
	},

	_narrationClose() {
		const state = ShowAndTell.sharedState.narration;
		Hooks.call('narration_closes', { id: state.id, message: state.message });
		if (ShowAndTell._timeouts.narrationCloses) {
			clearTimeout(ShowAndTell._timeouts.narrationCloses);
			ShowAndTell._timeouts.narrationCloses = 0;
		}
		setTimeout(() => {
			if (state.id === ShowAndTell.sharedState.narration.id) {
				state.display = false;
				state.message = '';
				ShowAndTell.sharedState.narration = state;
			}
		}, 250);
	},

	_ready() {
		this.elements = {
			narrator: this._element,
			frame: this._element.querySelector('.narrator-frame'),
			frameBG: this._element.querySelector('.narrator-frameBG'),
			BG: this._element.querySelector('.narrator-bg'),
			box: this._element.querySelector('.narrator-box'),
			content: this._element.querySelector('.narrator-content'),
			buttons: this._element.querySelector('.narrator-buttons'),
			buttonPause: this._element.querySelector('.ST-btn-pause'),
			buttonClose: this._element.querySelector('.ST-btn-close'),
			buttonCopy: this._element.querySelector('.ST-btn-clipboard'),
		};

		this._updateBGColor();
		this._updateBGImage();
		document.body.append(this._element);

		this.isNarrator = game.user?.hasPermission('SETTINGS_MODIFY') && hasRole('PERMNarrate');
		this._registerSocket();
		this._registerSelectionMenu();

		this.elements.buttonPause.addEventListener('click', () => {
			const pause = !ShowAndTell.sharedState.narration.paused;
			ShowAndTell.sharedState.narration = {
				...ShowAndTell.sharedState.narration,
				paused: pause,
			};
			ShowAndTell._updateStopButton(pause);
		});
		this.elements.buttonClose.innerHTML = `<i class="fas fa-times-circle"></i> ${localize('Close')}`;
		this.elements.buttonClose.addEventListener('click', this._narrationClose);
		this.elements.buttonCopy.innerHTML = `<i class="fas fa-clipboard"></i> ${localize('ST.Copy')}`;
		this.elements.buttonCopy.addEventListener('click', () => {
			navigator.clipboard.writeText(this.elements.content.innerText);
			ui.notifications.info(localize('ST.CopyClipboard'));
		});

		if (!this.isNarrator) {
			this.elements.buttonPause.style.display = 'none';
			this.elements.buttonClose.style.display = 'none';
		}

		this._loadFont(game.settings.get(MODULE, 'WebFont'));
		this._updateContentStyle();
		this._controller(game.settings.get(MODULE, 'sharedState'));
	},

	chatMessage: {
		describe(message, options = {}) {
			return ShowAndTell.createChatMessage('description', message, options);
		},
		narrate(message, options = {}) {
			const queue = Array.isArray(message) ? message : [message];
			ShowAndTell.createChatMessage('narration', queue[0], options);
			ShowAndTell.messagesQueue = queue.slice(1);
			return ShowAndTell.messagesQueue;
		},
		notify(message, options = {}) {
			return ShowAndTell.createChatMessage('notification', message, options);
		},
	},

	/**
	 * Create a narrator chat message.
	 * @param {"description"|"narration"|"notification"|string} type
	 * @param {string} message
	 * @param {object} options
	 * @returns {Promise<ChatMessage|boolean|void>}
	 */
	createChatMessage(type, message, options = {}) {
		if (type === 'narration') {
			if (!hasRole('PERMNarrate')) return;
			if (!game.user?.hasPermission('SETTINGS_MODIFY')) {
				ui.notifications.error(localize('ST.CantModifySettings'));
				return;
			}
		} else if (!hasRole('PERMDescribe')) {
			return;
		}

		message = String(message ?? '')
			.replace(/\\n/g, '<br>')
			.replace(/\n/g, '<br>');
		const baseData = {
			content: message,
			flags: {
				[MODULE]: { type },
			},
			style: normalizeChatStyle(game.settings.get(MODULE, 'MessageType')),
			speaker: {
				alias: localize('ST.Narrator'),
				scene: canvas.scene?.id ?? game.user?.viewedScene,
			},
			whisper: type === 'notification' ? game.users.filter((user) => user.isGM).map((user) => user.id) : [],
		};
		const chatData = foundry.utils.mergeObject(baseData, options, { inplace: false });
		chatData.style = normalizeChatStyle(chatData.style);
		if (typeof chatData.type !== 'string') delete chatData.type;

		if (type === 'narration') {
			const narration = new Promise((resolve) => {
				Hooks.once('narration_closes', (closedNarration) => {
					const msg = this.messagesQueue.shift();
					if (msg) ShowAndTell.createChatMessage('narration', msg, options);
					resolve(closedNarration.message === message);
				});
			});

			if (this._timeouts.narrationOpens) clearTimeout(this._timeouts.narrationOpens);
			this._timeouts.narrationOpens = 0;
			if (this._timeouts.narrationCloses) clearTimeout(this._timeouts.narrationCloses);
			this._timeouts.narrationCloses = 0;

			this.sharedState.narration = {
				id: this.sharedState.narration.id + 1,
				display: true,
				message,
				paused: Boolean(game.settings.get(MODULE, 'NarrationStartPaused')),
			};

			ChatMessage.create(chatData, {});
			return narration;
		}

		return ChatMessage.create(chatData, {});
	},

	/**
	 * Calculate message display duration from message length.
	 * @param {number} length
	 * @returns {number}
	 */
	messageDuration(length) {
		return (clamp(length * 80, 2000, 20000) + 3000) * Number(game.settings.get(MODULE, 'DurationMultiplier')) + 500;
	},

	sharedState: {
		get narration() {
			return game.settings.get(MODULE, 'sharedState').narration;
		},
		set narration(state) {
			const sharedState = { ...game.settings.get(MODULE, 'sharedState'), narration: state };
			game.settings.set(MODULE, 'sharedState', sharedState);
		},
	},

	/**
	 * Register the single native ContextMenu covering journal content: Describe
	 * and Narrate show only when text is selected, Show Image shows only when
	 * the right-click landed on an <img>. Replaces Narrator Tools' hand-rolled
	 * '.nt-selection-menu' div with Foundry's own ContextMenu implementation so
	 * it looks and behaves like the rest of the app.
	 */
	_registerSelectionMenu() {
		const { ContextMenu } = foundry.applications.ux;

		new ContextMenu(document.body, '.journal-entry-pages, .editor-content', [
			{
				name: 'Describe',
				icon: '<i class="fas fa-comment"></i>',
				condition: () => Boolean(getSelectionHTML()),
				callback: () => {
					const selection = getSelectionHTML();
					if (selection) ShowAndTell.chatMessage.describe(selection);
				},
			},
			{
				name: 'Narrate',
				icon: '<i class="fas fa-comment-dots"></i>',
				condition: () => Boolean(getSelectionHTML()),
				callback: () => {
					const selection = getSelectionHTML();
					if (selection) ShowAndTell.chatMessage.narrate(selection);
				},
			},
			{
				name: 'Show Image to Players',
				icon: '<i class="fas fa-users-viewfinder"></i>',
				condition: (target) => Boolean(this._resolveContextImage(target)),
				callback: (target) => {
					const img = this._resolveContextImage(target);
					if (img) ShowAndTell.broadcastJournalImage({ image: img.src, title: img.alt || '' });
				},
			},
		], {
			eventName: 'contextmenu',
			fixed: true,
		});
	},

	/**
	 * Resolve a ContextMenu callback/condition target down to the actual <img>
	 * element that was right-clicked, if any. Handles both a raw HTMLElement
	 * and a jQuery-wrapped element depending on Foundry's ContextMenu version.
	 * @param {HTMLElement|JQuery} target
	 * @returns {HTMLImageElement|null}
	 */
	_resolveContextImage(target) {
		const el = target instanceof HTMLElement ? target : target?.[0];
		if (!(el instanceof HTMLElement)) return null;
		const img = el.matches?.('img') ? el : el.closest?.('img');
		return img instanceof HTMLImageElement ? img : null;
	},

	/**
	 * Animate the narration text vertically.
	 * @param {number} top
	 * @param {number} duration
	 */
	_animateContentTop(top, duration) {
		this._stopContentAnimation(false);
		const from = this.elements.content.style.top || '0px';
		const to = `${top}px`;
		this._contentAnimation = this.elements.content.animate([{ top: from }, { top: to }], {
			duration: Math.max(duration, 0),
			easing: 'linear',
			fill: 'forwards',
		});
		this._contentAnimation.onfinish = () => {
			this.elements.content.style.top = to;
			this._contentAnimation = null;
		};
	},

	/**
	 * Stop any active content animation.
	 * @param {boolean} preserveComputed
	 */
	_stopContentAnimation(preserveComputed = true) {
		if (!this._contentAnimation) return;
		if (preserveComputed) this.elements.content.style.top = getComputedStyle(this.elements.content).top;
		this._contentAnimation.cancel();
		this._contentAnimation = null;
	},
};
