/**
 * Show and Tell
 * Broadcast token portraits and journal images to players with one right-click,
 * plus a right-click Describe/Narrate menu for selected journal text.
 *
 * Combines and extends:
 *  - "Let's Take a Look" (DNDMLunga/lets-take-a-look) — token portrait broadcast.
 *  - "Narrator Tools" (elizeuangelo/fvtt-module-narrator-tools, CC-BY 4.0) —
 *    description/narration chat commands and the on-canvas narration display.
 * See README for the full attribution and feature list.
 */

import './compatibility/index.mjs';
import ShowAndTellApi from './module/api.mjs';

globalThis.ShowAndTell = ShowAndTellApi;

Hooks.on('setup', () => ShowAndTellApi._setup());
Hooks.on('ready', () => {
	ShowAndTellApi._ready();
	game.showAndTell = ShowAndTellApi;
});
Hooks.on('chatMessage', ShowAndTellApi._chatMessage.bind(ShowAndTellApi));
Hooks.on('renderChatMessageHTML', ShowAndTellApi._renderChatMessage.bind(ShowAndTellApi));
