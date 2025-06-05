# Global Chat

This project includes a Discord bot and relay hub.

## Node.js requirement

The bot relies on the global `fetch` API, which is available in **Node.js 18** and newer. Use Node 18 or later to run the bot.

If you must support older Node versions, install a `fetch` polyfill such as [`node-fetch`](https://www.npmjs.com/package/node-fetch) and import it before the bot code.
